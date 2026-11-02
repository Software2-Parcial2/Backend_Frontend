"""API HTTP del servicio de inferencia: GET /health, GET /modelo, POST /predict (multipart). Ademas arranca el consumidor de RabbitMQ."""

import asyncio
import contextlib
import hmac
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, UploadFile

from .almacenamiento import AlmacenS3
from .config import AVISO, Settings, get_settings
from .mensajeria import ConsumidorInferencia, Procesador
from .modelo import Clasificador, cargar_clasificador
from .preprocesado import ImagenInvalida, a_tensor, cargar_imagen

log = logging.getLogger("inferencia")


def create_app(settings: Settings | None = None, clasificador: Clasificador | None = None) -> FastAPI:
    s = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.clasificador = clasificador or await asyncio.to_thread(cargar_clasificador, s)
        c: Clasificador = app.state.clasificador
        if c.es_stub:
            log.warning("USANDO EL MODELO FICTICIO 'stub-no-clinico': sus resultados NO tienen valor clinico")
        tarea = None
        if s.enable_consumer:
            almacen = AlmacenS3(s)
            app.state.consumidor = ConsumidorInferencia(s, Procesador(almacen.descargar, c))
            tarea = asyncio.create_task(app.state.consumidor.ejecutar())
        yield
        if tarea:
            tarea.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await tarea

    app = FastAPI(title="SIGEC - Inferencia de radiografias", version="0.1.0", lifespan=lifespan, description=AVISO)

    def autorizar(x_api_key: str | None = Header(default=None)) -> None:
        if s.inference_api_key and not (x_api_key and hmac.compare_digest(x_api_key, s.inference_api_key)):
            raise HTTPException(status_code=401, detail="X-Api-Key invalida")

    @app.get("/health")
    async def health():
        c: Clasificador = app.state.clasificador
        return {"status": "UP", "modelo": c.nombre, "version_modelo": c.version, "clinico": not c.es_stub}

    @app.get("/modelo", dependencies=[Depends(autorizar)])
    async def modelo():
        c: Clasificador = app.state.clasificador
        return {"modelo": c.nombre, "version_modelo": c.version, "umbral": c.umbral, "grad_cam": c.capa_cam is not None, "aviso": AVISO,
                **({"advertencia": "MODELO FICTICIO NO CLINICO: solo para probar el flujo"} if c.es_stub else {})}

    @app.post("/predict", dependencies=[Depends(autorizar)])
    async def predict(file: UploadFile = File(...), grad_cam: bool = Query(False)):
        datos = await file.read(s.max_image_bytes + 1)
        if len(datos) > s.max_image_bytes:
            raise HTTPException(status_code=413, detail=f"la imagen supera {s.max_image_bytes} bytes")
        try:
            img = cargar_imagen(datos)
        except ImagenInvalida as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        c: Clasificador = app.state.clasificador
        p = await asyncio.to_thread(c.predecir, a_tensor(img), grad_cam, img)
        return p.como_dict()

    return app


app = create_app()  # uvicorn app.main:app (el modelo se carga al arrancar, no al importar)
