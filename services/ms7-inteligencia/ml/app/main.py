from __future__ import annotations

import logging
import secrets
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException

from .config import AVISO, settings
from .modelos import ModeloNoDisponible, ModeloNoShow, cargar_segmentos
from .schemas import Prediccion, RespuestaNoShow, SolicitudNoShow

log = logging.getLogger("ms7-ml")


def exigir_clave(x_api_key: str | None = Header(default=None)) -> None:
    esperada = settings.ml_api_key
    if esperada and not (x_api_key and secrets.compare_digest(x_api_key, esperada)):
        raise HTTPException(status_code=401, detail="X-Api-Key invalida o ausente")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.no_show = None
    app.state.error_modelo = None
    try:
        app.state.no_show = ModeloNoShow(settings.no_show_model_path)
        log.info("Modelo de inasistencia %s cargado", app.state.no_show.version)
    except ModeloNoDisponible as e:
        app.state.error_modelo = str(e)
        log.warning("%s", e)
    yield


app = FastAPI(title="SIGEC MS7 - ML", version="0.1.0", lifespan=lifespan)


def _modelo() -> ModeloNoShow:
    m: ModeloNoShow | None = app.state.no_show
    if m is None:
        raise HTTPException(status_code=503, detail=app.state.error_modelo)
    return m


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "modelo_no_show": app.state.no_show is not None}


@app.post("/predict/no-show", response_model=RespuestaNoShow, dependencies=[Depends(exigir_clave)])
def predecir(req: SolicitudNoShow) -> RespuestaNoShow:
    if len(req.citas) > settings.max_lote:
        raise HTTPException(status_code=413, detail=f"Maximo {settings.max_lote} citas por peticion")
    m = _modelo()
    filas = [c.model_dump(exclude={"id"}) for c in req.citas]
    for f in filas:
        f["beca"], f["sms_recibido"] = int(f["beca"]), int(f["sms_recibido"])
        if f["inasistencias_previas"] > f["citas_previas"]:
            raise HTTPException(status_code=422, detail="inasistencias_previas no puede superar citas_previas")
    res = m.predecir(filas)
    return RespuestaNoShow(
        predicciones=[
            Prediccion(id=c.id, probabilidad_inasistencia=round(p, 4), prediccion_inasistira=b, riesgo=r)  # type: ignore[arg-type]
            for c, (p, b, r) in zip(req.citas, res, strict=True)
        ],
        version_modelo=m.version,
        umbral=m.umbral,
        sintetico=m.sintetico,
        aviso=AVISO,
    )


@app.get("/segments/demanda", dependencies=[Depends(exigir_clave)])
def segmentos_demanda() -> dict[str, Any]:
    try:
        return {**cargar_segmentos(settings.segmentos_path), "aviso": AVISO}
    except ModeloNoDisponible as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


@app.get("/model/info", dependencies=[Depends(exigir_clave)])
def model_info() -> dict[str, Any]:
    m = _modelo()
    return {"no_show": m.info(), "aviso": AVISO}
