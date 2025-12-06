import asyncio
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from starlette.responses import FileResponse
from starlette.staticfiles import StaticFiles
from typing import Dict, List, Any, Optional
import time
from datetime import date, datetime
import httpx
import os
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv
from core.models import User
from core.database import engine, Base, get_db
from core.auth import get_password_hash, verify_password, create_access_token, SECRET_KEY, ALGORITHM
from sqlalchemy import select
from pydantic import BaseModel, field_validator
from sqlalchemy import update
import sqlalchemy
import asyncpg
from sqlalchemy.ext.asyncio import AsyncSession
import re

print(f"🔍 VERSION ASYNCPG CHARGÉE : {asyncpg.__version__}")
print(f"📂 EMPLACEMENT ASYNCPG : {asyncpg.__file__}")
print(f"🔍 VERSION SQLALCHEMY : {sqlalchemy.__version__}")

env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

print("Chargement du fichier .env depuis :", end=" ")
print(env_path)

webhook_url = os.environ.get("DISCORD_WEBHOOK_URL")
if webhook_url:
    print(f"✅ Webhook chargé : {webhook_url[:30]}...")
else:
    print("❌ Webhook NON trouvé. Vérifiez le fichier .env")

ADMIN_LOG_PASSWORD = os.environ.get("ADMIN_LOG_PASSWORD")
if ADMIN_LOG_PASSWORD:
    print("🔒 Mot de passe admin chargé pour la consultation des logs.")
else:
    print("⚠️ Aucun mot de passe admin configuré. La page des logs sera indisponible.")

# Configurez l'URL du webhook Discord ici ou via une variable d'environnement
DISCORD_WEBHOOK_URL = webhook_url
waiting_duel_room_id: Optional[str] = None

from core.model_loader import ModelLoader
from core.rooms import RoomManager, RoomState

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

app = FastAPI(lifespan=lifespan)

LOG_FILE_PATH = Path("bugs.log")

class UserAuth(BaseModel):
    username: str
    password: str

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


class AdminLogRequest(BaseModel):
    password: str

class SurrenderRequest(BaseModel):
    player_name: str
    vote: bool

class UserCreate(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class SaveGameRequest(BaseModel):
    save_data: Dict[str, Any]

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

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Impossible de valider les identifiants",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        # Correction de l'erreur de type : on laisse Python inférer le type ou on cast si besoin
        username = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    # On utilise select(User) pour l'async
    result = await db.execute(select(User).where(User.username == str(username)))
    user = result.scalars().first()
    if user is None:
        raise credentials_exception
    return user

async def get_current_admin_user(current_user: User = Depends(get_current_user)):
    # Correction de l'erreur Column[bool] : on vérifie que current_user est bien une instance
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Droits d'administrateur requis"
        )
    return current_user

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
        **blitz_data
    }
    
    return {
        "result": {**result, "progression": progression},
        "guess_payload": guess_payload,
        "scoreboard": build_scoreboard(room),
        "victory": victory and room.mode != "blitz",
    }

@app.get("/admin/users")
async def get_all_users(admin: User = Depends(get_current_admin_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User))
    users = result.scalars().all()
    return users


@app.delete("/admin/users/{user_id}")
async def delete_user(user_id: int, admin: User = Depends(get_current_admin_user), db: AsyncSession = Depends(get_db)):
    # 1. On cherche l'utilisateur dans la base de données
    result = await db.execute(select(User).where(User.id == user_id))
    user_to_delete = result.scalars().first()

    # 2. S'il n'existe pas, on renvoie une erreur 404
    if not user_to_delete:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    # 3. Sécurité : Empêcher de se supprimer soi-même (optionnel mais conseillé)
    if user_to_delete.id == admin.id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas supprimer votre propre compte admin.")

    # 4. Suppression et validation
    await db.delete(user_to_delete)
    await db.commit()

    return {"status": "User deleted", "username": user_to_delete.username}


@app.on_event("startup")
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


