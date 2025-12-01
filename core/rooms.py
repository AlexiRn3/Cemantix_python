import json
import os
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Set

from core.games import CemantixEngine, DefinitionEngine, GameEngine, IntruderEngine, HangmanEngine

@dataclass
class ChatMessage:
    player_name: str
    content: str
    timestamp: float = 0.0 # On pourrait mettre time.time()

    def to_dict(self):
        return {"player_name": self.player_name, "content": self.content}

@dataclass
class PlayerStats:
    attempts: int = 0
    best_similarity: float = 0.0

    def to_dict(self):
        return {"attempts": self.attempts, "best_similarity": self.best_similarity}

    @classmethod
    def from_dict(cls, data: Dict):
        return cls(attempts=data.get("attempts", 0), best_similarity=data.get("best_similarity", 0.0))

@dataclass
class GuessEntry:
    word: str
    player_name: str
    similarity: Optional[float]
    temperature: Optional[float]
    feedback: str = "" 

    def to_dict(self):
        return {
            "word": self.word,
            "player_name": self.player_name,
            "similarity": self.similarity,
            "temperature": self.temperature,
            "feedback": self.feedback
        }

    @classmethod
    def from_dict(cls, data: Dict, model):
        # Récupération sécurisée du type de jeu (par défaut 'cemantix' pour les vieilles rooms)
        g_type = data.get("game_type", "cemantix") 
        
        if g_type == "definition":
            engine = DefinitionEngine(model)
        else:
            engine = CemantixEngine(model)
            if "target_word" in data:
                engine.new_game() # Init standard
                engine.target_word = data["target_word"] # Force le mot de la sauvegarde
        return cls(
            word=data["word"],
            player_name=data["player_name"],
            similarity=data.get("similarity"),
            temperature=data.get("temperature"),
            feedback=data.get("feedback", "")
        )
        room.players = {name: PlayerStats.from_dict(stats) for name, stats in data.get("players", {}).items()}
        room.history = [GuessEntry.from_dict(entry) for entry in data.get("history", [])]
        return room

@dataclass
class RoomState:
    room_id: str
    game_type: str        # Ajout du champ game_type
    engine: GameEngine    # Typage plus précis (GameEngine au lieu de Any)
    mode: str = "coop"
    locked: bool = False
    players: Dict[str, PlayerStats] = field(default_factory=dict)
    history: List[GuessEntry] = field(default_factory=list)

    end_time: float = 0.0
    team_score: int = 0
    duration: int = 0

    reset_votes: Set[str] = field(default_factory=set)
    chat_history: List[ChatMessage] = field(default_factory=list)

    def add_chat_message(self, player_name: str, content: str):
        self.chat_history.append(ChatMessage(player_name, content))
        # On garde seulement les 50 derniers messages pour éviter de saturer la mémoire
        if len(self.chat_history) > 50:
            self.chat_history.pop(0)

    def add_player(self, player_name: str):
        if player_name not in self.players:
            self.players[player_name] = PlayerStats()

    # Mise à jour de la signature pour accepter feedback
    def record_guess(self, word: str, player_name: str, similarity: float, temperature: float, feedback: str = ""):
        self.add_player(player_name)
        player = self.players[player_name]
        player.attempts += 1
        
        if similarity is not None and similarity > player.best_similarity:
            player.best_similarity = similarity
        
        self.history.append(GuessEntry(
            word=word,
            player_name=player_name,
            similarity=similarity,
            temperature=temperature,
            feedback=feedback
        ))

        # AJOUT : Logique de vote pour reset
    def vote_reset(self, player_name: str) -> bool:
        """Enregistre un vote. Retourne True si tout le monde a voté."""
        self.reset_votes.add(player_name)
        # On compare le nombre de votes au nombre de joueurs actuels
        return len(self.reset_votes) >= len(self.players)

    # AJOUT : Réinitialisation de la partie
    def reset_game(self):
        """Relance la partie"""
        
        # MODIFICATION : Si c'est le mode daily, on garde le mot du jour
        if self.mode == "daily" and isinstance(self.engine, CemantixEngine):
             # On réutilise la même seed basée sur la date
             from datetime import date
             self.engine.new_game(custom_seed=date.today().isoformat())
        else:
             self.engine.new_game()
             
        self.history.clear()
        self.reset_votes.clear()
        self.locked = False

    def to_dict(self):
        return {
            "room_id": self.room_id,
            "game_type": self.game_type,
            "mode": self.mode,
            "locked": self.locked,
            "players": {name: stats.to_dict() for name, stats in self.players.items()},
            "history": [entry.to_dict() for entry in self.history],
            "chat_history": [msg.to_dict() for msg in self.chat_history]
        }

class RoomManager:
    def __init__(self, model, state_path: str = "rooms_state.json"):
        self.model = model
        self.state_path = state_path
        self.rooms: Dict[str, RoomState] = {}

    def create_room(self, game_type: str, mode: str, creator_name: str) -> RoomState:
        room_id = uuid.uuid4().hex[:8]

        engine: GameEngine
        
        # Bug 8: Utiliser la même seed pour le mode Daily
        custom_seed = date.today().isoformat() if mode == "daily" else None

        if game_type == "definition":
            engine = DefinitionEngine(self.model)
            try:
                engine.new_game()
            except Exception as exc:
                raise RuntimeError("Impossible d'initialiser le jeu de définition") from exc
        elif game_type == "intruder":
            engine = IntruderEngine(self.model)
            engine.new_game()
        elif game_type == "cemantix":
            engine = CemantixEngine(self.model)
            engine.new_game(custom_seed=custom_seed) # Passe la seed si mode daily
        else:
            engine = HangmanEngine(self.model)
            engine.new_game()
        
        # Initialisation correcte avec game_type
        room = RoomState(
            room_id=room_id, 
            game_type=game_type, 
            engine=engine, 
            mode=mode
        )
        room.add_player(creator_name)
        self.rooms[room_id] = room
        return room

    def get_room(self, room_id: str) -> Optional[RoomState]:
        return self.rooms.get(room_id)
        
    def persist_room(self, room_id: str):
        pass