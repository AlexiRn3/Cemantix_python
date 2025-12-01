import random
import re
import uuid
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
import unicodedata
import requests
from urllib.parse import quote

try:
    from wiktionaryparser import WiktionaryParser
except ImportError:
    WiktionaryParser = None

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
        self.map_size = 3000
        self.generate_orbs(50)

    # MODIFICATION ICI : Ajout du paramètre 'custom_seed'
    def new_game(self, custom_seed=None):
        vocab = self.model.key_to_index.keys()
        frequent_words = [
            w for w in vocab
            if 4 <= len(w) <= 8
            and re.fullmatch(r"[a-zàâçéèêëîïôûùüÿñæœ]+", w)
            and self.model.get_vecattr(w, "count") > 50000
        ]
        
        # Si c'est le mode Daily, on utilise la date comme graine aléatoire
        if custom_seed:
            random.seed(custom_seed)
            self.target_word = random.choice(frequent_words)
            # Important : on remet l'aléatoire normal pour ne pas impacter les autres jeux
            random.seed(None)
        else:
            self.target_word = random.choice(frequent_words)
            
        print(f"[CEMANTIX] Mot cible : {self.target_word}")

    def generate_orbs(self, count):
        for _ in range(count):
            self.orbs.append({
                "id": str(uuid.uuid4())[:8],
                "x": random.randint(0, self.map_size),
                "y": random.randint(0, self.map_size),
                "color": random.choice(["#ff7675", "#74b9ff", "#55efc4", "#a29bfe"]),
                "radius": random.randint(5, 10),
                "value": 10 
            })

    def guess(self, word: str) -> Dict[str, Any]:
        orb_id = word
        remaining_orbs = [o for o in self.orbs if o["id"] != orb_id]
        
        if len(remaining_orbs) < len(self.orbs):
            self.orbs = remaining_orbs
            # On génère une nouvelle bille pour remplacer celle mangée
            self.generate_orbs(1)
            new_orb = self.orbs[-1] # La dernière ajoutée est la nouvelle
            
            return {
                "exists": True, 
                "consumed": True, 
                "xp": 10,
                "new_orb": new_orb # IMPORTANT : On renvoie la nouvelle bille au client
            }
            
        return {"exists": False}

    def get_public_state(self) -> Dict[str, Any]:
        return {
            "game_type": "spaceio",
            "map_size": self.map_size,
            "orbs": self.orbs
        }

