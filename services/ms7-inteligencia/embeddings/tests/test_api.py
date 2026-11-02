import hashlib
import math
import os

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


class Falso:
    """Codificador determinista (bolsa de palabras hasheada): NO es el modelo real; solo prueba el contrato HTTP."""

    nombre = "falso-test"
    dimension = 8

    def codificar(self, textos):
        out = []
        for t in textos:
            v = [0.0] * self.dimension
            for p in t.lower().split():
                v[int(hashlib.md5(p.encode()).hexdigest(), 16) % self.dimension] += 1
            n = math.sqrt(sum(x * x for x in v)) or 1.0
            out.append([x / n for x in v])
        return out


@pytest.fixture()
def cliente(monkeypatch):
    monkeypatch.setattr(settings, "embeddings_api_key", None)
    app.state.codificador = Falso()
    with TestClient(app) as c:
        yield c


def test_embed_devuelve_vectores_normalizados(cliente):
    r = cliente.post("/embed", json={"textos": ["cancelar una cita", "horario de atencion"]})
    assert r.status_code == 200
    j = r.json()
    assert j["modelo"] == "falso-test" and j["dimension"] == 8 and len(j["vectores"]) == 2
    assert all(abs(sum(x * x for x in v) - 1) < 1e-6 for v in j["vectores"])


def test_validaciones(cliente, monkeypatch):
    assert cliente.post("/embed", json={"textos": []}).status_code == 422
    assert cliente.post("/embed", json={"textos": ["  "]}).status_code == 422
    assert cliente.post("/embed", json={"textos": ["a"], "otro": 1}).status_code == 422
    monkeypatch.setattr(settings, "max_textos", 1)
    assert cliente.post("/embed", json={"textos": ["a", "b"]}).status_code == 413
    monkeypatch.setattr(settings, "max_caracteres", 5)
    assert cliente.post("/embed", json={"textos": ["demasiado largo"]}).status_code == 413


def test_clave_api(cliente, monkeypatch):
    monkeypatch.setattr(settings, "embeddings_api_key", "k")
    assert cliente.post("/embed", json={"textos": ["a"]}).status_code == 401
    assert cliente.post("/embed", json={"textos": ["a"]}, headers={"X-Api-Key": "k"}).status_code == 200
    assert cliente.get("/health").status_code == 200


@pytest.mark.skipif(not os.getenv("EMBEDDINGS_REAL"), reason="usa el modelo real (descarga ~470 MB la primera vez): EMBEDDINGS_REAL=1")
def test_modelo_real_entiende_espanol():
    from app.modelo import SentenceTransformersCodificador

    c = SentenceTransformersCodificador(settings.embeddings_model)
    assert c.dimension == 384
    q, bueno, malo = c.codificar(["¿Cuánto tiempo antes puedo cancelar mi cita?", "Las cancelaciones sin costo deben hacerse con 24 horas de anticipación.", "El laboratorio toma muestras en ayunas."])
    sim = lambda a, b: sum(x * y for x, y in zip(a, b, strict=True))  # noqa: E731
    assert sim(q, bueno) > sim(q, malo)