@app.get("/users/{username}/stats")
async def get_user_stats(username: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
        
    return {
        "username": user.username,
        "games_played": user.games_played,
        "cemantix_wins": user.cemantix_wins,
        "cemantix_surrenders": user.cemantix_surrenders,
        "hangman_wins": user.hangman_wins,
        "daily_wins": user.daily_challenges_validated
    }

print("Chargement de la route /surrender...")
@app.post("/rooms/{room_id}/surrender")
async def surrender_room(room_id: str, payload: SurrenderRequest, db: AsyncSession = Depends(get_db)):    
    room = room_manager.get_room(room_id)
    if not room:
        return JSONResponse(status_code=404, content={"error": "room_not_found"})

    if room.mode == "daily":
        return JSONResponse(status_code=403, content={"message": "Impossible d'abandonner le défi quotidien !"})

    current_time = time.time()
    if room.surrender_cooldown > current_time:
        remaining = int(room.surrender_cooldown - current_time)
        return JSONResponse(status_code=429, content={"message": f"Attendez {remaining}s avant de redemander."})

    if not payload.vote:

        room.surrender_votes.clear()
        room.surrender_active = False
        room.surrender_cooldown = current_time + 30.0 
        
        await connections.broadcast(room_id, {
            "type": "surrender_cancel",
            "message": f"{payload.player_name} a refusé l'abandon.",
            "cooldown": 30
        })
        return {"status": "cancelled"}

    room.surrender_votes.add(payload.player_name)
    room.surrender_active = True
    
    active_count = len(room.active_players) if room.active_players else 1
    vote_count = len(room.surrender_votes)

    if vote_count >= active_count:

        for p_name in room.active_players:
            res = await db.execute(select(User).where(User.username == p_name))
            u = res.scalars().first()
            if u:
                u.games_played += 1
                if room.game_type == "cemantix":
                    u.cemantix_surrenders += 1
            await db.commit()

        target_word = getattr(room.engine, "target_word", "Inconnu")
        room.locked = True
        room.surrender_votes.clear()
        room.surrender_active = False
        
        await connections.broadcast(room_id, {
            "type": "surrender_success",
            "word": target_word,
            "player_name": payload.player_name
        })
        return {"status": "success"}

    else:
        await connections.broadcast(room_id, {
            "type": "surrender_vote_start",
            "initiator": payload.player_name,
            "current_votes": vote_count,
            "total_players": active_count
        })
        return {"status": "vote_pending"}
    

@app.post("/auth/register")
async def register(user_data: UserAuth, db = Depends(get_db)):
    # Vérifie si l'utilisateur existe déjà
    result = await db.execute(select(User).where(User.username == user_data.username))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Ce pseudo est déjà pris.")
    
    # Création du compte
    hashed_pw = get_password_hash(user_data.password)
    new_user = User(username=user_data.username, hashed_password=hashed_pw)
    db.add(new_user)
    try:
        await db.commit()
        await db.refresh(new_user)
        # On connecte directement l'utilisateur après inscription
        access_token = create_access_token(data={"sub": new_user.username})
        return {"access_token": access_token, "token_type": "bearer", "username": new_user.username}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/auth/login")
async def login(user_data: UserAuth, db = Depends(get_db)):
    # Recherche de l'utilisateur
    result = await db.execute(select(User).where(User.username == user_data.username))
    user = result.scalars().first()
    
    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Pseudo ou mot de passe incorrect.")
    
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, 
            "token_type": "bearer", 
            "username": user.username, 
            "is_admin": user.is_admin
        }

@app.post("/rooms/join_random")
def join_random_duel(payload: CreateRoomRequest):
    global waiting_duel_room_id
    
    if waiting_duel_room_id:
        room = room_manager.get_room(waiting_duel_room_id)
        if room and len(room.players) < 2:
            joined_room_id = waiting_duel_room_id
            waiting_duel_room_id = None
            return {
                "room_id": joined_room_id,
                "mode": room.mode,
                "game_type": room.game_type,
                "is_new": False
            }
        else:
            waiting_duel_room_id = None

    try:
        room = room_manager.create_room("duel", "blitz", payload.player_name)
        room.duration = 60
        waiting_duel_room_id = room.room_id
        
        return {
            "room_id": room.room_id,
            "mode": room.mode,
            "game_type": room.game_type,
            "is_new": True
        }
    except Exception as exc:
        print(f"Erreur Duel: {exc}")
        return JSONResponse(status_code=503, content={"message": "Erreur création duel", "detail": str(exc)})

