from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import pandas as pd

from .config import settings
from .features import ENTRADA, a_matriz


class ModeloNoDisponible(RuntimeError):
    pass


class ModeloNoShow:
    def __init__(self, ruta: Path):
        if not ruta.is_file():
            raise ModeloNoDisponible(
                f"No existe el modelo de inasistencia en {ruta}. Entrenalo con `ml/no-show/train.py` "
                "(requiere credenciales de Kaggle) o apunta NO_SHOW_MODEL_PATH a un modelo existente."
            )
        art: dict[str, Any] = joblib.load(ruta)
        self.modelo = art["modelo"]
        self.version: str = art["version"]
        self.umbral: float = float(art["umbral"])
        self.metricas: dict[str, Any] = art.get("metricas", {})
        self.sintetico: bool = bool(art.get("sintetico", False))
        self.meta = {k: art.get(k) for k in ("entrenado_en", "dataset", "features", "importancias", "parametros", "aviso")}

    def predecir(self, filas: list[dict[str, Any]]) -> list[tuple[float, bool, str]]:
        x = a_matriz(pd.DataFrame(filas, columns=ENTRADA))
        p = self.modelo.predict_proba(x)[:, 1]
        out = []
        for v in p:
            riesgo = "ALTO" if v >= self.umbral else "MEDIO" if v >= self.umbral * 0.75 else "BAJO"
            out.append((float(v), bool(v >= self.umbral), riesgo))
        return out

    def info(self) -> dict[str, Any]:
        return {"version": self.version, "umbral": self.umbral, "sintetico": self.sintetico, "metricas": self.metricas, **self.meta}


def cargar_segmentos(ruta: Path) -> dict[str, Any]:
    if not ruta.is_file():
        raise ModeloNoDisponible(
            f"No existe la segmentacion de demanda en {ruta}. Generala con `ml/demanda/segmentar.py` "
            "(datos de MS3 sembrados con `scripts/seed/citas-sinteticas.mjs`, o --fuente sintetico)."
        )
    return json.loads(ruta.read_text(encoding="utf-8"))
