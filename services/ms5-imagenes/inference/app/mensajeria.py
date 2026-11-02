"""Consumidor de imagenes.analisis.solicitar (aio-pika): ack manual, publisher confirms, reintentos por colas de espera y DLQ.

Misma semantica que packages/messaging-nest (ver contracts/events/README.md):
 - mensaje que no cumple el contrato -> DLQ directa con el motivo;
 - error de infraestructura (S3 caido...) -> se reencola en una cola de espera (5 s, 30 s, 2 min), maximo 3 reintentos, luego DLQ;
 - imagen invalida / hash distinto / objeto inexistente -> se responde `imagenes.analisis.fallido` (no se reintenta).
"""

import asyncio
import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Literal
from uuid import UUID

import aio_pika
from aio_pika import DeliveryMode, ExchangeType, IncomingMessage, Message
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .almacenamiento import ObjetoNoEncontrado
from .config import AVISO, Settings
from .modelo import Clasificador
from .preprocesado import ImagenInvalida, a_tensor, cargar_imagen

log = logging.getLogger("inferencia")

TIPO_SOLICITAR = "imagenes.analisis.solicitar"
TIPO_COMPLETADO = "imagenes.analisis.completado"
TIPO_FALLIDO = "imagenes.analisis.fallido"


class Envelope(BaseModel):
    """Sobre comun (contracts/events/envelope.schema.json)."""

    model_config = ConfigDict(extra="forbid")
    id: UUID
    type: str
    occurredAt: str
    correlationId: UUID
    causationId: UUID | None
    version: int = Field(ge=1)
    payload: dict[str, Any]


class Solicitud(BaseModel):
    """Payload de imagenes.analisis.solicitar."""

    model_config = ConfigDict(extra="forbid")
    imagenId: UUID
    pacienteId: UUID
    bucket: str
    objectKey: str
    mime: Literal["image/jpeg", "image/png", "application/dicom"]
    hashSha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class ErrorInfra(Exception):
    """Fallo transitorio de infraestructura: el mensaje se reintenta."""


class Respuesta(BaseModel):
    tipo: str
    payload: dict[str, Any]


def _ahora() -> str:
    ahora = datetime.now(timezone.utc)
    return ahora.strftime("%Y-%m-%dT%H:%M:%S.") + f"{ahora.microsecond // 1000:03d}Z"


class Procesador:
    """Logica pura del analisis (sin RabbitMQ): descarga, verifica la integridad, decodifica y predice."""

    def __init__(self, descargar: Callable[[str, str], bytes], clasificador: Clasificador):
        self._descargar, self._clasificador = descargar, clasificador

    async def procesar(self, s: Solicitud) -> Respuesta:
        try:
            datos = await asyncio.to_thread(self._descargar, s.bucket, s.objectKey)
        except ObjetoNoEncontrado:
            return self._fallido(s, "el objeto no existe en el almacenamiento")
        except Exception as e:  # noqa: BLE001 - S3 caido, timeout, credenciales...: transitorio
            raise ErrorInfra(f"no se pudo descargar la imagen: {e}") from e
        if hashlib.sha256(datos).hexdigest() != s.hashSha256:
            return self._fallido(s, "el hash SHA-256 no coincide: la imagen cambio o se corrompio")
        try:
            img = cargar_imagen(datos)
        except ImagenInvalida as e:
            return self._fallido(s, str(e))
        p = await asyncio.to_thread(self._clasificador.predecir, a_tensor(img))
        return Respuesta(
            tipo=TIPO_COMPLETADO,
            payload={
                "imagenId": str(s.imagenId),
                "probabilidad_neumonia": round(p.probabilidad_neumonia, 6),
                "clase": p.clase,
                "version_modelo": p.version_modelo,
                "modelo": p.modelo,
                "aviso": AVISO,
            },
        )

    @staticmethod
    def _fallido(s: Solicitud, motivo: str) -> Respuesta:
        return Respuesta(tipo=TIPO_FALLIDO, payload={"imagenId": str(s.imagenId), "motivo": motivo})