# --- Definition Game Implementation ---
class DefinitionEngine(GameEngine):
    def __init__(self, model):
        self.model = model
        self.target_word: Optional[str] = None
        self.definition: Optional[str] = None
        self.parser = WiktionaryParser() if WiktionaryParser else None
        # Liste de secours si l'API échoue
        self.fallback_words = [
            ("ordinateur", "Machine électronique de traitement de l'information."),
            ("montagne", "Élévation naturelle du sol."),
            ("musique", "Art de combiner des sons."),
            ("bibliothèque", "Lieu où l'on conserve des livres."),
            ("océan", "Vaste étendue d'eau salée.")
        ]

    def clean_wikicode(self, text: str) -> str:
        if not text:
            return text

        t = text

        # 1. Enlever les modèles {{...}}
        t = re.sub(r"\{\{[^{}]*\}\}", "", t)

        # 2. Enlever les liens [[mot]] → mot
        t = re.sub(r"\[\[([^|\]]+)\]\]", r"\1", t)

        # 3. Enlever les liens [[mot|affichage]] → affichage
        t = re.sub(r"\[\[[^|\]]+\|([^]]+)\]\]", r"\1", t)

        # 4. Nettoyage des espaces multiples
        t = re.sub(r"\s{2,}", " ", t)

        # 5. Retirer espaces en trop avant la ponctuation
        t = re.sub(r"\s+([,;:.!?])", r"\1", t)

        return t.strip()

    # -------------------------------------------------------
    # 1) Vérifier existence du mot sur le Wiktionnaire
    # -------------------------------------------------------
    def _wiktionary_exists(self, word: str) -> bool:

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) "
                          "Chrome/123.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "fr-FR,fr;q=0.8,en-US;q=0.5,en;q=0.3",
            "Referer": "https://fr.wiktionary.org/",
            "Connection": "keep-alive"
        }


        url = (
            "https://fr.wiktionary.org/w/api.php?"
            f"action=query&titles={quote(word)}"
            "&prop=pageprops&format=json&formatversion=2"
        )
        print(f"[WKT] Vérifie existence : {url}")

        try:
            r = requests.get(url, timeout=4, headers=headers)
            print(r.status_code)
            if r.status_code != 200:
                print(r.status_code)
                return False

            data = r.json()
        except Exception as e:
            print(f"[WKT] Exception: {e}")
            return False

        pages = data.get("query", {}).get("pages", [])
        if not pages:
            print("[WKT] Aucune page renvoyée.")
            return False

        if pages[0].get("missing", False):
            print("[WKT] Mot inexistant dans Wiktionnaire.")
            return False

        print("[WKT] Mot trouvé.")
        return True

    # -------------------------------------------------------
    # 2) Extraire une définition simple du Wiktionnaire
    # -------------------------------------------------------
    def _wiktionary_definition(self, word: str) -> Optional[str]:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) "
                          "Chrome/123.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "fr-FR,fr;q=0.8,en-US;q=0.5,en;q=0.3",
            "Referer": "https://fr.wiktionary.org/",
            "Connection": "keep-alive"
        }

        url = (
            "https://fr.wiktionary.org/w/api.php?"
            f"action=parse&page={quote(word)}"
            "&prop=wikitext&format=json"
        )
        print(f"[WKT] Récupère définition : {url}")

        try:
            data = requests.get(url, timeout=4, headers=headers).json()
        except Exception as e:
            print(f"[WKT] Exception: {e}")
            return None

        wikitext = data.get("parse", {}).get("wikitext", {}).get("*")
        if not wikitext:
            print("[WKT] Pas de wikitext.")
            return None

        # On récupère la première ligne commençant par "# "
        lines = wikitext.split("\n")
        defs = [l[2:].strip() for l in lines if l.startswith("# ")]

        if defs:
            print(f"[WKT] Définition trouvée : {defs[0]}")
            return defs[0]

        print("[WKT] Aucune définition exploitable.")
        return None

    # -------------------------------------------------------
    # 3) Sélection d’un mot dans le modèle + Wiktionnaire
    # -------------------------------------------------------
    def new_game(self):
        print("[DEF] Nouveau jeu de définitions")

        vocab = list(self.model.key_to_index.keys())

        frequent_words = [
            w for w in vocab
            if 4 <= len(w) <= 12
            and re.fullmatch(r"[a-zàâçéèêëîïôûùüÿñæœ]+", w)
            and self.model.get_vecattr(w, "count") > 60000
        ]
        print(f"[DEF] {len(frequent_words)} mots fréquents sélectionnés")

        if not self.parser:
            word, definition = random.choice(self.fallback_words)
            self.target_word = word
            self.definition = definition
            return

        # Essayer jusqu’à trouver un mot valide
        for attempt in range(10):
            candidate = random.choice(frequent_words)
            print(f"[DEF] Tentative {attempt+1}/10 → Mot choisi : {candidate}")

            if not self._wiktionary_exists(candidate):
                continue

            definition = self._wiktionary_definition(candidate)
            if definition:
                print(f"[DEF] Succès → {candidate} : {definition}")
                self.target_word = candidate
                self.definition = self.clean_wikicode(definition)
                return

        # Fallback si rien trouvé
        print("[DEF] Impossible de trouver un mot valide.")
        self.target_word = None
        self.definition = None
        raise RuntimeError("Aucune définition disponible après plusieurs tentatives")

    # -------------------------------------------------------
    # 4) Guess
    # -------------------------------------------------------
    def guess(self, word: str) -> Dict[str, Any]:
        if not self.target_word:
            return {"exists": False, "error": "Aucun jeu actif"}

        print(f"[DEF] Guess reçu : {word}")

        w_clean = word.lower().strip()
        t_clean = self.target_word.lower().strip()

        if w_clean == t_clean:
            print("[DEF] Réponse correcte !")
            return {
                "exists": True,
                "similarity": 1.0,
                "temperature": 100.0,
                "is_correct": True,
                "feedback": "Correct !"
            }

        # Feedback
        if len(w_clean) == len(t_clean):
            feedback = "Bonne longueur"
        elif w_clean[:2] == t_clean[:2] and len(w_clean) >= 2:
            feedback = "Bon début"
        else:
            feedback = "Incorrect"

        print(f"[DEF] Mauvaise réponse → Feedback : {feedback}")

        return {
            "exists": True,
            "similarity": 0.0,
            "temperature": 0.0,
            "is_correct": False,
            "feedback": feedback
        }

    # -------------------------------------------------------
    # 5) État public
    # -------------------------------------------------------
    def get_public_state(self) -> Dict[str, Any]:
        if not self.target_word:
            return {"error": "Aucun mot disponible"}

        state = {
            "game_type": "definition",
            "hint": self.definition,
            "word_length": len(self.target_word)
        }
        print(f"[DEF] État public : {state}")
        return state

    def next_word(self):
        self.new_game()


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
            "max_lives": self.max_lives,
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

class SpaceIoEngine(GameEngine):
    def __init__(self, model):
        self.model = model
        self.orbs = [] # Liste des billes {x, y, color, radius}
        self.map_size = 4000
        self.generate_orbs(50) # Génère 50 billes au départ

    def new_game(self):
        self.orbs = []
        self.generate_orbs(50)

    def generate_orbs(self, count):
        for _ in range(count):
            self.orbs.append({
                "id": str(uuid.uuid4())[:8],
                "x": random.randint(0, self.map_size),
                "y": random.randint(0, self.map_size),
                "color": random.choice(["#ff7675", "#74b9ff", "#55efc4", "#a29bfe"]),
                "radius": random.randint(5, 10),
                "value": 10 # XP donné
            })

    def guess(self, word: str) -> Dict[str, Any]:
        # Dans ce mode, "guess" sert à envoyer des actions (tir, mouvement) ou consommer une bille
        # Pour simplifier l'exemple, on l'utilise pour valider la consommation d'une bille
        orb_id = word # On triche un peu sur le nom du paramètre
        
        # On cherche la bille mangée
        remaining_orbs = [o for o in self.orbs if o["id"] != orb_id]
        
        if len(remaining_orbs) < len(self.orbs):
            self.orbs = remaining_orbs
            self.generate_orbs(1) # On en recrée une pour l'infini
            return {"exists": True, "consumed": True, "xp": 10}
            
        return {"exists": False}

    def get_public_state(self) -> Dict[str, Any]:
        return {
            "game_type": "spaceio",
            "map_size": self.map_size,
            "orbs": self.orbs
        }