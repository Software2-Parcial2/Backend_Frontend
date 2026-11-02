"""Atributos del modelo de inasistencia: SOLO administrativos, nunca clinicos (sin diagnosticos ni comorbilidades)."""

from __future__ import annotations

import numpy as np
import pandas as pd

# Orden fijo: es el contrato entre el entrenamiento (ml/no-show/train.py) y la API.
FEATURES = [
    "antelacion_dias",
    "dia_semana",
    "edad",
    "beca",
    "sms_recibido",
    "inasistencias_previas",
    "citas_previas",
    "tasa_inasistencia_previa",
]

# Columnas que se aceptan como entrada (tasa_inasistencia_previa se deriva).
ENTRADA = [f for f in FEATURES if f != "tasa_inasistencia_previa"]


def a_matriz(df: pd.DataFrame) -> pd.DataFrame:
    """Devuelve las FEATURES (calculando la tasa previa) a partir de las columnas de ENTRADA."""
    x = df[ENTRADA].astype(float).copy()
    x["tasa_inasistencia_previa"] = np.where(x["citas_previas"] > 0, x["inasistencias_previas"] / x["citas_previas"].clip(lower=1), 0.0)
    return x[FEATURES]


def historial_previo(df: pd.DataFrame, paciente: str, dia: str, inasistio: str) -> pd.DataFrame:
    """Citas e inasistencias ANTERIORES (estrictamente de dias previos) del mismo paciente; sin fuga de informacion.

    Las citas del mismo dia no cuentan entre si, y solo se usa el resultado de citas ya ocurridas.
    """
    diario = df.groupby([paciente, dia]).agg(n=(inasistio, "size"), faltas=(inasistio, "sum")).reset_index().sort_values([paciente, dia])
    diario["citas_previas"] = diario.groupby(paciente)["n"].cumsum() - diario["n"]
    diario["inasistencias_previas"] = diario.groupby(paciente)["faltas"].cumsum() - diario["faltas"]
    return df.merge(diario[[paciente, dia, "citas_previas", "inasistencias_previas"]], on=[paciente, dia], how="left")
