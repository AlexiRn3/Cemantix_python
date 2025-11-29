import asyncio
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from starlette.staticfiles import StaticFiles
from typing import Dict, List, Any, Optional
import time

from core.model_loader import ModelLoader
from core.rooms import RoomManager, RoomState

app = FastAPI()

# Chargement du modèle avec gestion d'erreur si le fichier est absent
try:
    loader = ModelLoader("model/frWac_no_postag_phrase_500_cbow_cut10_stripped.bin")
    model = loader.load()
    print("Modèle chargé avec succès.")
except Exception as e:
    print(f"Attention: Modèle non chargé ({e}). Seul le mode 'definition' fonctionnera.")
    model = None

room_manager = RoomManager(model)
app.mount("/static", StaticFiles(directory="static"), name="static")


class CreateRoomRequest(BaseModel):
    player_name: str
    mode: str = "coop"
    game_type: str = "cemantix"
    duration: int = 0


class GuessRequest(BaseModel):
    word: str
    player_name: str

class ResetRequest(BaseModel):
    player_name: str

class RoomConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.lock = asyncio.Lock()

    async def connect(self, room_id: str, websocket: WebSocket):
        await websocket.accept()
        async with self.lock:
            self.active_connections.setdefault(room_id, []).append(websocket)

    def disconnect(self, room_id: str, websocket: WebSocket):
        if room_id in self.active_connections:
            if websocket in self.active_connections[room_id]:
                self.active_connections[room_id].remove(websocket)

    async def broadcast(self, room_id: str, message: Dict[str, Any]):
        connections = list(self.active_connections.get(room_id, []))
        for connection in connections:
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(room_id, connection)


connections = RoomConnectionManager()


def build_scoreboard(room: RoomState):
    scoreboard = [
        {
            "player_name": name,
            "attempts": stats.attempts,
            "best_similarity": stats.best_similarity,
        }
        for name, stats in room.players.items()
    ]
    # Tri : meilleure similarité d'abord, puis nombre d'essais croissant
    scoreboard.sort(key=lambda x: (-x["best_similarity"], x["attempts"]))
    return scoreboard


def build_victory_message(room: RoomState, player_name: str):
    return {
        "type": "victory",
        "mode": room.mode,
        "player_name": player_name,
        "room_id": room.room_id,
        "winner": player_name
    }


# Ajout du typage de retour explicite -> Dict[str, Any] pour corriger l'erreur Pylance
def process_guess(room: RoomState, word: str, player_name: str) -> Dict[str, Any]:
    if room.mode == "blitz" and room.end_time > 0:
        if time.time() > room.end_time:
            room.locked = True
            return {"error": "time_up", "message": "Le temps est écoulé !"}

    if room.locked:
        return {"error": "room_locked", "message": "Cette room est verrouillée"}

    result = room.engine.guess(word)
    
    if not result.get("exists"):
        return {"error": "unknown_word", "message": result.get("error", "Mot inconnu")}

    similarity = result.get("similarity", 0.0)
    temperature = result.get("temperature", 0.0)
    feedback = result.get("feedback", "")
    victory = result.get("is_correct", False)

    # Enregistrement dans l'état de la room
    room.record_guess(word, player_name, similarity, temperature, feedback)

    blitz_data = {}

    if victory:
        if room.mode == "blitz":
            # En Blitz : On incrémente le score et on change de mot
            room.team_score += 1
            room.engine.next_word() 
            
            # ON STOCKE LES INFOS POUR LE PAYLOAD
            blitz_data = {
                "blitz_success": True,
                "new_public_state": room.engine.get_public_state(),
                "team_score": room.team_score
            }
        else:
            # Mode Classique : On verrouille
            if room.mode == "race" or room.mode == "coop":
                room.locked = True

    progression = int(round(similarity * 1000)) if room.game_type == "cemantix" else 0
    
    # ON INCLUT blitz_data DANS LE PAYLOAD DU WEBSOCKET
    guess_payload = {
        "type": "guess",
        "word": word,
        "player_name": player_name,
        "temperature": temperature,
        "similarity": similarity,
        "progression": progression,
        "feedback": feedback,
        "game_type": room.game_type,
        **blitz_data  # <--- C'EST ICI LA CLÉ : on fusionne les infos de victoire dans le message
    }
    
    return {
        "result": {**result, "progression": progression},
        "guess_payload": guess_payload,
        "scoreboard": build_scoreboard(room),
        "victory": victory and room.mode != "blitz", # Victoire standard seulement si pas blitz
    }



@app.get("/", response_class=HTMLResponse)
def hub_page():
    with open("static/hub.html", "r", encoding="utf-8") as f:
        return f.read()


@app.get("/game", response_class=HTMLResponse)
def game_page():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return f.read()


