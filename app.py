import asyncio
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from starlette.responses import FileResponse
from starlette.staticfiles import StaticFiles
from typing import Dict, List, Any, Optional
import time
from datetime import date, datetime
import httpx
import os

# Configurez l'URL du webhook Discord ici ou via une variable d'environnement
DISCORD_WEBHOOK_URL = os.environ.get("DISCORD_WEBHOOK_URL", None)
waiting_duel_room_id: Optional[str] = None

from core.model_loader import ModelLoader
from core.rooms import RoomManager, RoomState

app = FastAPI()


@app.get("/favicon.ico")
async def favicon():
    return FileResponse("favicon.ico")

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
# Rendre la playlist musicale disponible côté client pour éviter le hardcode des liens
app.mount("/music", StaticFiles(directory="music"), name="music")

class BugReportRequest(BaseModel):
    player_name: str
    description: str
    context: str = "Inconnu"

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

    # --- AJOUT : DÉTECTION DÉFAITE ---
    defeat = False
    target_reveal = ""
    
    if room.game_type == "hangman":
        # Si on a 0 vies ou moins, et que ce n'est pas une victoire
        if result.get("lives", 1) <= 0 and not victory:
            defeat = True
            room.locked = True # On verrouille la room
            # On récupère le mot pour l'afficher aux joueurs
            target_reveal = getattr(room.engine, "target_word", "???")

    # Enregistrement dans l'état de la room
    room.record_guess(word, player_name, similarity, temperature, feedback)

    blitz_data = {}

    if victory:
        pass
        if room.mode == "blitz":
            # En Blitz : On incrémente le score et on change de mot
            room.team_score += 1
            room.engine.next_word() 
            
            # ON STOCKE LES INFOS POUR LE PAYLOAD
            blitz_data = {
                "blitz_success": True,
                "new_public_state": room.engine.get_public_state(),
            }
        else:
            # Mode Classique : On verrouille
            if room.mode == "race" or room.mode == "coop":
                room.locked = True
    else:
        # --- AJOUT : Pénalité en cas d'erreur ---
        if room.mode == "blitz":
            room.team_score -= 1

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
        "team_score": room.team_score,
        "defeat": defeat,
        "target_reveal": target_reveal,
        **result,
        **blitz_data  # <--- C'EST ICI LA CLÉ : on fusionne les infos de victoire dans le message
    }
    
    return {
        "result": {**result, "progression": progression},
        "guess_payload": guess_payload,
        "scoreboard": build_scoreboard(room),
        "victory": victory and room.mode != "blitz", # Victoire standard seulement si pas blitz
    }


@app.post("/rooms/join_random")
def join_random_duel(payload: CreateRoomRequest):
    global waiting_duel_room_id
    
    # 1. Vérifier si une salle attend un joueur
    if waiting_duel_room_id:
        room = room_manager.get_room(waiting_duel_room_id)
        # On vérifie si la room est valide et n'est pas pleine (juste au cas où)
        if room and len(room.players) < 2:
            # On retourne cette room et on vide la file d'attente
            joined_room_id = waiting_duel_room_id
            waiting_duel_room_id = None
            return {
                "room_id": joined_room_id,
                "mode": room.mode,
                "game_type": room.game_type,
                "is_new": False
            }
        else:
            # La room n'est plus valide, on reset
            waiting_duel_room_id = None

    # 2. Sinon, on crée une nouvelle salle
    # On force les paramètres du duel
    try:
        room = room_manager.create_room("duel", "blitz", payload.player_name)
        room.duration = 60 # Durée fixe pour le duel
        # NOTE : On ne définit pas end_time ici, on attend le 2ème joueur
        
        waiting_duel_room_id = room.room_id
        
        return {
            "room_id": room.room_id,
            "mode": room.mode,
            "game_type": room.game_type,
            "is_new": True
        }
    except Exception as exc:
        return JSONResponse(status_code=503, content={"message": "Erreur création duel", "detail": str(exc)})

@app.post("/report-bug")
async def report_bug(report: BugReportRequest):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] User: {report.player_name} | Context: {report.context} | Bug: {report.description}\n"
    
    # 1. Sauvegarde locale dans un fichier
    try:
        with open("bugs.log", "a", encoding="utf-8") as f:
            f.write(log_entry)
    except Exception as e:
        print(f"Erreur écriture log: {e}")

    # 2. Envoi vers Discord (si configuré)
    if DISCORD_WEBHOOK_URL:
        async with httpx.AsyncClient() as client:
            try:
                discord_payload = {
                    "content": f"🐛 **Nouveau Rapport de Bug !**",
                    "embeds": [{
                        "title": f"Contexte : {report.context}",
                        "color": 15158332, # Rouge
                        "fields": [
                            {"name": "Joueur", "value": report.player_name, "inline": True},
                            {"name": "Description", "value": report.description}
                        ],
                        "footer": {"text": timestamp}
                    }]
                }
                await client.post(DISCORD_WEBHOOK_URL, json=discord_payload)
            except Exception as e:
                print(f"Erreur envoi Discord: {e}")

    return {"message": "Signalement reçu, merci !"}