@app.post("/report-bug")
async def report_bug(report: BugReportRequest):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] User: {report.player_name} | Context: {report.context} | Bug: {report.description}\n"

    try:
        with LOG_FILE_PATH.open("a", encoding="utf-8") as f:
            f.write(log_entry)
    except Exception as e:
        print(f"Erreur écriture log: {e}")

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
                print(f"Tentative d'envoi vers {DISCORD_WEBHOOK_URL}...")
                response = await client.post(DISCORD_WEBHOOK_URL, json=discord_payload)
                if response.status_code in [200, 204]:
                    print("✅ Message Discord envoyé !")
                else:
                    print(f"⚠️ Erreur Discord: {response.status_code} - {response.text}")
            except Exception as e:
                print(f"Erreur envoi Discord: {e}")

    return {"message": "Signalement reçu, merci !"}

def _get_log_content() -> str:
    if not LOG_FILE_PATH.exists():
        return "Aucun log disponible pour le moment."

    lines = LOG_FILE_PATH.read_text(encoding="utf-8").splitlines()
    tail = lines[-200:] if len(lines) > 200 else lines
    return "\n".join(tail)


@app.post("/admin/logs")
def get_admin_logs(payload: AdminLogRequest):
    if not ADMIN_LOG_PASSWORD:
        return JSONResponse(status_code=503, content={"message": "Mot de passe admin non configuré sur le serveur."})

    if payload.password != ADMIN_LOG_PASSWORD:
        return JSONResponse(status_code=401, content={"message": "Accès refusé : mot de passe incorrect."})

    return {"logs": _get_log_content()}


@app.get("/logs", response_class=HTMLResponse)
def logs_page():
    log_page = Path("static/logs.html")
    if not log_page.exists():
        return JSONResponse(status_code=404, content={"message": "Page des logs manquante."})

    return log_page.read_text(encoding="utf-8")

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

    needs_model = payload.game_type in ["cemantix", "dictionnario", "intruder", "hangman", "duel"]
    
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
@app.post("/rooms/{room_id}/guess")
async def guess(room_id: str, payload: GuessRequest, db: AsyncSession = Depends(get_db)):
    room = room_manager.get_room(room_id)
    if not room:
        return JSONResponse(status_code=404, content={"error": "room_not_found", "message": "Room inconnue"})

    result_data = process_guess(room, payload.word.strip().lower(), payload.player_name)
    
    if result_data.get("error"):
        return JSONResponse(status_code=400, content=result_data)

    # Broadcast du résultat
    await connections.broadcast(room_id, result_data["guess_payload"])
    
    victory = result_data.get("victory", False)
    
    # --- LOGIQUE DE SAUVEGARDE DB ---
    if victory:
        # On cherche l'utilisateur dans la DB
        result = await db.execute(select(User).where(User.username == payload.player_name))
        user = result.scalars().first()
        
        if user:
            user.games_played += 1
            
            if room.mode == "daily":
                user.daily_challenges_validated += 1
            
            if room.game_type == "cemantix":
                user.cemantix_wins += 1
            elif room.game_type == "hangman":
                user.hangman_wins += 1
            
            await db.commit()
            print(f"Stats mises à jour pour {user.username}")
    # -------------------------------

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
        print(f"[WS] Déconnexion de {player_name} (Room: {room_id})")
        if room.host_name == player_name:
            print(f"[WS] L'hôte {player_name} a quitté. Destruction de la room {room_id}.")
            await connections.broadcast(room_id, {
                "type": "room_destroyed",
                "message": "L'hôte a quitté la partie. La room est fermée."
            })
            if room_id in room_manager.rooms:
                del room_manager.rooms[room_id]

            connections.disconnect(room_id, websocket) 
        else:
            connections.disconnect(room_id, websocket)
            room.active_players.discard(player_name)
            global waiting_duel_room_id
            if waiting_duel_room_id == room_id and len(room.active_players) == 0:
                print(f"[DUEL] Room d'attente {room_id} abandonnée.")
                waiting_duel_room_id = None

    except Exception:
        print(f"Erreur WS: {e}")
        connections.disconnect(room_id, websocket)
        room.active_players.discard(player_name)