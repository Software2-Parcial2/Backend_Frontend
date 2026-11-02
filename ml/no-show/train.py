#!/usr/bin/env python
"""Entrena el Random Forest de inasistencia (no-show) con el dataset de Kaggle "Medical Appointment No Shows".

Dataset: joniarroba/noshowappointments (KaggleV2-May-2016.csv), descargado con la API de Kaggle.
  - Credenciales: ~/.kaggle/kaggle.json (o KAGGLE_USERNAME + KAGGLE_KEY). Sin ellas el script FALLA con un mensaje claro:
    NO inventa datos.
Atributos: SOLO administrativos (antelacion, dia de la semana, edad, beca, SMS, historial previo de inasistencias).
Se excluyen hipertension, diabetes, alcoholismo y discapacidad (datos clinicos) y el genero/barrio.
Division train/test POR FECHA de cita (el test es lo mas reciente). Desbalance: class_weight="balanced_subsample" y umbral elegido
sobre una ventana de validacion (la ultima parte del train, tambien por fecha) maximizando F1.

Uso (desde la raiz, con el venv de services/ms7-inteligencia/ml):
  services/ms7-inteligencia/ml/.venv/bin/python ml/no-show/train.py
  ... --csv ruta/KaggleV2-May-2016.csv                      # si ya lo descargaste
  ... --sintetico-solo-prueba-de-codigo                    # datos FICTICIOS para probar el codigo (modelo marcado sintetico)

AVISO: proyecto academico; es apoyo a la gestion (por ejemplo, reforzar recordatorios), no debe negar atencion a nadie.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parents[1] / "services" / "ms7-inteligencia" / "ml"))
from app.features import FEATURES, a_matriz, historial_previo  # noqa: E402

DATASET = "joniarroba/noshowappointments"
ARCHIVO = "KaggleV2-May-2016.csv"


def descargar(destino: Path) -> Path:
    kaggle_json = Path.home() / ".kaggle" / "kaggle.json"
    if not (kaggle_json.is_file() or (os.getenv("KAGGLE_USERNAME") and os.getenv("KAGGLE_KEY")) or os.getenv("KAGGLE_API_TOKEN")):
        sys.exit(
            "ERROR: no hay credenciales de Kaggle (~/.kaggle/kaggle.json o KAGGLE_USERNAME/KAGGLE_KEY).\n"
            f"Crea un token en https://www.kaggle.com/settings y vuelve a ejecutar, o descarga {ARCHIVO} y usa --csv.\n"
            "No se generan datos sustitutos."
        )
    from kaggle.api.kaggle_api_extended import KaggleApi

    api = KaggleApi()
    api.authenticate()
    destino.mkdir(parents=True, exist_ok=True)
    api.dataset_download_files(DATASET, path=str(destino), unzip=True, quiet=False)
    csv = next(destino.glob("*.csv"), None)
    if not csv:
        sys.exit(f"ERROR: la descarga de {DATASET} no produjo ningun CSV en {destino}")
    return csv


def sintetico(n: int = 12000, seed: int = 7) -> pd.DataFrame:
    """DATOS FICTICIOS con el mismo esquema que Kaggle. Solo para probar el codigo; el modelo resultante se marca `sintetico`."""
    rng = np.random.default_rng(seed)
    dias = pd.date_range("2016-04-29", periods=40, freq="D")
    cita = rng.choice(dias, n)
    antel = rng.exponential(10, n).astype(int)
    pac = rng.integers(1, n // 3, n)
    logit = -1.8 + 0.05 * antel - 0.4 * rng.integers(0, 2, n)
    falta = rng.random(n) < 1 / (1 + np.exp(-logit))
    return pd.DataFrame(
        {
            "PatientId": pac.astype(str),
            "AppointmentID": np.arange(n),
            "ScheduledDay": pd.to_datetime(cita) - pd.to_timedelta(antel, unit="D"),
            "AppointmentDay": pd.to_datetime(cita),
            "Age": rng.integers(0, 90, n),
            "Scholarship": rng.integers(0, 2, n),
            "SMS_received": rng.integers(0, 2, n),
            "No-show": np.where(falta, "Yes", "No"),
        }
    )


def preparar(df: pd.DataFrame) -> pd.DataFrame:
    d = pd.DataFrame(
        {
            "paciente": df["PatientId"].astype(str),
            "programada": pd.to_datetime(df["ScheduledDay"], utc=True).dt.tz_convert(None).dt.normalize(),
            "dia": pd.to_datetime(df["AppointmentDay"], utc=True).dt.tz_convert(None).dt.normalize(),
            "edad": df["Age"],
            "beca": df["Scholarship"],
            "sms_recibido": df["SMS_received"],
            "falta": (df["No-show"].astype(str).str.lower() == "yes").astype(int),
        }
    )
    d["antelacion_dias"] = (d["dia"] - d["programada"]).dt.days
    n0 = len(d)
    d = d[(d["antelacion_dias"] >= 0) & (d["edad"] >= 0) & (d["edad"] <= 110)].copy()  # fechas imposibles y edades invalidas
    print(f"Filas descartadas por datos invalidos: {n0 - len(d)} de {n0}")
    d["dia_semana"] = d["dia"].dt.dayofweek
    return historial_previo(d, "paciente", "dia", "falta")


def metricas(y, p, umbral):
    pred = (p >= umbral).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    return {
        "precision": float(precision_score(y, pred, zero_division=0)),
        "recall": float(recall_score(y, pred)),
        "f1": float(f1_score(y, pred)),
        "auc": float(roc_auc_score(y, p)),
        "matriz_confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "prevalencia_inasistencia": float(np.mean(y)),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", type=Path)
    ap.add_argument("--sintetico-solo-prueba-de-codigo", action="store_true", dest="sint")
    ap.add_argument("--arboles", type=int, default=300)
    ap.add_argument("--salida", type=Path, default=AQUI / "models" / "no-show.joblib")
    ap.add_argument("--reportes", type=Path, default=AQUI / "reports")
    a = ap.parse_args()

    if a.sint:
        print("*** DATOS SINTETICOS: solo prueba de codigo; el modelo se marca como sintetico y NO tiene valor predictivo real ***")
        bruto, origen = sintetico(), "sintetico"
    else:
        csv = a.csv or descargar(AQUI / "data")
        bruto, origen = pd.read_csv(csv), f"kaggle:{DATASET}"
    d = preparar(bruto).sort_values("dia")

    # Division por fecha: test = ultimo 20 % de los dias; validacion = ultimo 15 % de los dias del train.
    dias = np.sort(d["dia"].unique())
    corte_test = dias[int(len(dias) * 0.8)]
    train_total, test = d[d["dia"] < corte_test], d[d["dia"] >= corte_test]
    dias_tr = np.sort(train_total["dia"].unique())
    corte_val = dias_tr[int(len(dias_tr) * 0.85)]
    train, val = train_total[train_total["dia"] < corte_val], train_total[train_total["dia"] >= corte_val]
    if min(len(train), len(val), len(test)) < 50:
        sys.exit("ERROR: muy pocos datos tras la division por fecha.")
    print(f"train={len(train)} val={len(val)} test={len(test)} (corte test: {str(corte_test)[:10]})")

    cols = ["antelacion_dias", "dia_semana", "edad", "beca", "sms_recibido", "inasistencias_previas", "citas_previas"]
    rf = lambda: RandomForestClassifier(  # noqa: E731
        n_estimators=a.arboles, min_samples_leaf=25, max_features="sqrt", class_weight="balanced_subsample", n_jobs=-1, random_state=42
    )
    # 1) modelo de validacion para elegir el umbral
    m_val = rf().fit(a_matriz(train[cols]), train["falta"])
    pv = m_val.predict_proba(a_matriz(val[cols]))[:, 1]
    umbrales = np.linspace(0.2, 0.8, 61)
    umbral = float(umbrales[int(np.argmax([f1_score(val["falta"], pv >= u) for u in umbrales]))])
    # 2) modelo final con todo el train; se evalua una sola vez en test
    modelo = rf().fit(a_matriz(train_total[cols]), train_total["falta"])
    xt, yt = a_matriz(test[cols]), test["falta"].to_numpy()
    pt = modelo.predict_proba(xt)[:, 1]
    m = metricas(yt, pt, umbral)
    base = metricas(yt, np.full(len(yt), yt.mean()), 0.5)["auc"]  # referencia: AUC 0.5

    muestra = xt.sample(min(5000, len(xt)), random_state=1)
    perm = permutation_importance(modelo, muestra, yt[xt.index.get_indexer(muestra.index)], scoring="roc_auc", n_repeats=5, random_state=1, n_jobs=-1)
    imp = sorted(
        (
            {"variable": f, "importancia_gini": float(g), "importancia_permutacion_auc": float(p)}
            for f, g, p in zip(FEATURES, modelo.feature_importances_, perm.importances_mean, strict=True)
        ),
        key=lambda r: -r["importancia_permutacion_auc"],
    )

    huella = hashlib.sha256(pd.util.hash_pandas_object(d[cols + ["falta"]], index=False).values.tobytes()).hexdigest()[:8]
    version = f"rf-noshow-{datetime.now(timezone.utc):%Y%m%d}-{huella}" + ("-sintetico" if a.sint else "")
    ahora = datetime.now(timezone.utc).isoformat()
    parametros = {"n_estimators": a.arboles, "min_samples_leaf": 25, "class_weight": "balanced_subsample", "umbral": umbral}
    a.salida.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "modelo": modelo, "version": version, "umbral": umbral, "features": FEATURES, "metricas": m, "importancias": imp,
            "parametros": parametros, "entrenado_en": ahora, "dataset": origen, "sintetico": a.sint,
            "aviso": "Apoyo a la gestion; no clinico. Proyecto academico.",
        },
        a.salida,
    )
    sub = "smoke-sintetico" if a.sint else "kaggle"
    out = a.reportes / sub
    out.mkdir(parents=True, exist_ok=True)
    informe = {"version": version, "dataset": origen, "filas": {"train": len(train_total), "test": len(test)}, "umbral": umbral,
               "metricas_test": m, "auc_referencia_azar": base, "importancias": imp, "parametros": parametros, "entrenado_en": ahora}
    (out / "metricas.json").write_text(json.dumps(informe, indent=2, ensure_ascii=False), encoding="utf-8")
    md = [f"# Informe no-show ({version})", "", f"- Datos: `{origen}`" + (" (**SINTETICOS: solo prueba de codigo**)" if a.sint else ""),
          f"- Train/test por fecha: {len(train_total)} / {len(test)} (corte {str(corte_test)[:10]})", f"- Umbral (F1 en validacion): {umbral:.2f}", "",
          "## Metricas en test", "", "| Precision | Recall | F1 | AUC |", "|---|---|---|---|",
          f"| {m['precision']:.3f} | {m['recall']:.3f} | {m['f1']:.3f} | {m['auc']:.3f} |", "",
          f"Matriz de confusion: {m['matriz_confusion']}  (prevalencia de inasistencia: {m['prevalencia_inasistencia']:.1%})", "",
          "## Importancia de variables", "", "| Variable | Permutacion (caida de AUC) | Gini |", "|---|---|---|"]
    md += [f"| {r['variable']} | {r['importancia_permutacion_auc']:.4f} | {r['importancia_gini']:.4f} |" for r in imp]
    (out / "informe.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    pd.DataFrame(imp).to_csv(out / "importancias.csv", index=False)
    print(json.dumps({k: informe[k] for k in ("version", "umbral", "metricas_test")}, indent=2))
    print(f"Modelo: {a.salida}\nInforme: {out}")


if __name__ == "__main__":
    main()
