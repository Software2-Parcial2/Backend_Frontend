import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sklearn.ensemble import RandomForestClassifier

from app.config import settings
from app.features import ENTRADA, a_matriz


@pytest.fixture(scope="session")
def datos_citas() -> pd.DataFrame:
    """Citas de ejemplo pequenas y deterministas (3 especialidades de volumen muy distinto)."""
    rng = np.random.default_rng(3)
    filas = []
    ini = pd.Timestamp("2026-01-05", tz="UTC")
    for esp, vol in {"Medicina General": 30, "Pediatria": 12, "Neurologia": 2}.items():
        for sem in range(12):
            for _ in range(rng.poisson(vol)):
                f = ini + pd.Timedelta(weeks=sem, days=int(rng.integers(0, 5)), hours=int(rng.integers(8, 17)))
                filas.append({"especialidad": esp, "fecha_hora": f, "medico_id": f"{esp[:3]}-{int(rng.integers(0, 3))}",
                              "estado": "CONFIRMADA" if rng.random() > 0.1 else "CANCELADA", "fecha_creacion": f - pd.Timedelta(days=5)})
    return pd.DataFrame(filas)


@pytest.fixture()
def cliente(tmp_path: Path, monkeypatch):
    rng = np.random.default_rng(0)
    n = 600
    df = pd.DataFrame({"antelacion_dias": rng.integers(0, 40, n), "dia_semana": rng.integers(0, 7, n), "edad": rng.integers(0, 90, n),
                       "beca": rng.integers(0, 2, n), "sms_recibido": rng.integers(0, 2, n), "citas_previas": rng.integers(0, 6, n)})
    df["inasistencias_previas"] = (df["citas_previas"] * rng.random(n)).astype(int)
    y = (df["antelacion_dias"] + 15 * df["inasistencias_previas"] + rng.normal(0, 5, n) > 30).astype(int)
    modelo = RandomForestClassifier(n_estimators=20, random_state=0).fit(a_matriz(df[ENTRADA]), y)
    ruta = tmp_path / "no-show.joblib"
    joblib.dump({"modelo": modelo, "version": "test-1", "umbral": 0.5, "metricas": {"auc": 0.9}, "sintetico": True, "features": []}, ruta)
    seg = tmp_path / "segmentos.json"
    seg.write_text(json.dumps({"k": 2, "segmentos": []}))
    monkeypatch.setattr(settings, "no_show_model_path", ruta)
    monkeypatch.setattr(settings, "segmentos_path", seg)
    monkeypatch.setattr(settings, "ml_api_key", None)
    from app.main import app

    with TestClient(app) as c:
        yield c
