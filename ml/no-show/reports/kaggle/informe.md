# Informe no-show (rf-noshow-20261110-596e7b43)

- Datos: `kaggle:joniarroba/noshowappointments`
- Train/test por fecha: 84067 / 26449 (corte 2016-06-01)
- Umbral (F1 en validacion): 0.53

## Metricas en test

| Precision | Recall | F1 | AUC |
|---|---|---|---|
| 0.301 | 0.714 | 0.423 | 0.729 |

Matriz de confusion: {'tn': 13465, 'fp': 8102, 'fn': 1397, 'tp': 3485}  (prevalencia de inasistencia: 18.5%)

## Importancia de variables

| Variable | Permutacion (caida de AUC) | Gini |
|---|---|---|
| antelacion_dias | 0.1778 | 0.6745 |
| edad | 0.0186 | 0.1763 |
| tasa_inasistencia_previa | 0.0093 | 0.0230 |
| inasistencias_previas | 0.0045 | 0.0180 |
| sms_recibido | 0.0035 | 0.0417 |
| beca | 0.0017 | 0.0055 |
| dia_semana | 0.0008 | 0.0330 |
| citas_previas | 0.0007 | 0.0281 |
