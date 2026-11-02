import asyncio
import hashlib
import json
import uuid
from types import SimpleNamespace

import pytest

from app.almacenamiento import ObjetoNoEncontrado
from app.mensajeria import ConsumidorInferencia, ErrorInfra, Procesador, Solicitud

from .conftest import imagen_bytes


class ClasificadorFalso:
    def predecir(self, x, con_grad_cam=False, imagen=None):
        from app.modelo import Prediccion

        return Prediccion(0.8, "NEUMONIA", "0.0.0-test", "stub-no-clinico")


def solicitud(datos: bytes, **over) -> Solicitud:
    base = dict(imagenId=uuid.uuid4(), pacienteId=uuid.uuid4(), bucket="radiografias", objectKey="radiografias/p/k.png", mime="image/png", hashSha256=hashlib.sha256(datos).hexdigest())
    return Solicitud(**{**base, **over})


def procesador(descargar):
    return Procesador(descargar, ClasificadorFalso())


async def test_procesar_completado():
    datos = imagen_bytes()
    r = await procesador(lambda b, k: datos).procesar(solicitud(datos))
    assert r.tipo == "imagenes.analisis.completado"
    assert r.payload["clase"] == "NEUMONIA" and r.payload["modelo"] == "stub-no-clinico"
    assert "no es un diagnostico" in r.payload["aviso"].lower()


async def test_hash_distinto_es_fallido():
    datos = imagen_bytes()
    r = await procesador(lambda b, k: datos).procesar(solicitud(datos, hashSha256="0" * 64))
    assert r.tipo == "imagenes.analisis.fallido" and "hash" in r.payload["motivo"]


async def test_objeto_inexistente_es_fallido():
    def descargar(b, k):
        raise ObjetoNoEncontrado(k)

    r = await procesador(descargar).procesar(solicitud(b"x"))
    assert r.tipo == "imagenes.analisis.fallido" and "no existe" in r.payload["motivo"]


async def test_imagen_corrupta_es_fallido():
    datos = b"no es una imagen"
    r = await procesador(lambda b, k: datos).procesar(solicitud(datos))
    assert r.tipo == "imagenes.analisis.fallido"


async def test_fallo_de_s3_es_error_de_infraestructura_reintentable():
    def descargar(b, k):
        raise ConnectionError("s3 caido")

    with pytest.raises(ErrorInfra):
        await procesador(descargar).procesar(solicitud(b"x"))


# --- consumidor sin red: intercambios falsos ---------------------------------------------------------------------

class IntercambioFalso:
    def __init__(self, nombre, publicados):
        self.nombre, self.publicados = nombre, publicados

    async def publish(self, msg, routing_key):
        self.publicados.append((self.nombre, routing_key, msg))


class MensajeFalso:
    def __init__(self, cuerpo: bytes, headers=None):
        self.body, self.headers, self.content_type, self.message_id = cuerpo, headers or {}, "application/json", str(uuid.uuid4())
        self.acks = self.nacks = 0

    async def ack(self):
        self.acks += 1

    async def nack(self, requeue=True):
        self.nacks += 1


def consumidor(settings, proc):
    c = ConsumidorInferencia(settings, proc)
    c.publicados = []
    c._ex = {n: IntercambioFalso(n, c.publicados) for n in ("sigec.saga", "sigec.eventos", "sigec.retry", "sigec.dlx")}
    return c


def sobre(payload: dict, tipo="imagenes.analisis.solicitar") -> tuple[bytes, str, str]:
    mid, corr = str(uuid.uuid4()), str(uuid.uuid4())
    env = {"id": mid, "type": tipo, "occurredAt": "2026-11-01T10:00:00.000Z", "correlationId": corr, "causationId": None, "version": 1, "payload": payload}
    return json.dumps(env).encode(), mid, corr


