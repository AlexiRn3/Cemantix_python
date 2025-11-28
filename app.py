import asyncio
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from starlette.staticfiles import StaticFiles
from typing import Dict, List

from core.model_loader import ModelLoader
from core.rooms import RoomManager, RoomState


app = FastAPI()

loader = ModelLoader("model/frWac_no_postag_phrase_500_cbow_cut10_stripped.bin")
model = loader.load()
room_manager = RoomManager(model)
app.mount("/static", StaticFiles(directory="static"), name="static")


class CreateRoomRequest(BaseModel):
    player_name: str
    mode: str = "coop"


class GuessRequest(BaseModel):
    word: str
    player_name: str


class RoomConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.players: Dict[WebSocket, str] = {}
        self.lock = asyncio.Lock()

    async def connect(self, room_id: str, websocket: WebSocket, player_name: str):
        await websocket.accept()
        async with self.lock:
            self.active_connections.setdefault(room_id, []).append(websocket)
            self.players[websocket] = player_name

    def disconnect(self, room_id: str, websocket: WebSocket):
        if room_id in self.active_connections and websocket in self.active_connections[room_id]:
            self.active_connections[room_id].remove(websocket)
        if websocket in self.players:
            del self.players[websocket]

    async def broadcast(self, room_id: str, message: Dict):
        connections = list(self.active_connections.get(room_id, []))
        for connection in connections:
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(room_id, connection)


connections = RoomConnectionManager()


def normalize_mode(mode: str) -> str:
    if mode not in {"coop", "race"}:
        return "coop"
    return mode


def build_scoreboard(room: RoomState):
    scoreboard = [
        {
            "player_name": name,
            "attempts": stats.attempts,
            "best_similarity": stats.best_similarity,
        }
        for name, stats in room.players.items()
    ]
    scoreboard.sort(key=lambda x: (-x["best_similarity"], -x["attempts"]))
    return scoreboard


def build_history_payload(room: RoomState):
    history_payload = []
    for entry in room.history:
        progression = int(round(entry.similarity * 1000)) if entry.similarity is not None else 0
        history_payload.append(
            {
                "word": entry.word,
                "player_name": entry.player_name,
                "temperature": entry.temperature,
                "progression": progression,
            }
        )
    return history_payload


def build_victory_message(room: RoomState, player_name: str, victory: bool):
    if not victory:
        return None
    return {
        "type": "victory",
        "mode": room.mode,
        "player_name": player_name,
        "room_id": room.room_id,
    }


def process_guess(room: RoomState, word: str, player_name: str):
    if room.mode == "race" and room.locked:
        return {"error": "room_locked", "message": "Cette room est verrouillée"}

    result = room.engine.guess(word)
    similarity = result.get("similarity") if result.get("exists") else None
    temperature = result.get("temperature") if result.get("exists") else None

    room.record_guess(word, player_name, similarity, temperature)

    victory = False
    if result.get("exists") and similarity is not None and similarity >= 0.99:
        victory = True
        if room.mode == "race":
            room.locked = True

    room_manager.persist_room(room.room_id)

    progression = int(round(similarity * 1000)) if similarity is not None else 0
    guess_payload = {
        "type": "guess",
        "word": word,
        "player_name": player_name,
        "temperature": temperature,
        "similarity": similarity,
        "progression": progression,
    }
    return {
        "result": {**result, "progression": progression},
        "guess_payload": guess_payload,
        "scoreboard": build_scoreboard(room),
        "victory": victory,
    }


@app.get("/", response_class=HTMLResponse)
def home():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return f.read()


@app.get("/hub", response_class=HTMLResponse)
def hub_page():
    with open("static/hub.html", "r", encoding="utf-8") as f:
        return f.read()


@app.post("/rooms")
def create_room(payload: CreateRoomRequest):
    mode = normalize_mode(payload.mode)
    room = room_manager.create_room(mode, payload.player_name)
    return {"room_id": room.room_id, "mode": room.mode, "scoreboard": build_scoreboard(room)}


@app.post("/rooms/{room_id}/guess")
async def guess(room_id: str, payload: GuessRequest):
    room = room_manager.get_room(room_id)
    if not room:
        return JSONResponse(status_code=404, content={"error": "room_not_found", "message": "Room inconnue"})

    result_data = process_guess(room, payload.word.strip().lower(), payload.player_name)
    if result_data.get("error"):
        return JSONResponse(status_code=400, content=result_data)

    await connections.broadcast(room_id, result_data["guess_payload"])
    victory_message = build_victory_message(room, payload.player_name, result_data["victory"])
    await connections.broadcast(
        room_id,
        {
            "type": "scoreboard_update",
            "scoreboard": result_data["scoreboard"],
            "mode": room.mode,
            "locked": room.locked,
            "victory": result_data["victory"],
            "winner": payload.player_name if result_data["victory"] else None,
        },
    )
    if victory_message:
        await connections.broadcast(room_id, victory_message)

    return {
        **result_data["result"],
        "scoreboard": result_data["scoreboard"],
        "mode": room.mode,
        "locked": room.locked,
    }


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

    await connections.connect(room_id, websocket, player_name)
    room.add_player(player_name)
    room_manager.persist_room(room.room_id)
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

    try:
        await websocket.send_json(
            {
                "type": "state_sync",
                "history": build_history_payload(room),
                "scoreboard": build_scoreboard(room),
                "mode": room.mode,
                "locked": room.locked,
            }
        )

        while True:
            data = await websocket.receive_json()
            word = data.get("word")
            if not word:
                await websocket.send_json({"type": "error", "error": "invalid_payload", "message": "Mot manquant"})
                continue

            result_data = process_guess(room, word.strip().lower(), player_name)
            if result_data.get("error"):
                await websocket.send_json(result_data)
                continue

            await connections.broadcast(room_id, result_data["guess_payload"])
            victory_message = build_victory_message(room, player_name, result_data["victory"])
            scoreboard_payload = {
                "type": "scoreboard_update",
                "scoreboard": result_data["scoreboard"],
                "mode": room.mode,
                "locked": room.locked,
                "victory": result_data["victory"],
                "winner": player_name if result_data["victory"] else None,
            }
            await connections.broadcast(room_id, scoreboard_payload)
            if victory_message:
                await connections.broadcast(room_id, victory_message)

            await websocket.send_json({"type": "ack", **result_data["result"]})
    except WebSocketDisconnect:
        connections.disconnect(room_id, websocket)
    except Exception:
        connections.disconnect(room_id, websocket)
        raise


if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=1256, reload=True)
