#!/usr/bin/env python
"""Segmentacion K-means de la demanda de especialidades (ver services/ms7-inteligencia/ml/app/demanda.py).

Fuentes de datos (`--fuente`):
  ms3        citas reales del sistema vía el gateway (GET /api/citas con cursor). Usa KEYCLOAK_USER/KEYCLOAK_PASSWORD
             (por defecto el usuario de pruebas `administrador`). Siembra datos con scripts/seed/citas-sinteticas.mjs.
  csv        CSV con columnas especialidad, fecha_hora, medico_id, estado [, fecha_creacion].
  sintetico  generador FICTICIO (claramente etiquetado en la salida) para probar el codigo cuando MS3 esta vacio.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx
import numpy as np
import pandas as pd

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parents[1] / "services" / "ms7-inteligencia" / "ml"))
from app.demanda import segmentar  # noqa: E402


def desde_ms3(gateway: str, keycloak: str) -> pd.DataFrame:
    tok = httpx.post(
        f"{keycloak}/realms/sigec/protocol/openid-connect/token",
        data={"grant_type": "password", "client_id": "sigec-shell", "username": os.getenv("KEYCLOAK_USER", "administrador"),
              "password": os.getenv("KEYCLOAK_PASSWORD", "Sigec123!")},
        timeout=15,
    )
    tok.raise_for_status()
    h = {"Authorization": f"Bearer {tok.json()['access_token']}"}
    filas, cursor = [], None
    while True:
        r = httpx.get(f"{gateway}/api/citas", params={"limite": 100, **({"cursor": cursor} if cursor else {})}, headers=h, timeout=30)
        r.raise_for_status()
        cuerpo = r.json()
        for c in cuerpo["items"]:
            filas.append({"especialidad": c["especialidad"], "fecha_hora": c["fechaHora"], "medico_id": c["medicoId"],
                          "estado": c["estado"], "fecha_creacion": c.get("creadaEn")})
        cursor = cuerpo.get("siguiente")
        if not cursor:
            break
    if not filas:
        sys.exit("ERROR: MS3 no devolvio citas. Siembra datos con scripts/seed/citas-sinteticas.mjs o usa --fuente sintetico.")
    return pd.DataFrame(filas)


def sintetico(seed: int = 11) -> pd.DataFrame:
    """DATOS FICTICIOS: 8 especialidades con volumenes y estacionalidad distintos durante 6 meses."""
    rng = np.random.default_rng(seed)
    base = {"Medicina General": 40, "Pediatria": 30, "Cardiologia": 14, "Dermatologia": 12, "Ginecologia": 20,
            "Traumatologia": 16, "Oftalmologia": 8, "Neurologia": 5}
    filas = []
    ini = pd.Timestamp("2026-01-05", tz="UTC")
    for esp, vol in base.items():
        medicos = [f"{esp[:3]}-{i}" for i in range(1 + vol // 15)]
        for sem in range(26):
            n = rng.poisson(vol * (1 + 0.15 * np.sin(sem / 4)))
            for _ in range(n):
                f = ini + pd.Timedelta(weeks=sem, days=int(rng.integers(0, 6)), hours=int(rng.integers(8, 18)))
                filas.append({"especialidad": esp, "fecha_hora": f, "medico_id": rng.choice(medicos),
                              "estado": rng.choice(["CONFIRMADA", "CANCELADA"], p=[0.9, 0.1]),
                              "fecha_creacion": f - pd.Timedelta(days=float(rng.exponential(7)))})
    return pd.DataFrame(filas)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fuente", choices=["ms3", "csv", "sintetico"], default="ms3")
    ap.add_argument("--archivo", type=Path)
    ap.add_argument("--k", type=int, help="Fuerza k (por defecto: silueta maxima)")
    ap.add_argument("--gateway", default=os.getenv("GATEWAY_URL", "http://localhost:8090"))
    ap.add_argument("--keycloak", default=os.getenv("KEYCLOAK_URL", "http://localhost:8080"))
    ap.add_argument("--salida", type=Path, default=AQUI / "models" / "segmentos.json")
    a = ap.parse_args()

    if a.fuente == "ms3":
        df = desde_ms3(a.gateway, a.keycloak)
    elif a.fuente == "csv":
        if not a.archivo:
            sys.exit("ERROR: --fuente csv requiere --archivo")
        df = pd.read_csv(a.archivo)
    else:
        print("*** DATOS SINTETICOS (generador interno): solo para pruebas del codigo ***")
        df = sintetico()
    res = segmentar(df, k=a.k)
    res.update({"fuente": a.fuente, "sintetico": a.fuente == "sintetico", "generado_en": datetime.now(timezone.utc).isoformat(), "citas": int(len(df))})
    a.salida.parent.mkdir(parents=True, exist_ok=True)
    a.salida.write_text(json.dumps(res, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"k={res['k']} silueta={res['silueta']:.3f} observaciones={res['observaciones']} -> {a.salida}")
    for e in res["evaluacion_k"]:
        print(f"  k={e['k']}: silueta={e['silueta']:.3f} inercia={e['inercia']:.1f}")
    for e, s in res["segmento_por_especialidad"].items():
        print(f"  {e}: {s['etiqueta']}")


if __name__ == "__main__":
    main()
