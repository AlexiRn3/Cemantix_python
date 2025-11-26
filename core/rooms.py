import json
import os
import random
import re
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from core.game_engine import CemantixEngine


def get_simple_random_word(model):
    vocab = model.key_to_index.keys()
    frequent_words = [
        w for w in vocab
        if 4 <= len(w) <= 8
        and re.fullmatch(r"[a-zàâçéèêëîïôûùüÿñæœ]+", w)
        and model.get_vecattr(w, "count") > 8000  # seuil à ajuster
    ]
    return random.choice(frequent_words)

@dataclass
class PlayerStats:
    attempts: int = 0
    best_similarity: float = 0.0

    def to_dict(self):
        return {
            "attempts": self.attempts,
            "best_similarity": self.best_similarity,
        }

    @classmethod
    def from_dict(cls, data: Dict):
        return cls(
            attempts=data.get("attempts", 0),
            best_similarity=data.get("best_similarity", 0.0),
        )


@dataclass
class GuessEntry:
    word: str
    player_name: str
    similarity: Optional[float]
    temperature: Optional[float]

    def to_dict(self):
        return {
            "word": self.word,
            "player_name": self.player_name,
            "similarity": self.similarity,
            "temperature": self.temperature,
        }

    @classmethod
    def from_dict(cls, data: Dict):
        return cls(
            word=data["word"],
            player_name=data["player_name"],
            similarity=data.get("similarity"),
            temperature=data.get("temperature"),
        )


@dataclass
class RoomState:
    room_id: str
    target_word: str
    engine: CemantixEngine
    mode: str = "coop"
    locked: bool = False
    players: Dict[str, PlayerStats] = field(default_factory=dict)
    history: List[GuessEntry] = field(default_factory=list)

    def add_player(self, player_name: str):
        if player_name not in self.players:
            self.players[player_name] = PlayerStats()

    def record_guess(self, word: str, player_name: str, similarity: Optional[float], temperature: Optional[float]):
        self.add_player(player_name)
        player = self.players[player_name]
        player.attempts += 1
        if similarity is not None and similarity > player.best_similarity:
            player.best_similarity = similarity
        self.history.append(
            GuessEntry(
                word=word,
                player_name=player_name,
                similarity=similarity,
                temperature=temperature,
            )
        )

    def to_dict(self):
        return {
            "room_id": self.room_id,
            "target_word": self.target_word,
            "mode": self.mode,
            "locked": self.locked,
            "players": {name: stats.to_dict() for name, stats in self.players.items()},
            "history": [entry.to_dict() for entry in self.history],
        }

    @classmethod
    def from_dict(cls, data: Dict, model):
        engine = CemantixEngine(model)
        engine.new_game(data["target_word"])
        room = cls(
            room_id=data["room_id"],
            target_word=data["target_word"],
            engine=engine,
            mode=data.get("mode", "coop"),
            locked=data.get("locked", False),
        )
        room.players = {name: PlayerStats.from_dict(stats) for name, stats in data.get("players", {}).items()}
        room.history = [GuessEntry.from_dict(entry) for entry in data.get("history", [])]
        return room


class RoomManager:
    def __init__(self, model, state_path: str = "rooms_state.json"):
        self.model = model
        self.state_path = state_path
        self.rooms: Dict[str, RoomState] = {}
        self.load_state()

    def load_state(self):
        if not os.path.exists(self.state_path):
            return
        try:
            with open(self.state_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            return

        for room_data in data.get("rooms", []):
            room = RoomState.from_dict(room_data, self.model)
            self.rooms[room.room_id] = room

    def save_state(self):
        payload = {"rooms": [room.to_dict() for room in self.rooms.values()]}
        with open(self.state_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

    def create_room(self, mode: str, creator_name: str) -> RoomState:
        room_id = uuid.uuid4().hex[:8]
        target_word = get_simple_random_word(self.model)
        engine = CemantixEngine(self.model)
        engine.new_game(target_word)
        print(f"[DEBUG] Mot à deviner pour la room {room_id}: {target_word}")
        room = RoomState(room_id=room_id, target_word=target_word, engine=engine, mode=mode)
        room.add_player(creator_name)
        self.rooms[room_id] = room
        self.save_state()
        return room

    def get_room(self, room_id: str) -> Optional[RoomState]:
        return self.rooms.get(room_id)

    def delete_room(self, room_id: str):
        if room_id in self.rooms:
            del self.rooms[room_id]
            self.save_state()

    def persist_room(self, room_id: str):
        if room_id in self.rooms:
            self.save_state()
