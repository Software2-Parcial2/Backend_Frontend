import os
import shutil
import subprocess

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.transcriptor import AudioDemasiadoLargo, AudioInvalido, Resultado


class Falso:
    nombre = "falso-test"

    def __init__(self):
        self.llamadas = []

    def transcribir(self, audio, idioma, max_duracion_s):
        self.llamadas.append((len(audio), idioma, max_duracion_s))
        if audio.startswith(b"MALO"):
            raise AudioInvalido("no es audio")
        if audio.startswith(b"LARGO"):
            raise AudioDemasiadoLargo(120, max_duracion_s)
        return Resultado(texto="cuantas citas hubo", idioma=idioma or "es", duracion_s=1.5, modelo=self.nombre)


@pytest.fixture()
def cliente(monkeypatch):
    monkeypatch.setattr(settings, "whisper_api_key", None)
    app.state.transcriptor = Falso()
    with TestClient(app) as c:
        yield c


def subir(c, datos=b"RIFFxxxx", nombre="a.wav", **form):
    return c.post("/transcribir", files={"audio": (nombre, datos, "audio/wav")}, data=form)


def test_transcribe_y_pasa_idioma_y_limite(cliente):
    r = subir(cliente)
    assert r.status_code == 200
    assert r.json() == {"texto": "cuantas citas hubo", "idioma": "es", "duracion_s": 1.5, "modelo": "falso-test"}
    assert app.state.transcriptor.llamadas[-1][1:] == ("es", settings.max_duracion_s)
    assert subir(cliente, idioma="en").json()["idioma"] == "en"


def test_validaciones(cliente, monkeypatch):
    assert subir(cliente, datos=b"").status_code == 422
    assert subir(cliente, idioma="espanol123").status_code == 422
    monkeypatch.setattr(settings, "max_audio_bytes", 10)
    assert subir(cliente, datos=b"x" * 11).status_code == 413
    assert cliente.post("/transcribir").status_code == 422  # falta el archivo


def test_errores_del_transcriptor(cliente):
    assert subir(cliente, datos=b"MALO...").status_code == 415
    r = subir(cliente, datos=b"LARGO...")
    assert r.status_code == 413 and "maximo" in r.json()["detail"]


def test_clave_api(cliente, monkeypatch):
    monkeypatch.setattr(settings, "whisper_api_key", "k")
    assert subir(cliente).status_code == 401
    assert cliente.post("/transcribir", files={"audio": ("a.wav", b"RIFFxxxx", "audio/wav")}, headers={"X-Api-Key": "k"}).status_code == 200
    assert cliente.get("/health").status_code == 200


@pytest.mark.skipif(not (os.getenv("WHISPER_REAL") and shutil.which("espeak-ng")), reason="usa el modelo real y espeak-ng: WHISPER_REAL=1")
def test_modelo_real_transcribe_voz_sintetica(tmp_path, monkeypatch):
    from app.transcriptor import FasterWhisperTranscriptor

    wav = tmp_path / "frase.wav"
    subprocess.run(["espeak-ng", "-v", "es", "-s", "130", "-p", "40", "-w", str(wav), "cuántas citas hubo este mes en pediatría"], check=True)
    t = FasterWhisperTranscriptor(os.getenv("WHISPER_MODEL", "small"), "cpu", "int8")
    r = t.transcribir(wav.read_bytes(), "es", 30)
    texto = r.texto.lower()
    assert r.idioma == "es" and 1 < r.duracion_s < 10
    # La voz de espeak-ng es robotica: se comprueba el contenido principal, no la frase exacta ("base" confunde palabras; "small" acierta).
    assert "cita" in texto and "mes" in texto, texto
    with pytest.raises(AudioDemasiadoLargo):
        t.transcribir(wav.read_bytes(), "es", 0.5)
    with pytest.raises(AudioInvalido):
        t.transcribir(b"esto no es audio" * 50, "es", 30)