def payload_ok(datos: bytes) -> dict:
    return {"imagenId": str(uuid.uuid4()), "pacienteId": str(uuid.uuid4()), "bucket": "radiografias", "objectKey": "radiografias/p/k.png", "mime": "image/png", "hashSha256": hashlib.sha256(datos).hexdigest()}


async def test_responde_completado_con_correlation_y_causation(settings):
    datos = imagen_bytes()
    c = consumidor(settings, procesador(lambda b, k: datos))
    cuerpo, mid, corr = sobre(payload_ok(datos))
    m = MensajeFalso(cuerpo)
    await c.manejar(m)
    assert m.acks == 1 and m.nacks == 0
    exchange, rk, enviado = c.publicados[0]
    env = json.loads(enviado.body)
    assert (exchange, rk) == ("sigec.saga", "imagenes.analisis.completado")
    assert env["correlationId"] == corr and env["causationId"] == mid and env["type"] == "imagenes.analisis.completado"
    assert enviado.delivery_mode.value == 2  # persistente


async def test_mensaje_invalido_va_a_la_dlq_con_el_motivo(settings):
    c = consumidor(settings, procesador(lambda b, k: b""))
    for cuerpo in (b"no es json", sobre({"imagenId": "no-uuid"})[0], sobre({"x": 1}, tipo="imagenes.analisis.solicitar")[0]):
        m = MensajeFalso(cuerpo)
        await c.manejar(m)
        assert m.acks == 1
    assert [p[:2] for p in c.publicados] == [("sigec.dlx", "ms5.inferencia.comandos.dlq")] * 3
    assert all("mensaje invalido" in p[2].headers["x-last-error"] for p in c.publicados)


async def test_tipo_desconocido_se_ignora(settings):
    c = consumidor(settings, procesador(lambda b, k: b""))
    m = MensajeFalso(sobre({}, tipo="otra.cosa.mas")[0])
    await c.manejar(m)
    assert m.acks == 1 and c.publicados == []


async def test_error_de_infra_reencola_con_backoff_y_luego_dlq(settings):
    def descargar(b, k):
        raise ConnectionError("s3 caido")

    c = consumidor(settings, procesador(descargar))
    cuerpo, _, _ = sobre(payload_ok(b"x"))
    esperado = ["ms5.inferencia.comandos.retry.5s", "ms5.inferencia.comandos.retry.30s", "ms5.inferencia.comandos.retry.2m"]
    for n in range(3):
        m = MensajeFalso(cuerpo, headers={"x-retries": n} if n else {})
        await c.manejar(m)
        assert m.acks == 1
        assert c.publicados[-1][:2] == ("sigec.retry", esperado[n])
        assert c.publicados[-1][2].headers["x-retries"] == n + 1
    agotado = MensajeFalso(cuerpo, headers={"x-retries": 3})
    await c.manejar(agotado)
    assert c.publicados[-1][:2] == ("sigec.dlx", "ms5.inferencia.comandos.dlq")
    assert "no se pudo descargar" in c.publicados[-1][2].headers["x-last-error"]


async def test_la_imagen_invalida_no_se_reintenta_se_responde_fallido(settings):
    datos = b"no es imagen"
    c = consumidor(settings, procesador(lambda b, k: datos))
    m = MensajeFalso(sobre(payload_ok(datos))[0])
    await c.manejar(m)
    assert [p[1] for p in c.publicados] == ["imagenes.analisis.fallido"]


async def test_si_no_se_puede_publicar_la_respuesta_el_mensaje_se_devuelve(settings):
    datos = imagen_bytes()
    c = consumidor(settings, procesador(lambda b, k: datos))

    async def falla(msg, routing_key):
        raise RuntimeError("broker caido")

    c._ex["sigec.saga"].publish = falla
    m = MensajeFalso(sobre(payload_ok(datos))[0])
    await c._on_message(m)
    assert m.acks == 0 and m.nacks == 1  # nack con requeue: no se pierde
