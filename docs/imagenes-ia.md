# Imagenes e inferencia de radiografias (MS5)

> **Aviso clinico.** El resultado es un **apoyo a la decision clinica, no un diagnostico**. Es un proyecto academico: no usar con pacientes reales.
> La API lo repite en cada respuesta (`aviso`). Sin modelo (y con `ALLOW_STUB=true`) el servicio responde `modelo: "stub-no-clinico"`; con el modelo entrenado responde `mobilenetv2-neumonia`.

## Flujo

```
medico/admin --POST /api/imagenes (multipart, Idempotency-Key)--> gateway --> MS5 API (NestJS, 3005)
  1. valida JWT + rol, tamano maximo (IMAGENES_MAX_BYTES) y la FIRMA real del archivo (JPEG/PNG/DICOM), no la extension
  2. comprueba que el paciente existe (MS2)
  3. sube el archivo a S3 local (SeaweedFS, bucket `radiografias`, clave no adivinable) y guarda metadatos en MongoDB (estado SUBIDA, SHA-256)
  4. publica `imagenes.analisis.solicitar` en RabbitMQ  -> estado ANALIZANDO
MS5 inferencia (FastAPI + aio-pika, 8005)
  5. consume la solicitud, descarga la imagen de S3, ejecuta el modelo
  6. publica `imagenes.analisis.completado` (o `imagenes.analisis.fallido`; reintentos 5 s / 30 s / 2 min y DLQ)
MS5 API
  7. consume el resultado (idempotente por `id` del mensaje) -> ANALIZADA (con resultado) o FALLIDA
```

Consulta: `GET /api/imagenes/{id}`, `GET /api/imagenes?pacienteId=...&limite=..&cursor=..` y una URL prefirmada temporal
(`IMAGENES_URL_SEGUNDOS`) para ver la imagen. El bucket nunca es publico. El rol `paciente` solo ve sus imagenes (ajenas: 403/404).
Contratos: `contracts/events/imagenes.analisis.{solicitar,completado,fallido}.schema.json`.

## Inferencia

`POST /predict` (imagen) devuelve `{probabilidad_neumonia, clase, version_modelo, modelo, grad_cam?}`.

- Modelo real: variable `MODELO_PATH` (archivo `.keras`).
- Sin modelo y con `ALLOW_STUB=true`: modelo ficticio pequeno, `modelo: "stub-no-clinico"` (solo para probar el flujo).
- Contrato del modelo: entrada float32 `(N,224,224,3)` en [0,255] (el reescalado va dentro del modelo), salida = probabilidad de neumonia; capa Grad-CAM `out_relu`.

## Modelo entrenado (2026-11-10, Kaggle GPU)

MobileNetV2 con `ml/pneumonia/train.py` sobre `paultimothymooney/chest-xray-pneumonia` (notebook `ml/colab/entrenar-kaggle.ipynb`). Archivos en `ml/pneumonia/models/`
(`pneumonia.keras`, `pneumonia.tflite`, `pneumonia.json` con umbral y metricas) e informe en `ml/pneumonia/reports/completo/`.

| Conjunto | AUC | Sensibilidad | Especificidad |
|---|---|---|---|
| Validacion (15 % del train) | 0.997 | 99.1 % | 96.0 % |
| **Prueba (624 imagenes)** | **0.973** | **99.5 %** (2 FN) | **52.1 %** (112 FP) |

- Umbral 0.067 (Youden sobre validacion). Casi no se escapan neumonias, pero **mas de la mitad de las radiografias normales se marcan como sospecha**: la validacion
  (separada del train) y la prueba publica tienen distribuciones distintas. Presentarlo siempre como *sospecha que requiere revision*, nunca como diagnostico.
- Cambiar el umbral (`umbral` en `pneumonia.json`) cambia sensibilidad por especificidad; la decision debe ser clinica y no ajustarse sobre el conjunto de prueba.
- Dataset pediatrico de un solo centro; no generaliza a adultos ni a otros equipos. No validado clinicamente.
- Para usarlo: `MODEL_PATH=$PWD/ml/pneumonia/models/pneumonia.keras ALLOW_STUB=false` (verificado: carga y predice). Los contenedores esperan `/models/pneumonia.keras`.

## Entrenar y reemplazar el modelo

Opcion sin credenciales locales: `ml/colab/entrenar-kaggle.ipynb` (notebook de Kaggle con los datasets adjuntos) o `ml/colab/entrenar.ipynb` (Colab).

Requiere credenciales de Kaggle en `~/.kaggle/kaggle.json`; sin ellas `train.py` falla con un mensaje claro y no inventa datos.

```bash
# entrenamiento completo (dataset "Chest X-Ray Images (Pneumonia)"; horas en CPU)
ml/.venv/bin/python ml/pneumonia/train.py
# humo con datos reales y pocas imagenes
ml/.venv/bin/python ml/pneumonia/train.py --subconjunto 200 --epocas 2 --epocas-ajuste 0
# humo sintetico (solo prueba el codigo; NO es un modelo util)
ml/.venv/bin/python ml/pneumonia/train.py --sintetico-solo-prueba-de-codigo
```

Usa MobileNetV2 con pesos de clase, y evalua sensibilidad, especificidad, AUC y matriz de confusion en el conjunto de prueba;
guarda el `.keras` en `ml/pneumonia/models/` y el informe en `ml/pneumonia/reports/`.
Para el validador local de la PWA/movil: `ml/pneumonia/convertir.py` (TFLite y TF.js).

Reemplazar el modelo: copiar el `.keras` y arrancar la inferencia con `MODELO_PATH=<ruta>` (y sin `ALLOW_STUB`). `version_modelo` sale del archivo.
Los archivos `.keras` y `.tflite` estan en `.gitignore`.

## Pruebas

| Que | Comando |
|---|---|
| API (unitarias) | `pnpm --filter ms5-api test` |
| Inferencia | `(cd services/ms5-imagenes/inference && .venv/bin/python -m pytest -q)` |
| Extremo a extremo | `docker compose up -d && make dynamodb-init rabbitmq-declare s3-init && scripts/e2e-imagenes.sh` |

El E2E cubre: 401 sin token, 403 por rol, 400 sin `Idempotency-Key`, 400 firma invalida, tamano maximo, subida -> ANALIZADA con el stub,
replay idempotente, paciente que solo ve lo suyo y URL temporal que caduca.
