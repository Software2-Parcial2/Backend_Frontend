"""Segmentacion K-means de la demanda de especialidades.

Unidad de observacion: especialidad x semana. Atributos: volumen de citas, antelacion media, % cancelaciones,
% de citas por la manana, % de fin de semana, medicos distintos y citas por medico. k se elige por silueta
(se informa tambien la inercia para el codo).
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

COLUMNAS = ["especialidad", "fecha_hora", "medico_id", "estado"]  # + fecha_creacion (opcional)
ATRIBUTOS = ["citas", "antelacion_media_dias", "pct_canceladas", "pct_manana", "pct_fin_semana", "medicos", "citas_por_medico"]
CANCELADAS = {"CANCELADA", "ANULADA"}


def agregar(df: pd.DataFrame) -> pd.DataFrame:
    faltan = [c for c in COLUMNAS if c not in df.columns]
    if faltan:
        raise ValueError(f"Faltan columnas: {faltan}")
    d = df.copy()
    d["fecha_hora"] = pd.to_datetime(d["fecha_hora"], utc=True)
    if "fecha_creacion" in d.columns:
        d["antelacion"] = (d["fecha_hora"] - pd.to_datetime(d["fecha_creacion"], utc=True)).dt.total_seconds() / 86400
    else:
        d["antelacion"] = np.nan
    d["semana"] = d["fecha_hora"].dt.tz_convert(None).dt.to_period("W").astype(str)
    d["cancelada"] = d["estado"].isin(CANCELADAS).astype(float)
    d["manana"] = (d["fecha_hora"].dt.hour < 12).astype(float)
    d["finde"] = (d["fecha_hora"].dt.dayofweek >= 5).astype(float)
    g = d.groupby(["especialidad", "semana"]).agg(
        citas=("especialidad", "size"),
        antelacion_media_dias=("antelacion", "mean"),
        pct_canceladas=("cancelada", "mean"),
        pct_manana=("manana", "mean"),
        pct_fin_semana=("finde", "mean"),
        medicos=("medico_id", "nunique"),
    ).reset_index()
    g["antelacion_media_dias"] = g["antelacion_media_dias"].fillna(0.0)
    g["citas_por_medico"] = g["citas"] / g["medicos"].clip(lower=1)
    return g


def segmentar(df: pd.DataFrame, k: int | None = None, k_max: int = 8, seed: int = 42) -> dict[str, Any]:
    obs = agregar(df)
    # Valores extremos (volumen > Q3 + 3*IQR, p. ej. datos de prueba olvidados o una carga masiva): se excluyen del ajuste y se informan aparte;
    # si no, K-means les dedica un segmento propio y la silueta lo premia.
    q1, q3 = obs["citas"].quantile([0.25, 0.75])
    valla = q3 + 3 * (q3 - q1)
    extremos = obs[obs["citas"] > valla] if q3 > q1 else obs.iloc[0:0]
    atipicos = [{"especialidad": r.especialidad, "semana": r.semana, "citas": int(r.citas)} for r in extremos.itertuples()]
    obs = obs.drop(extremos.index).reset_index(drop=True)
    if len(obs) < 6:
        raise ValueError(f"Hay solo {len(obs)} observaciones especialidad-semana; se necesitan al menos 6 para segmentar.")
    x = StandardScaler().fit_transform(obs[ATRIBUTOS])
    tope = min(k_max, len(obs) - 1)
    # Un segmento con muy pocas observaciones suele ser un valor atipico aislado (la silueta lo premia artificialmente):
    # solo se consideran los k cuyo segmento mas pequeno tenga al menos max(3, 5 %) de las observaciones.
    minimo = max(3, int(np.ceil(0.05 * len(obs))))
    evaluacion = []
    for kk in range(2, tope + 1):
        km = KMeans(n_clusters=kk, n_init=10, random_state=seed).fit(x)
        menor = int(np.bincount(km.labels_).min())
        evaluacion.append({"k": kk, "inercia": float(km.inertia_), "silueta": float(silhouette_score(x, km.labels_)), "segmento_menor": menor, "valido": menor >= minimo})
    validos = [e for e in evaluacion if e["valido"]] or evaluacion
    elegido = k or max(validos, key=lambda e: e["silueta"])["k"]
    km = KMeans(n_clusters=elegido, n_init=10, random_state=seed).fit(x)
    obs["segmento"] = km.labels_

    # Orden y etiqueta por volumen medio de citas (descendente)
    medias = obs.groupby("segmento")["citas"].mean().sort_values(ascending=False)
    orden = {int(s): i for i, s in enumerate(medias.index)}
    obs["segmento"] = obs["segmento"].map(orden)
    nombres = {3: ["Demanda alta", "Demanda media", "Demanda baja"], 2: ["Demanda alta", "Demanda baja"]}.get(
        elegido, [f"Segmento {i + 1} (~{medias.iloc[i]:.0f} citas/semana)" for i in range(elegido)]
    )
    segmentos = []
    for s in range(elegido):
        sub = obs[obs["segmento"] == s]
        segmentos.append(
            {
                "id": s,
                "etiqueta": nombres[s],
                "observaciones": int(len(sub)),
                "centroide": {a: round(float(sub[a].mean()), 3) for a in ATRIBUTOS},
                "especialidades": {e: int(n) for e, n in sub["especialidad"].value_counts().items()},
            }
        )
    por_esp = (
        obs.groupby("especialidad")["segmento"].agg(lambda s: int(s.mode().iloc[0])).to_dict()
    )
    resumen = obs.groupby("especialidad").agg(semanas=("semana", "nunique"), citas_total=("citas", "sum"), citas_semana=("citas", "mean"))
    return {
        "k": int(elegido),
        "criterio": "silueta maxima entre los k sin segmentos diminutos" if k is None else "k indicado",
        "tamano_minimo_segmento": minimo,
        "silueta": next(e["silueta"] for e in evaluacion if e["k"] == elegido) if any(e["k"] == elegido for e in evaluacion) else None,
        "evaluacion_k": evaluacion,
        "atributos": ATRIBUTOS,
        "observaciones": int(len(obs)),
        "atipicos_excluidos": atipicos,
        "segmentos": segmentos,
        "segmento_por_especialidad": {e: {"segmento": s, "etiqueta": nombres[s]} for e, s in por_esp.items()},
        "demanda_por_especialidad": {
            e: {"semanas": int(r.semanas), "citas_total": int(r.citas_total), "citas_por_semana": round(float(r.citas_semana), 2)}
            for e, r in resumen.iterrows()
        },
    }
