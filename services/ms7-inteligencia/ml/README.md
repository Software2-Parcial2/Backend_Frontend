# MS7 ML (FastAPI, puerto 8007)

Modelos de apoyo a la **gestion** (no clinicos): riesgo de inasistencia (Random Forest) y segmentacion de la demanda (K-means).

| Endpoint | Descripcion |
|---|---|
| `POST /predict/no-show` | `{"citas":[{antelacion_dias, dia_semana, edad, beca, sms_recibido, inasistencias_previas, citas_previas, id?}]}` -> probabilidad, riesgo BAJO/MEDIO/ALTO |
| `GET /segments/demanda` | segmentos K-means, `k`, silueta, inercia por k y segmento de cada especialidad |
| `GET /model/info` | version, umbral, metricas e importancias del modelo cargado |
| `GET /health` | estado (sin clave) |

Si `ML_API_KEY` esta definido, todo salvo `/health` exige `X-Api-Key`. Sin modelo entrenado responde **503** con la instruccion para generarlo.

## Modelo de inasistencia (`ml/no-show/train.py`)
- Dataset: Kaggle "Medical Appointment No Shows" (`joniarroba/noshowappointments`); requiere `~/.kaggle/kaggle.json`, si no falla sin inventar datos.
- Solo atributos administrativos (antelacion, dia de la semana, edad, beca, SMS, historial previo). Se excluyen hipertension, diabetes, alcoholismo, discapacidad, genero y barrio.
- El historial previo se calcula con citas de **dias anteriores** (sin fuga de informacion).
- Train/test por fecha (test = ultimo 20 % de dias); umbral elegido por F1 en una ventana de validacion del train; `class_weight="balanced_subsample"`.
- Informe (precision, recall, F1, AUC, matriz de confusion, importancia por permutacion y Gini) en `ml/no-show/reports/`; modelo `.joblib` con su version.

```bash
services/ms7-inteligencia/ml/.venv/bin/python ml/no-show/train.py                            # real (Kaggle)
services/ms7-inteligencia/ml/.venv/bin/python ml/no-show/train.py --sintetico-solo-prueba-de-codigo   # humo; modelo marcado "sintetico"
```

## Segmentacion de la demanda (`ml/demanda/segmentar.py`)
Unidad = especialidad x semana; atributos: citas, antelacion media, % canceladas, % por la manana, % fin de semana, medicos y citas por medico.
**Eleccion de k:** se evalua k = 2..8; se elige el de **silueta maxima** y se guarda tambien la inercia por k (codo) en `evaluacion_k` para contrastarlo.
Los segmentos se ordenan por volumen medio de citas ("Demanda alta/media/baja" si k = 3).

```bash
node scripts/seed/citas-sinteticas.mjs --meses 4          # siembra citas FICTICIAS en MS3 por el gateway (ver cabecera del script)
services/ms7-inteligencia/ml/.venv/bin/python ml/demanda/segmentar.py --fuente ms3
services/ms7-inteligencia/ml/.venv/bin/python ml/demanda/segmentar.py --fuente sintetico   # sin MS3 (datos ficticios)
```

## Ejecutar y probar
```bash
scripts/dev-services.sh start ms7-ml
(cd services/ms7-inteligencia/ml && .venv/bin/python -m pytest -q)
```
