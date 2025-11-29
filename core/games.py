import random
import re
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List

# --- Base Game Class ---
class GameEngine(ABC):
    @abstractmethod
    def new_game(self):
        pass

    @abstractmethod
    def guess(self, word: str) -> Dict[str, Any]:
        pass

    @abstractmethod
    def get_public_state(self) -> Dict[str, Any]:
        """Retourne les infos statiques nécessaires au front (ex: la définition)"""
        pass
    
    def next_word(self):
        """Passe au mot suivant (utilisé pour le mode Blitz)"""
        pass

# --- Cemantix Implementation ---
class CemantixEngine(GameEngine):
    def __init__(self, model):
        self.model = model
        self.target_word: Optional[str] = None

    def new_game(self):
        vocab = self.model.key_to_index.keys()
        # Sélection d'un mot aléatoire fréquent
        frequent_words = [
            w for w in vocab
            if 4 <= len(w) <= 8
            and re.fullmatch(r"[a-zàâçéèêëîïôûùüÿñæœ]+", w)
            and self.model.get_vecattr(w, "count") > 50000
        ]
        self.target_word = random.choice(frequent_words)
        print(f"[CEMANTIX] Mot cible : {self.target_word}")

    def guess(self, word: str) -> Dict[str, Any]:
        if not self.target_word:
            return {"exists": False, "error": "Jeu non initialisé"}
            
        if word not in self.model.key_to_index:
            return {"exists": False, "error": "Mot inconnu"}

        sim = float(self.model.similarity(word, self.target_word))
        return {
            "exists": True,
            "similarity": sim,
            "temperature": float(round(sim * 100, 2)),
            "is_correct": sim >= 0.999 # Seuil de victoire
        }

    def get_public_state(self) -> Dict[str, Any]:
        return {"game_type": "cemantix"}

# --- Definition Game Implementation ---
class DefinitionEngine(GameEngine):
    def __init__(self):
        self.dictionary = [
            {"word": "python", "def": "Langage de programmation interprété très populaire."},
            {"word": "ordinateur", "def": "Machine électronique de traitement de l'information."},
            {"word": "clavier", "def": "Périphérique permettant la saisie de caractères."},
            {"word": "internet", "def": "Réseau informatique mondial."},
            {"word": "algorithme", "def": "Suite d'instructions permettant de résoudre un problème."},
            {"word": "boulangerie", "def": "Commerce où l'on vend du pain."},
            {"word": "montagne", "def": "Élévation naturelle du sol très importante."},
            {"word": "liberte", "def": "Pouvoir d'agir sans contrainte étrangère."},
        ]
        self.target: Optional[Dict[str, str]] = None

    def new_game(self):
        self.target = random.choice(self.dictionary)
        print(f"[DEF] Mot cible : {self.target['word']}")

    def next_word(self):
        self.new_game()

    def guess(self, word: str) -> Dict[str, Any]:
        if not self.target:
            return {"exists": False, "error": "Jeu non initialisé"}

        # Nettoyage basique
        w_clean = word.lower().strip()
        t_clean = self.target["word"].lower().strip()
        
        if w_clean == t_clean:
            return {
                "exists": True, 
                "similarity": 1.0, 
                "temperature": 100.0, 
                "is_correct": True,
                "feedback": "Correct !"
            }
        
        # Indice simple
        feedback = "Incorrect"
        if len(w_clean) == len(t_clean):
            feedback = "Bonne longueur"
        elif t_clean.startswith(w_clean[:2]):
             feedback = "Bon début"

        return {
            "exists": True,
            "similarity": 0.0,
            "temperature": 0.0,
            "is_correct": False,
            "feedback": feedback
        }

    def get_public_state(self) -> Dict[str, Any]:
        if not self.target:
            return {}
        return {
            "game_type": "definition",
            "hint": self.target["def"],
            "word_length": len(self.target["word"])
        }