@app.get("/rooms/{room_id}/check")
def check_room_exists(room_id: str):
    room = room_manager.get_room(room_id)
    if room:
        return {"exists": True, "mode": room.mode}
    return JSONResponse(status_code=404, content={"exists": False, "message": "Room introuvable"})

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

    needs_model = payload.game_type in ["cemantix", "dictionnario", "intruder", "hangman"]
    
    if needs_model and model is None:
        return JSONResponse(status_code=500, content={"message": "Le modèle sémantique n'est pas chargé."})
    
    # Vérification du modèle pour Cémantix
    if payload.game_type == "cemantix" and model is None:
        return JSONResponse(status_code=500, content={"message": "Le modèle Cémantix n'est pas chargé sur le serveur."})

    mode = payload.mode if payload.mode in {"coop", "race", "blitz", "daily"} else "coop"
    try:
        room = room_manager.create_room(payload.game_type, mode, payload.player_name)
    except Exception as exc:
        error_message = "Impossible de créer une partie de définition pour le moment." if payload.game_type == "definition" else "Erreur lors de la création de la partie."
        return JSONResponse(status_code=503, content={"message": error_message, "detail": str(exc)})

    if payload.mode == "blitz" and payload.duration > 0:
        room.duration = payload.duration
        if payload.game_type != "duel":
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

        # --- AJOUT BLITZ : On relance le chrono ---
        if room.mode == "blitz" and room.duration > 0:
            room.end_time = time.time() + room.duration
            room.team_score = 0 # On remet le score d'équipe à 0
        # ------------------------------------------
        
        # On récupère le nouvel état public
        public_state = room.engine.get_public_state()
        
        await connections.broadcast(room_id, 
        {
            "type": "game_reset",
            "public_state": public_state,
            "mode": room.mode,
            "scoreboard": build_scoreboard(room),
            "end_time": room.end_time
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
    

@app.get("/rooms/{room_id}/check_pseudo")
def check_pseudo_availability(room_id: str, player_name: str):
    room = room_manager.get_room(room_id)
    if not room:
        return JSONResponse(status_code=404, content={"available": False, "message": "Room introuvable"})
    
    if player_name in room.active_players:
        return JSONResponse(
            status_code=409, 
            content={
                "available": False, 
                "message": f"Le pseudo '{player_name}' est déjà pris par un joueur connecté."
            }
        )
    
    return {"available": True}

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
    
    if room.game_type == "duel":
        if len(room.active_players) >= 2:
            await websocket.accept()
            await websocket.send_json({"error": "room_full", "message": "Ce duel est complet (2 joueurs max)."})
            await websocket.close()
            return


    await connections.connect(room_id, websocket)
    room.add_player(player_name)
    room.active_players.add(player_name)

    just_started = False
    if room.game_type == "duel" and len(room.players) == 2 and room.end_time == 0:
        room.end_time = time.time() + room.duration
        just_started = True
    
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
                "end_time": room.end_time,
                "duration": room.duration,
            }
        )

        await connections.broadcast(
            room_id,
            {
                "type": "scoreboard_update",
                "scoreboard": build_scoreboard(room),
                "mode": room.mode,
                "locked": room.locked,
                "victory": False,
                "winner": None,
            },
        )

        if just_started:
            await connections.broadcast(
                room_id,
                {
                    "type": "game_start", # Nouveau type de message
                    "end_time": room.end_time,
                    "message": "Le duel commence !"
                }
            )

        while True:
            data = await websocket.receive_json()

            if data.get("type") == "chat":
                content = data.get("content", "").strip()
                if content:
                    room.add_chat_message(player_name, content)

                    await connections.broadcast(
                        room_id,
                        {
                            "type": "chat_message",
                            "player_name": player_name,
                            "content": content,
                        },
                    )

    except WebSocketDisconnect:
        connections.disconnect(room_id, websocket)
        room.active_players.discard(player_name)
        global waiting_duel_room_id
        # Si la room était en attente et qu'elle se vide, on la retire de la file
        if waiting_duel_room_id == room_id and len(room.active_players) == 0:
            print(f"[DUEL] Room d'attente {room_id} abandonnée par le créateur.")
            waiting_duel_room_id = None

    except Exception:
        connections.disconnect(room_id, websocket)
        room.active_players.discard(player_name)