import random
import re
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
import unicodedata

def remove_accents(input_str):
    nfkd_form = unicodedata.normalize('NFKD', input_str)
    return "".join([c for c in nfkd_form if not unicodedata.mirrored(c) and c.isalpha()]).upper()

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

# core/games.py
# Ajoutez les imports manquants si besoin (déjà présents normalement : random, re)

class IntruderEngine(GameEngine):
    def __init__(self, model):
        self.model = model
        self.options = []
        self.correct_word = None # C'est l'intrus
        self.theme_word = None

    def new_game(self):
        vocab_keys = list(self.model.key_to_index.keys())
        
        # 1. Choisir un mot thème fréquent (nom commun simple)
        # On filtre pour avoir des mots de taille raisonnable et alphabétiques
        while True:
            candidate = random.choice(vocab_keys)
            if (len(candidate) >= 4 and candidate.isalpha() 
                and self.model.get_vecattr(candidate, "count") > 50000):
                self.theme_word = candidate
                break

        # 2. Prendre 3 voisins très proches (ex: top 5)
        # most_similar renvoie [(mot, score), ...]
        neighbors_raw = self.model.most_similar(self.theme_word, topn=10)
        # On filtre pour éviter les variantes trop proches (singulier/pluriel) si possible, 
        # mais pour simplifier on prend juste les 3 premiers valides.
        neighbors = [w for w, s in neighbors_raw if w != self.theme_word and w.isalpha()][:3]

        # 3. Trouver un intrus (Similarité moyenne entre 0.2 et 0.3)
        intruder = None
        safety_counter = 0
        while not intruder and safety_counter < 100:
            candidate = random.choice(vocab_keys)
            if not candidate.isalpha() or len(candidate) < 4: 
                continue
                
            sim = self.model.similarity(self.theme_word, candidate)
            # L'intrus doit être un peu lié mais pas trop (le piège) 
            # OU totalement déconnecté si vous voulez un niveau facile.
            # Ici on suit la consigne : intrus sémantique "qui peut sembler lié" -> 0.2 - 0.4
            if 0.2 <= sim <= 0.4 and candidate not in neighbors and candidate != self.theme_word:
                intruder = candidate
            
            safety_counter += 1
        
        # Fallback si on ne trouve pas
        if not intruder:
            intruder = "chat" if "chat" not in neighbors else "chien"

        self.correct_word = intruder
        self.options = neighbors + [intruder]
        random.shuffle(self.options)
        
        print(f"[INTRUS] Thème: {self.theme_word} | Intrus: {self.correct_word} | Options: {self.options}")

    def guess(self, word: str) -> Dict[str, Any]:
        if not self.correct_word:
            return {"exists": False, "error": "Jeu non initialisé"}
            
        is_correct = (word == self.correct_word)
        
        return {
            "exists": True,
            "is_correct": is_correct,
            "feedback": "Bien joué !" if is_correct else "Non, ce mot est lié au thème.",
            "similarity": 1.0 if is_correct else 0.0,
            "temperature": 100.0 if is_correct else 0.0
        }

    def get_public_state(self) -> Dict[str, Any]:
        return {
            "game_type": "intruder",
            "options": self.options
        }
    
    def next_word(self):
        self.new_game()

class HangmanEngine(GameEngine):
    def __init__(self, model):
        self.model = model
        self.target_word = None
        self.normalized_target = None
        self.found_letters = set()
        self.wrong_letters = set()
        self.max_lives = 7
        self.lives = 7

    def new_game(self):
        vocab = self.model.key_to_index.keys()
        # On choisit un mot fréquent (longueur 5 à 10)
        frequent_words = [
            w for w in vocab
            if 5 <= len(w) <= 10
            and re.fullmatch(r"[a-zàâçéèêëîïôûùüÿñæœ]+", w)
            and self.model.get_vecattr(w, "count") > 50000
        ]
        self.target_word = random.choice(frequent_words)
        # On normalise pour le jeu (Éléphant -> ELEPHANT) pour simplifier le clavier
        self.normalized_target = remove_accents(self.target_word)
        
        self.found_letters = set()
        self.wrong_letters = set()
        self.lives = self.max_lives
        print(f"[PENDU] Mot : {self.target_word} ({self.normalized_target})")

    def guess(self, word: str) -> Dict[str, Any]:
        if not self.target_word or self.normalized_target is None:
            return {"exists": False, "error": "Jeu non initialisé"}
        
        letter = word
        
        # Nettoyage de l'entrée
        l = remove_accents(letter.strip())
        if not l or len(l) != 1:
            return {"exists": False, "error": "Envoyez une seule lettre."}

        if l in self.found_letters or l in self.wrong_letters:
             return {"exists": False, "error": "Lettre déjà jouée."}

        is_correct = l in self.normalized_target
        
        if is_correct:
            self.found_letters.add(l)
            feedback = "Bonne lettre !"
        else:
            self.wrong_letters.add(l)
            self.lives -= 1
            feedback = "Aïe, batterie touchée..."

        # Vérification Victoire
        # On vérifie si toutes les lettres du mot cible sont dans found_letters
        victory = all(char in self.found_letters for char in self.normalized_target)

        return {
            "exists": True,
            "is_correct": victory, # Victoire si mot complet
            "similarity": 1.0 if is_correct else 0.0, # Pour compatibilité
            "temperature": (self.lives / self.max_lives) * 100, # La température devient le % de batterie
            "feedback": feedback,
            "lives": self.lives,
            "masked_word": self._get_masked_word()
        }

    def _get_masked_word(self):
        # AJOUT DE SÉCURITÉ : Si pas de mot cible, on renvoie une chaine vide
        if self.normalized_target is None:
            return ""

        # Maintenant le linter sait que self.normalized_target est une chaine valide
        return " ".join([c if c in self.found_letters else "_" for c in self.normalized_target])

    def get_public_state(self) -> Dict[str, Any]:
        if not self.target_word:
            return {}
        return {
            "game_type": "hangman",
            "lives": self.lives,
            "max_lives": self.max_lives,
            "masked_word": self._get_masked_word(),
            "used_letters": list(self.found_letters | self.wrong_letters)
        }
        
    def next_word(self):
        self.new_game()