"""Carga del modelo, prediccion y Grad-CAM. Contrato del modelo: entrada float32 (N,224,224,3) en [0,255]; salida sigmoide P(neumonia)."""

import base64
import io
import json
import os
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

from .config import AVISO, Settings

STUB_NOMBRE = "stub-no-clinico"


@dataclass
class Prediccion:
    probabilidad_neumonia: float
    clase: str
    version_modelo: str
    modelo: str
    aviso: str = AVISO
    grad_cam: str | None = None

    def como_dict(self) -> dict:
        d = {
            "probabilidad_neumonia": round(self.probabilidad_neumonia, 6),
            "clase": self.clase,
            "version_modelo": self.version_modelo,
            "modelo": self.modelo,
            "aviso": self.aviso,
        }
        if self.grad_cam is not None:
            d["grad_cam"] = self.grad_cam
        return d


class ModeloNoDisponible(RuntimeError):
    pass


def _keras():
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
    import keras  # noqa: PLC0415 - import perezoso: TensorFlow tarda en cargar

    return keras


def construir_stub():
    """Modelo FICTICIO y NO CLINICO: pesos aleatorios con semilla fija. Solo sirve para probar el flujo de extremo a extremo."""
    keras = _keras()
    keras.utils.set_random_seed(20260101)
    entrada = keras.Input((224, 224, 3))
    x = keras.layers.Rescaling(1.0 / 255.0)(entrada)
    x = keras.layers.Conv2D(8, 3, strides=4, activation="relu")(x)
    x = keras.layers.Conv2D(8, 3, activation="relu", name="ultima_conv")(x)
    x = keras.layers.GlobalAveragePooling2D()(x)
    salida = keras.layers.Dense(1, activation="sigmoid")(x)
    return keras.Model(entrada, salida, name="stub_no_clinico")


class Clasificador:
    def __init__(self, modelo, nombre: str, version: str, umbral: float, capa_cam: str | None):
        self.modelo, self.nombre, self.version, self.umbral, self.capa_cam = modelo, nombre, version, umbral, capa_cam

    @property
    def es_stub(self) -> bool:
        return self.nombre == STUB_NOMBRE

    def predecir(self, x: np.ndarray, con_grad_cam: bool = False, imagen: Image.Image | None = None) -> Prediccion:
        p = float(self.modelo.predict(x, verbose=0).reshape(-1)[0])
        clase = "NEUMONIA" if p >= self.umbral else "NORMAL"
        cam = None
        if con_grad_cam and imagen is not None and self.capa_cam:
            cam = self._grad_cam(x, imagen)
        return Prediccion(p, clase, self.version, self.nombre, grad_cam=cam)

    def _grad_cam(self, x: np.ndarray, imagen: Image.Image) -> str | None:
        import tensorflow as tf  # noqa: PLC0415

        keras = _keras()
        try:
            sub = keras.Model(self.modelo.inputs, [self.modelo.get_layer(self.capa_cam).output, self.modelo.output])
            with tf.GradientTape() as tape:
                mapas, salida = sub(tf.convert_to_tensor(x))
                perdida = salida[:, 0]
            grads = tape.gradient(perdida, mapas)
            pesos = tf.reduce_mean(grads, axis=(1, 2))
            cam = tf.nn.relu(tf.reduce_sum(mapas * pesos[:, None, None, :], axis=-1))[0].numpy()
        except Exception:  # noqa: BLE001 - Grad-CAM es opcional: nunca debe romper la prediccion
            return None
        cam = cam / cam.max() if cam.max() > 0 else cam
        mapa = Image.fromarray((cam * 255).astype(np.uint8)).resize(imagen.size, Image.Resampling.BILINEAR)
        rojo = np.zeros((*mapa.size[::-1], 3), dtype=np.uint8)
        rojo[..., 0] = np.asarray(mapa)
        mezcla = Image.blend(imagen.convert("RGB"), Image.fromarray(rojo), 0.4)
        buf = io.BytesIO()
        mezcla.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()


def cargar_clasificador(s: Settings) -> Clasificador:
    """Carga el modelo entrenado; si no existe, y solo con ALLOW_STUB=true, el modelo ficticio NO CLINICO."""
    ruta: Path = s.model_path
    if ruta.exists():
        keras = _keras()
        meta = {}
        if ruta.with_suffix(".json").exists():
            meta = json.loads(ruta.with_suffix(".json").read_text())
        return Clasificador(keras.models.load_model(ruta), meta.get("nombre", ruta.stem), str(meta.get("version", "sin-version")), float(meta.get("umbral", 0.5)), meta.get("capa_grad_cam"))
    if not s.allow_stub:
        raise ModeloNoDisponible(f"No existe el modelo {ruta} y ALLOW_STUB=false. Entrena uno con ml/pneumonia/train.py.")
    return Clasificador(construir_stub(), STUB_NOMBRE, "0.0.0-stub", 0.5, "ultima_conv")