@app.post("/rooms")
def create_room(payload: CreateRoomRequest):
    # Vérification du modèle pour Cémantix
    if payload.game_type == "cemantix" and model is None:
        return JSONResponse(status_code=500, content={"message": "Le modèle Cémantix n'est pas chargé sur le serveur."})

    mode = payload.mode if payload.mode in {"coop", "race", "blitz"} else "coop"
    room = room_manager.create_room(payload.game_type, mode, payload.player_name)

    if payload.mode == "blitz" and payload.duration > 0:
        room.end_time = time.time() + payload.duration
    
    return {
        "room_id": room.room_id, 
        "mode": room.mode, 
        "scoreboard": build_scoreboard(room),
        "game_type": room.game_type
    }


@app.post("/rooms/{room_id}/guess")
async def guess(room_id: str, payload: GuessRequest):
    room = room_manager.get_room(room_id)
    if not room:
        return JSONResponse(status_code=404, content={"error": "room_not_found", "message": "Room inconnue"})

    result_data = process_guess(room, payload.word.strip().lower(), payload.player_name)
    
    if result_data.get("error"):
        return JSONResponse(status_code=400, content=result_data)

    # Ici result_data est garanti d'être le dictionnaire de succès grâce au check précédent
    await connections.broadcast(room_id, result_data["guess_payload"])
    
    victory = result_data.get("victory", False)
    
    # Mise à jour du scoreboard pour tout le monde
    await connections.broadcast(
        room_id,
        {
            "type": "scoreboard_update",
            "scoreboard": result_data["scoreboard"],
            "mode": room.mode,
            "locked": room.locked,
            "victory": victory,
            "winner": payload.player_name if victory else None,
        },
    )
    
    if victory:
        victory_msg = build_victory_message(room, payload.player_name)
        await connections.broadcast(room_id, victory_msg)

    return {
        **result_data["result"],
        "scoreboard": result_data["scoreboard"],
        "mode": room.mode,
        "locked": room.locked,
    }

@app.post("/rooms/{room_id}/reset")
async def reset_room(room_id: str, payload: ResetRequest):
    room = room_manager.get_room(room_id)
    if not room:
        return JSONResponse(status_code=404, content={"error": "room_not_found"})

    # On enregistre le vote
    all_ready = room.vote_reset(payload.player_name)

    if all_ready:
        # Tout le monde est prêt : on relance !
        room.reset_game()
        
        # On récupère le nouvel état public
        public_state = room.engine.get_public_state()
        
        await connections.broadcast(room_id, {
            "type": "game_reset",
            "public_state": public_state,
            "mode": room.mode,
            "scoreboard": build_scoreboard(room)
        })
        return {"status": "reset_done"}
    else:
        # On attend encore des joueurs
        # On calcule qui on attend
        waiting_for = [name for name in room.players if name not in room.reset_votes]
        
        await connections.broadcast(room_id, {
            "type": "reset_update",
            "current_votes": len(room.reset_votes),
            "total_players": len(room.players),
            "waiting_for": waiting_for
        })
        return {"status": "waiting"}


@app.websocket("/rooms/{room_id}/ws")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    player_name = websocket.query_params.get("player_name")
    room = room_manager.get_room(room_id)

    if not player_name:
        await websocket.accept()
        await websocket.send_json({"error": "missing_player_name", "message": "Pseudo requis"})
        await websocket.close()
        return

    if not room:
        await websocket.accept()
        await websocket.send_json({"error": "room_not_found", "message": "Room inconnue"})
        await websocket.close()
        return

    await connections.connect(room_id, websocket)
    room.add_player(player_name)
    
    # Récupération de l'état initial spécifique au jeu (ex: définition)
    public_state = room.engine.get_public_state()

    # Reconstruction de l'historique pour le nouveau venu
    history_payload = []
    for entry in room.history:
        progression = int(round(entry.similarity * 1000)) if entry.similarity is not None else 0
        history_payload.append(
            {
                "word": entry.word,
                "player_name": entry.player_name,
                "temperature": entry.temperature,
                "progression": progression,
                "feedback": entry.feedback,
                "game_type": room.game_type
            }
        )

    # Envoi de l'état initial (Sync)
    try:
        await websocket.send_json(
            {
                "type": "state_sync",
                "history": history_payload,
                "scoreboard": build_scoreboard(room),
                "mode": room.mode,
                "locked": room.locked,
                "game_type": room.game_type,
                "public_state": public_state,
                "end_time": room.end_time  # Pour le mode Blitz
            }
        )
        
        # On notifie les autres qu'un joueur est là (via update scoreboard)
        await connections.broadcast(room_id, {
            "type": "scoreboard_update",
            "scoreboard": build_scoreboard(room),
            "mode": room.mode,
            "locked": room.locked,
            "victory": False,
            "winner": None
        })

        # Boucle principale : on garde la connexion ouverte
        while True:
            # On ignore les messages entrants car tout passe par l'API REST /guess
            # Mais on doit garder le socket ouvert pour recevoir les broadcast
            await websocket.receive_text()
            
    except WebSocketDisconnect:
        connections.disconnect(room_id, websocket)
    except Exception:
        connections.disconnect(room_id, websocket)
        # On ne raise pas pour éviter de polluer les logs si c'est juste une déconnexion