class ConsumidorInferencia:
    def __init__(self, settings: Settings, procesador: Procesador):
        self._s, self._proc = settings, procesador
        self._topo = json.loads(settings.topology_file.read_text())
        self._retry = self._topo["retry"]
        self._conn: aio_pika.abc.AbstractRobustConnection | None = None
        self._canal = None
        self._ex: dict[str, aio_pika.abc.AbstractExchange] = {}
        self.listo = asyncio.Event()

    async def ejecutar(self) -> None:
        """Bucle principal: conecta (reintentando mientras RabbitMQ no este) y consume hasta que se cancele la tarea."""
        while True:
            try:
                self._conn = await aio_pika.connect_robust(self._s.amqp_url)
                break
            except Exception as e:  # noqa: BLE001
                log.warning("RabbitMQ no disponible (%s); reintento en 3 s", e)
                await asyncio.sleep(3)
        async with self._conn:
            self._canal = await self._conn.channel(publisher_confirms=True)
            await self._canal.set_qos(prefetch_count=self._s.consumer_prefetch)
            cola = await self._declarar()
            await cola.consume(self._on_message)
            self.listo.set()
            log.info("consumiendo %s", self._s.queue_name)
            await asyncio.Future()  # hasta cancelar

    async def _declarar(self) -> aio_pika.abc.AbstractQueue:
        """Declara exchanges y la familia de colas de ms5.inferencia.comandos (identica a topology.json; si difiere, RabbitMQ responde 406)."""
        for ex in self._topo["exchanges"]:
            self._ex[ex["name"]] = await self._canal.declare_exchange(ex["name"], ExchangeType(ex["type"]), durable=ex["durable"])
        spec = next(q for q in self._topo["queues"] if q["name"] == self._s.queue_name)
        n = spec["name"]
        cola = await self._canal.declare_queue(n, durable=True, arguments={"x-dead-letter-exchange": self._retry["deadLetterExchange"], "x-dead-letter-routing-key": f"{n}.dlq"})
        for b in spec["bindings"]:
            for rk in b["routingKeys"]:
                await cola.bind(self._ex[b["exchange"]], routing_key=rk)
        dlq = await self._canal.declare_queue(f"{n}.dlq", durable=True)
        await dlq.bind(self._ex[self._retry["deadLetterExchange"]], routing_key=f"{n}.dlq")
        for t in self._retry["tiers"]:
            nombre = f"{n}.{t['suffix']}"
            espera = await self._canal.declare_queue(nombre, durable=True, arguments={"x-message-ttl": t["ttlMs"], "x-dead-letter-exchange": "", "x-dead-letter-routing-key": n})
            await espera.bind(self._ex[self._retry["exchange"]], routing_key=nombre)
        return cola

    # --- mensajes ---------------------------------------------------------------------------------------------

    async def _on_message(self, message: IncomingMessage) -> None:
        try:
            await self.manejar(message)
        except Exception as e:  # noqa: BLE001 - nunca perder el mensaje por un error inesperado
            log.exception("error inesperado procesando el mensaje: %s", e)
            await message.nack(requeue=True)

    async def manejar(self, message: IncomingMessage) -> None:
        try:
            env = Envelope.model_validate_json(message.body)
            if env.type != TIPO_SOLICITAR:
                log.warning("tipo %s desconocido; se ignora", env.type)
                await message.ack()
                return
            solicitud = Solicitud.model_validate(env.payload)
        except ValidationError as e:
            await self._a_dlq(message, f"mensaje invalido: {e.error_count()} error(es): {e.errors()[0]['loc']} {e.errors()[0]['msg']}")
            return

        try:
            respuesta = await self._proc.procesar(solicitud)
        except ErrorInfra as e:
            await self._reintentar_o_dlq(message, str(e))
            return
        await self._publicar(env, respuesta)
        await message.ack()
        log.info("imagen %s -> %s", str(solicitud.imagenId)[:8], respuesta.tipo)

    async def _publicar(self, causa: Envelope, r: Respuesta) -> None:
        env = {"id": str(uuid.uuid4()), "type": r.tipo, "occurredAt": _ahora(), "correlationId": str(causa.correlationId), "causationId": str(causa.id), "version": 1, "payload": r.payload}
        msg = Message(json.dumps(env).encode(), content_type="application/json", delivery_mode=DeliveryMode.PERSISTENT, message_id=env["id"], type=r.tipo, correlation_id=env["correlationId"])
        await self._ex["sigec.saga"].publish(msg, routing_key=r.tipo)  # con confirms: espera al broker

    async def _reintentar_o_dlq(self, message: IncomingMessage, motivo: str) -> None:
        retries = int((message.headers or {}).get("x-retries", 0))
        if retries >= self._retry["maxRetries"]:
            log.error("agoto %s reintentos -> DLQ (%s)", retries, motivo)
            await self._a_dlq(message, motivo)
            return
        tiers = self._retry["tiers"]
        t = tiers[min(retries, len(tiers) - 1)]
        log.warning("fallo (%s); reintento %s/%s en %s ms", motivo, retries + 1, self._retry["maxRetries"], t["ttlMs"])
        await self._reenviar(message, self._retry["exchange"], f"{self._s.queue_name}.{t['suffix']}", {"x-retries": retries + 1, "x-last-error": motivo[:500]})
        await message.ack()

    async def _a_dlq(self, message: IncomingMessage, motivo: str) -> None:
        await self._reenviar(message, self._retry["deadLetterExchange"], f"{self._s.queue_name}.dlq", {"x-last-error": motivo[:500]})
        await message.ack()

    async def _reenviar(self, message: IncomingMessage, exchange: str, routing_key: str, extra: dict) -> None:
        msg = Message(message.body, content_type=message.content_type, delivery_mode=DeliveryMode.PERSISTENT, message_id=message.message_id, headers={**(message.headers or {}), **extra})
        await self._ex[exchange].publish(msg, routing_key=routing_key)
