from unittest.mock import patch

import sys
import types

from fastapi.testclient import TestClient

# Stub minimal gensim modules to éviter le chargement réel du modèle et ses dépendances
class _DummyKeyedVectors:
    @classmethod
    def load_word2vec_format(cls, *args, **kwargs):
        class _DummyModel:
            key_to_index = {}

            def get_vecattr(self, word, attr):
                return 0

        return _DummyModel()


_fake_gensim_models = types.ModuleType("gensim.models")
_fake_gensim_models.KeyedVectors = _DummyKeyedVectors
_fake_gensim = types.ModuleType("gensim")
_fake_gensim.models = _fake_gensim_models
sys.modules.setdefault("gensim", _fake_gensim)
sys.modules.setdefault("gensim.models", _fake_gensim_models)

import app as app_module
from core.rooms import RoomManager


class FakeModel:
    def __init__(self):
        self.key_to_index = {"alpha": 0, "bravo": 1, "charlie": 2}

    def get_vecattr(self, word, attr):
        return 60000


class FakeResponse:
    def __init__(self, status_code):
        self.status_code = status_code

    def json(self):
        return {}


def test_definition_room_creation_failure_returns_503():
    # Prépare un RoomManager isolé avec un modèle factice
    fake_model = FakeModel()
    app_module.room_manager = RoomManager(fake_model)
    client = TestClient(app_module.app)

    # Forcer les appels au Wiktionnaire à échouer
    with patch("core.games.requests.get", return_value=FakeResponse(status_code=500)):
        response = client.post(
            "/rooms",
            json={
                "player_name": "Alice",
                "mode": "coop",
                "game_type": "definition",
                "duration": 0,
            },
        )

    assert response.status_code == 503
    body = response.json()
    assert "message" in body
    assert "Impossible de créer" in body["message"]
    # Aucune room ne doit avoir été créée après l'erreur
    assert len(app_module.room_manager.rooms) == 0
