# Informe no-show (rf-noshow-20261102-da892edd-sintetico)

- Datos: `sintetico` (**SINTETICOS: solo prueba de codigo**)
- Train/test por fecha: 9583 / 2417 (corte 2016-05-31)
- Umbral (F1 en validacion): 0.49

## Metricas en test

| Precision | Recall | F1 | AUC |
|---|---|---|---|
| 0.279 | 0.434 | 0.339 | 0.607 |

Matriz de confusion: {'tn': 1443, 'fp': 515, 'fn': 260, 'tp': 199}  (prevalencia de inasistencia: 19.0%)

## Importancia de variables

| Variable | Permutacion (caida de AUC) | Gini |
|---|---|---|
| antelacion_dias | 0.0960 | 0.5196 |
| citas_previas | 0.0024 | 0.0568 |
| tasa_inasistencia_previa | 0.0022 | 0.0199 |
| inasistencias_previas | 0.0001 | 0.0117 |
| beca | -0.0004 | 0.0272 |
| sms_recibido | -0.0021 | 0.0298 |
| dia_semana | -0.0028 | 0.0978 |
| edad | -0.0083 | 0.2372 |
