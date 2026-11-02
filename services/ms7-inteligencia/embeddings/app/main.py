from __future__ import annotations

import logging
import secrets
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .config import settings
from .modelo import Codificador, SentenceTransformersCodificador

log = logging.getLogger("ms7-embeddings")


class SolicitudEmbed(BaseModel):
    model_config = ConfigDict(extra="forbid")
    textos: list[str] = Field(min_length=1, description="Textos a vectorizar")


class RespuestaEmbed(BaseModel):
    modelo: str
    dimension: int
    vectores: list[list[float]]


def exigir_clave(x_api_key: str | None = Header(default=None)) -> None:
    esperada = settings.embeddings_api_key
    if esperada and not (x_api_key and secrets.compare_digest(x_api_key, esperada)):
        raise HTTPException(status_code=401, detail="X-Api-Key invalida o ausente")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if getattr(app.state, "codificador", None) is None:  # las pruebas inyectan uno falso
        log.info("Cargando el modelo %s ...", settings.embeddings_model)
        app.state.codificador = SentenceTransformersCodificador(settings.embeddings_model)
    yield


app = FastAPI(title="SIGEC MS7 - Embeddings", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, Any]:
    c: Codificador | None = getattr(app.state, "codificador", None)
    return {"status": "ok" if c else "cargando", "modelo": c.nombre if c else None, "dimension": c.dimension if c else None}


@app.post("/embed", response_model=RespuestaEmbed, dependencies=[Depends(exigir_clave)])
def embed(req: SolicitudEmbed) -> RespuestaEmbed:
    if len(req.textos) > settings.max_textos:
        raise HTTPException(status_code=413, detail=f"Maximo {settings.max_textos} textos por peticion")
    for i, t in enumerate(req.textos):
        if not t.strip():
            raise HTTPException(status_code=422, detail=f"El texto {i} esta vacio")
        if len(t) > settings.max_caracteres:
            raise HTTPException(status_code=413, detail=f"El texto {i} supera {settings.max_caracteres} caracteres")
    c: Codificador = app.state.codificador
    return RespuestaEmbed(modelo=c.nombre, dimension=c.dimension, vectores=c.codificar(req.textos))
