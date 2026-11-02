from __future__ import annotations

import logging
import secrets
import threading
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel

from .config import settings
from .transcriptor import AudioDemasiadoLargo, AudioInvalido, FasterWhisperTranscriptor, Transcriptor

log = logging.getLogger("ms7-whisper")


class RespuestaTranscripcion(BaseModel):
    texto: str
    idioma: str
    duracion_s: float
    modelo: str


def exigir_clave(x_api_key: str | None = Header(default=None)) -> None:
    esperada = settings.whisper_api_key
    if esperada and not (x_api_key and secrets.compare_digest(x_api_key, esperada)):
        raise HTTPException(status_code=401, detail="X-Api-Key invalida o ausente")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.semaforo = threading.BoundedSemaphore(settings.concurrencia)
    if getattr(app.state, "transcriptor", None) is None:  # las pruebas inyectan uno falso
        log.info("Cargando faster-whisper %s ...", settings.whisper_model)
        app.state.transcriptor = FasterWhisperTranscriptor(settings.whisper_model, settings.whisper_device, settings.whisper_compute_type)
    yield


app = FastAPI(title="SIGEC MS7 - Whisper", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, Any]:
    t: Transcriptor | None = getattr(app.state, "transcriptor", None)
    return {"status": "ok" if t else "cargando", "modelo": t.nombre if t else None}


@app.post("/transcribir", response_model=RespuestaTranscripcion, dependencies=[Depends(exigir_clave)])
def transcribir(audio: UploadFile = File(...), idioma: str | None = Form(default=None)) -> RespuestaTranscripcion:
    """Audio -> texto. Limites: tamano (MAX_AUDIO_BYTES) y duracion (MAX_DURACION_S)."""
    if idioma is not None and not (idioma.isalpha() and 2 <= len(idioma) <= 3):
        raise HTTPException(status_code=422, detail="idioma debe ser un codigo ISO 639-1 (p. ej. es, en)")
    datos = audio.file.read(settings.max_audio_bytes + 1)
    if len(datos) > settings.max_audio_bytes:
        raise HTTPException(status_code=413, detail=f"El audio supera {settings.max_audio_bytes // (1024 * 1024)} MB")
    if not datos:
        raise HTTPException(status_code=422, detail="El audio esta vacio")
    if not app.state.semaforo.acquire(timeout=30):
        raise HTTPException(status_code=429, detail="Servicio ocupado, reintenta en unos segundos")
    try:
        r = app.state.transcriptor.transcribir(datos, idioma or settings.idioma_por_defecto, settings.max_duracion_s)
    except AudioInvalido as e:
        raise HTTPException(status_code=415, detail=str(e)) from e
    except AudioDemasiadoLargo as e:
        raise HTTPException(status_code=413, detail=str(e)) from e
    finally:
        app.state.semaforo.release()
    return RespuestaTranscripcion(texto=r.texto, idioma=r.idioma, duracion_s=r.duracion_s, modelo=r.modelo)
