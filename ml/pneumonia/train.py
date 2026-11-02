#!/usr/bin/env python
"""Entrenamiento del clasificador de neumonia en radiografias de torax (transfer learning con MobileNetV2).

Dataset: Kaggle "Chest X-Ray Images (Pneumonia)" (paultimothymooney/chest-xray-pneumonia), descargado con la API de Kaggle.
  - Credenciales: ~/.kaggle/kaggle.json (o KAGGLE_USERNAME + KAGGLE_KEY, o KAGGLE_API_TOKEN). Si faltan, el script FALLA con un
    mensaje claro: NO inventa ni sustituye datos.

Ejemplos (desde la raiz del repo, con el venv de ml/):
  ml/.venv/bin/python ml/pneumonia/train.py                        # entrenamiento completo (ver README: horas en CPU)
  ml/.venv/bin/python ml/pneumonia/train.py --subconjunto 200 --epocas 2 --epocas-ajuste 0   # humo con datos reales, pocas imagenes
  ml/.venv/bin/python ml/pneumonia/train.py --sintetico-solo-prueba-de-codigo                # ver "prueba de humo sintetica"

Contrato del modelo (lo usa services/ms5-imagenes/inference): entrada float32 (N,224,224,3) en [0,255] (el reescalado va DENTRO del modelo);
salida: probabilidad de NEUMONIA (sigmoide). Capa para Grad-CAM: "out_relu".

AVISO: proyecto academico. El modelo es apoyo a la decision, NO un diagnostico, y no esta validado clinicamente.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import random
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import numpy as np

RAIZ = Path(__file__).resolve().parent
DATASET_KAGGLE = "paultimothymooney/chest-xray-pneumonia"
CLASES = ["NORMAL", "PNEUMONIA"]  # indice 1 = positivo (neumonia)
TAMANO = (224, 224)
AVISO = "Apoyo a la decision clinica; NO es un diagnostico. Proyecto academico, sin validacion clinica."


def salir(msg: str, codigo: int = 2):
    print(f"\nERROR: {msg}", file=sys.stderr)
    sys.exit(codigo)


# --- datos ----------------------------------------------------------------------------------------------------

def tiene_credenciales_kaggle() -> bool:
    home = Path.home() / ".kaggle"
    return (home / "kaggle.json").exists() or (home / "access_token").exists() or bool(os.environ.get("KAGGLE_API_TOKEN")) or bool(os.environ.get("KAGGLE_USERNAME") and os.environ.get("KAGGLE_KEY"))


def localizar_raiz(base: Path) -> Path | None:
    """La estructura publica tiene chest_xray/{train,val,test}/{NORMAL,PNEUMONIA} (a veces anidada dos veces)."""
    for p in [base, *base.rglob("chest_xray")]:
        if (p / "train" / "NORMAL").is_dir() and (p / "test" / "PNEUMONIA").is_dir():
            return p
    return None


def preparar_datos(destino: Path) -> Path:
    existente = localizar_raiz(destino) if destino.exists() else None
    if existente:
        print(f"Dataset ya descargado en {existente}")
        return existente
    if not tiene_credenciales_kaggle():
        salir(
            "no hay credenciales de Kaggle y el dataset no esta descargado.\n"
            "  1) En https://www.kaggle.com -> Settings -> API -> 'Create New Token' (descarga kaggle.json).\n"
            "  2) Guardalo en ~/.kaggle/kaggle.json (chmod 600), o exporta KAGGLE_USERNAME y KAGGLE_KEY.\n"
            "  3) Vuelve a ejecutar este script.\n"
            "No se generan ni se sustituyen datos. (Solo para probar que el codigo corre: --sintetico-solo-prueba-de-codigo)"
        )
    destino.mkdir(parents=True, exist_ok=True)
    kaggle = shutil.which("kaggle") or str(Path(sys.executable).parent / "kaggle")
    print(f"Descargando {DATASET_KAGGLE} con la API de Kaggle (~1.2 GB)...")
    r = subprocess.run([kaggle, "datasets", "download", "-d", DATASET_KAGGLE, "-p", str(destino), "--unzip"], text=True)
    if r.returncode != 0:
        salir("la descarga de Kaggle fallo (credenciales invalidas, sin acceso al dataset o sin conexion). Revisa la salida anterior.")
    raiz = localizar_raiz(destino)
    if not raiz:
        salir(f"se descargo el dataset pero no tiene la estructura esperada chest_xray/train|test/NORMAL|PNEUMONIA en {destino}")
    return raiz


def generar_sintetico(destino: Path, por_clase: int, semilla: int) -> Path:
    """SOLO PARA PROBAR EL CODIGO: imagenes aleatorias (ruido; la clase 'PNEUMONIA' tiene una mancha brillante). No son radiografias."""
    from PIL import Image

    rng = np.random.default_rng(semilla)
    for split, n in (("train", por_clase), ("test", max(8, por_clase // 4))):
        for clase in CLASES:
            carpeta = destino / split / clase
            carpeta.mkdir(parents=True, exist_ok=True)
            for i in range(n):
                px = rng.normal(90, 30, (TAMANO[0], TAMANO[1])).clip(0, 255)
                if clase == "PNEUMONIA":
                    y, x = rng.integers(40, 180, 2)
                    px[max(0, y - 30) : y + 30, max(0, x - 30) : x + 30] += 70
                Image.fromarray(px.clip(0, 255).astype(np.uint8)).convert("RGB").save(carpeta / f"{clase}_{i}.png")
    return destino


def limitar(origen: Path, destino: Path, por_clase: int, semilla: int) -> Path:
    """Copia (enlaza) como mucho `por_clase` imagenes por clase y particion, para ejecuciones de humo."""
    rng = random.Random(semilla)
    for split in ("train", "test"):
        for clase in CLASES:
            archivos = sorted((origen / split / clase).glob("*"))
            rng.shuffle(archivos)
            (destino / split / clase).mkdir(parents=True, exist_ok=True)
            tope = por_clase if split == "train" else max(8, por_clase // 4)
            for a in archivos[:tope]:
                dst = destino / split / clase / a.name
                dst.symlink_to(a.resolve())
    return destino


# --- modelo ---------------------------------------------------------------------------------------------------

def construir_modelo(keras, pesos: str | None, lr: float):
    entrada = keras.Input((*TAMANO, 3), name="radiografia")
    # El reescalado a [-1, 1] (lo que espera MobileNetV2) va DENTRO del modelo: el servicio de inferencia envia pixeles en [0,255].
    x = keras.layers.Rescaling(1.0 / 127.5, offset=-1.0, name="reescalado")(entrada)
    base = keras.applications.MobileNetV2(input_tensor=x, include_top=False, weights=pesos)  # capas aplanadas en el mismo grafo (Grad-CAM: "out_relu")
    base.trainable = False
    x = keras.layers.GlobalAveragePooling2D()(base.output)
    x = keras.layers.Dropout(0.3)(x)
    salida = keras.layers.Dense(1, activation="sigmoid", name="p_neumonia")(x)
    modelo = keras.Model(entrada, salida, name="neumonia_mobilenetv2")
    compilar(keras, modelo, lr)
    return modelo, base


def compilar(keras, modelo, lr: float):
    modelo.compile(
        optimizer=keras.optimizers.Adam(lr),
        loss="binary_crossentropy",
        metrics=[keras.metrics.AUC(name="auc"), keras.metrics.BinaryAccuracy(name="exactitud")],
    )


def aumento(keras):
    """Aumento suave. SIN volteo horizontal: invertiria la lateralidad (corazon, camara gastrica) y cambia la semantica clinica."""
    return keras.Sequential(
        [keras.layers.RandomRotation(0.04), keras.layers.RandomZoom(0.08), keras.layers.RandomTranslation(0.05, 0.05), keras.layers.RandomContrast(0.15)],
        name="aumento",
    )


def pesos_de_clase(y: np.ndarray) -> dict[int, float]:
    """Pesos 'balanced': n / (clases * n_clase). El dataset publico tiene ~3x mas neumonias que normales."""
    n = len(y)
    return {c: float(n / (len(CLASES) * max(1, int((y == c).sum())))) for c in range(len(CLASES))}


# --- evaluacion -----------------------------------------------------------------------------------------------

def metricas(y: np.ndarray, p: np.ndarray, umbral: float) -> dict:
    from sklearn.metrics import confusion_matrix, roc_auc_score

    pred = (p >= umbral).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    return {
        "umbral": float(umbral),
        "auc": float(roc_auc_score(y, p)) if len(set(y.tolist())) == 2 else None,
        "sensibilidad": float(tp / (tp + fn)) if (tp + fn) else None,  # recall de neumonia
        "especificidad": float(tn / (tn + fp)) if (tn + fp) else None,
        "exactitud": float((tp + tn) / len(y)),
        "matriz_confusion": {"VN": int(tn), "FP": int(fp), "FN": int(fn), "VP": int(tp)},
        "n": int(len(y)),
    }


def umbral_youden(y: np.ndarray, p: np.ndarray) -> float:
    from sklearn.metrics import roc_curve

    fpr, tpr, thr = roc_curve(y, p)
    u = float(thr[int(np.argmax(tpr - fpr))])
    return u if np.isfinite(u) else 0.5  # roc_curve usa inf como primer umbral si el modelo no discrimina


def graficos(y, p, m, carpeta: Path):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from sklearn.metrics import roc_curve

    cm = m["matriz_confusion"]
    fig, ax = plt.subplots(figsize=(4, 3.4))
    ax.imshow([[cm["VN"], cm["FP"]], [cm["FN"], cm["VP"]]], cmap="Blues")
    for (i, j), v in {(0, 0): cm["VN"], (0, 1): cm["FP"], (1, 0): cm["FN"], (1, 1): cm["VP"]}.items():
        ax.text(j, i, v, ha="center", va="center", fontsize=14)
    ax.set_xticks([0, 1], ["NORMAL", "NEUMONIA"]); ax.set_yticks([0, 1], ["NORMAL", "NEUMONIA"])
    ax.set_xlabel("Prediccion"); ax.set_ylabel("Real"); ax.set_title(f"Matriz de confusion (umbral {m['umbral']:.2f})")
    fig.tight_layout(); fig.savefig(carpeta / "matriz_confusion.png", dpi=130); plt.close(fig)
    if m["auc"] is not None:
        fpr, tpr, _ = roc_curve(y, p)
        fig, ax = plt.subplots(figsize=(4, 3.4))
        ax.plot(fpr, tpr, label=f"AUC = {m['auc']:.3f}"); ax.plot([0, 1], [0, 1], "--", color="gray")
        ax.set_xlabel("1 - especificidad"); ax.set_ylabel("Sensibilidad"); ax.legend(); ax.set_title("Curva ROC")
        fig.tight_layout(); fig.savefig(carpeta / "curva_roc.png", dpi=130); plt.close(fig)


def informe(carpeta: Path, ctx: dict, m_val: dict, m_test: dict, sintetico: bool):
    def fila(m): return f"| {m['umbral']:.3f} | {m['auc'] if m['auc'] is None else round(m['auc'], 4)} | {m['sensibilidad']} | {m['especificidad']} | {m['exactitud']:.4f} | {m['n']} |"
    cm = m_test["matriz_confusion"]
    texto = f"""# Informe de entrenamiento - clasificador de neumonia

{'> **PRUEBA DE HUMO SINTETICA.** Se entreno con imagenes aleatorias generadas SOLO para comprobar que el codigo funciona. No son radiografias y las metricas no significan nada.' + chr(10) if sintetico else ''}
> {AVISO}

- Fecha: {ctx['fecha']}
- Dataset: {ctx['dataset']}
- Imagenes: entrenamiento {ctx['n_train']} / validacion {ctx['n_val']} / prueba {ctx['n_test']}
- Distribucion de clases (entrenamiento): {ctx['distribucion']}  ->  pesos de clase {ctx['pesos']}
- Arquitectura: MobileNetV2 (transfer learning, pesos: {ctx['pesos_base']}), cabeza GAP + Dropout 0.3 + Dense sigmoide
- Entrenamiento: {ctx['epocas']} epocas con la base congelada (lr {ctx['lr']}) + {ctx['epocas_ajuste']} de ajuste fino de las ultimas {ctx['capas_ajuste']} capas (lr {ctx['lr_ajuste']}); lote {ctx['lote']}; semilla {ctx['semilla']}
- Aumento de datos: rotacion 4 %, zoom 8 %, traslacion 5 %, contraste 15 % (sin volteo horizontal)
- Entorno: Python {platform.python_version()}, TensorFlow {ctx['tf']}, {ctx['hardware']}

## Resultados

El umbral se elige con el indice de Youden sobre VALIDACION (no sobre prueba) y se aplica sin tocarlo al conjunto de PRUEBA.

| Conjunto | Umbral | AUC | Sensibilidad | Especificidad | Exactitud | n |
|---|---|---|---|---|---|---|
| Validacion | {fila(m_val)[2:]}
| **Prueba** | {fila(m_test)[2:]}

Matriz de confusion (prueba): VN={cm['VN']} FP={cm['FP']} FN={cm['FN']} VP={cm['VP']}

![matriz](matriz_confusion.png) ![roc](curva_roc.png)

## Limitaciones (leer antes de usar)

- Dataset pediatrico de un solo centro (Guangzhou); no generaliza a otras poblaciones, equipos ni adultos.
- El conjunto de prueba publico (624 imagenes) es pequeno; los intervalos de confianza son amplios.
- La validacion publica de Kaggle tiene solo 16 imagenes, por eso aqui la validacion se separa del entrenamiento (15 % estratificado).
- Un falso negativo (neumonia no detectada) es el error mas grave: la sensibilidad debe pesar mas que la exactitud.
- Es apoyo a la decision. Nunca sustituye la lectura del radiologo ni el criterio clinico.
"""
    (carpeta / "informe.md").write_text(texto, encoding="utf-8")


# --- principal ------------------------------------------------------------------------------------------------

def main():
    a = argparse.ArgumentParser(description="Entrena el clasificador de neumonia (MobileNetV2).")
    a.add_argument("--datos", type=Path, default=RAIZ.parent / "data" / "chest_xray", help="carpeta del dataset (ml/data esta fuera de Git)")
    a.add_argument("--salida", type=Path, default=RAIZ / "models")
    a.add_argument("--informes", type=Path, default=RAIZ / "reports")
    a.add_argument("--epocas", type=int, default=8, help="epocas con la base congelada")
    a.add_argument("--epocas-ajuste", type=int, default=6, help="epocas de ajuste fino (0 = sin ajuste fino)")
    a.add_argument("--capas-ajuste", type=int, default=30)
    a.add_argument("--lote", type=int, default=32)
    a.add_argument("--lr", type=float, default=1e-3)
    a.add_argument("--lr-ajuste", type=float, default=1e-5)
    a.add_argument("--semilla", type=int, default=42)
    a.add_argument("--subconjunto", type=int, default=0, help="usar como mucho N imagenes por clase (humo); 0 = todas")
    a.add_argument("--pesos", choices=["imagenet", "none"], default="imagenet", help="pesos de la base; 'none' evita descargar ImageNet (solo humo)")
    a.add_argument("--sintetico-solo-prueba-de-codigo", action="store_true", help="datos aleatorios para comprobar que el codigo corre; NO produce un modelo utilizable")
    args = a.parse_args()

    sintetico = args.sintetico_solo_prueba_de_codigo
    if sintetico and args.pesos == "imagenet":
        print("(sintetico: se usan pesos aleatorios para no depender de la descarga de ImageNet)")
        args.pesos = "none"

    temporal = Path(tempfile.mkdtemp(prefix="sigec-neumonia-"))
    try:
        if sintetico:
            raiz = generar_sintetico(temporal / "sintetico", args.subconjunto or 24, args.semilla)
            fuente = "SINTETICO (ruido aleatorio, no son radiografias)"
        else:
            raiz = preparar_datos(args.datos)
            fuente = f"Kaggle {DATASET_KAGGLE}"
            if args.subconjunto:
                raiz = limitar(raiz, temporal / "subconjunto", args.subconjunto, args.semilla)
                fuente += f" (SUBCONJUNTO de {args.subconjunto} por clase: ejecucion de humo)"

        import keras
        import tensorflow as tf
        from sklearn.model_selection import train_test_split

        keras.utils.set_random_seed(args.semilla)
        carga = dict(label_mode="binary", class_names=CLASES, image_size=TAMANO, batch_size=args.lote, color_mode="rgb")
        # Validacion: 15 % estratificado del entrenamiento (la de Kaggle tiene solo 16 imagenes).
        rutas, etiquetas = [], []
        for i, c in enumerate(CLASES):
            for f in sorted((raiz / "train" / c).glob("*")):
                rutas.append(str(f)); etiquetas.append(i)
        etiquetas = np.array(etiquetas)
        if len(rutas) < 20:
            salir(f"muy pocas imagenes de entrenamiento ({len(rutas)})")
        r_tr, r_va, y_tr, y_va = train_test_split(rutas, etiquetas, test_size=0.15, stratify=etiquetas, random_state=args.semilla)

        def dataset(rs, ys, train):
            def cargar(ruta, y):
                img = tf.io.decode_image(tf.io.read_file(ruta), channels=3, expand_animations=False)
                img = tf.image.resize(img, TAMANO)
                return tf.cast(img, tf.float32), tf.cast(y, tf.float32)
            ds = tf.data.Dataset.from_tensor_slices((rs, ys.astype("float32")))
            if train: ds = ds.shuffle(len(rs), seed=args.semilla)
            return ds.map(cargar, num_parallel_calls=tf.data.AUTOTUNE).batch(args.lote).prefetch(tf.data.AUTOTUNE)

        ds_tr, ds_va = dataset(r_tr, y_tr, True), dataset(r_va, y_va, False)
        t_rutas, t_y = [], []
        for i, c in enumerate(CLASES):
            for f in sorted((raiz / "test" / c).glob("*")):
                t_rutas.append(str(f)); t_y.append(i)
        ds_te = dataset(t_rutas, np.array(t_y), False)
        y_te = np.array(t_y)

        pesos = pesos_de_clase(y_tr)
        print(f"Entrenamiento {len(r_tr)} / validacion {len(r_va)} / prueba {len(t_rutas)} | pesos de clase {pesos}")

        modelo, base = construir_modelo(keras, None if args.pesos == "none" else "imagenet", args.lr)
        aug = aumento(keras)
        ds_tr_aug = ds_tr.map(lambda x, y: (aug(x, training=True), y), num_parallel_calls=tf.data.AUTOTUNE)
        cb = [keras.callbacks.EarlyStopping(monitor="val_auc", mode="max", patience=3, restore_best_weights=True)]
        modelo.fit(ds_tr_aug, validation_data=ds_va, epochs=args.epocas, class_weight=pesos, callbacks=cb, verbose=2)
        if args.epocas_ajuste > 0:
            base.trainable = True
            for capa in base.layers[: -args.capas_ajuste]:
                capa.trainable = False
            for capa in base.layers:  # BatchNorm en modo inferencia durante el ajuste fino
                if isinstance(capa, keras.layers.BatchNormalization): capa.trainable = False
            compilar(keras, modelo, args.lr_ajuste)
            modelo.fit(ds_tr_aug, validation_data=ds_va, epochs=args.epocas_ajuste, class_weight=pesos, callbacks=cb, verbose=2)

        p_va = modelo.predict(ds_va, verbose=0).reshape(-1)
        p_te = modelo.predict(ds_te, verbose=0).reshape(-1)
        umbral = umbral_youden(y_va, p_va) if len(set(y_va.tolist())) == 2 else 0.5
        m_va, m_te = metricas(y_va, p_va, umbral), metricas(y_te, p_te, umbral)

        etiqueta = "smoke-sintetico" if sintetico else ("smoke-real" if args.subconjunto else "")
        nombre = "mobilenetv2-neumonia" if not etiqueta else f"{etiqueta}-NO-USAR"
        args.salida.mkdir(parents=True, exist_ok=True)
        ruta_modelo = args.salida / (f"{etiqueta}.keras" if etiqueta else "pneumonia.keras")
        modelo.save(ruta_modelo)
        version = datetime.now(timezone.utc).strftime("%Y.%m.%d.%H%M")
        ruta_modelo.with_suffix(".json").write_text(json.dumps({
            "nombre": nombre, "version": version, "umbral": umbral, "capa_grad_cam": "out_relu", "dataset": fuente,
            "metricas_prueba": m_te, "aviso": AVISO, "clinico": False if etiqueta else None,
        }, indent=2, ensure_ascii=False), encoding="utf-8")

        carpeta = args.informes / (etiqueta or "completo")
        carpeta.mkdir(parents=True, exist_ok=True)
        graficos(y_te, p_te, m_te, carpeta)
        (carpeta / "metricas.json").write_text(json.dumps({"validacion": m_va, "prueba": m_te}, indent=2), encoding="utf-8")
        informe(carpeta, {
            "fecha": datetime.now(timezone.utc).isoformat(timespec="seconds"), "dataset": fuente, "n_train": len(r_tr), "n_val": len(r_va), "n_test": len(t_rutas),
            "distribucion": {CLASES[c]: int((y_tr == c).sum()) for c in range(2)}, "pesos": {CLASES[c]: round(v, 3) for c, v in pesos.items()},
            "pesos_base": args.pesos, "epocas": args.epocas, "epocas_ajuste": args.epocas_ajuste, "capas_ajuste": args.capas_ajuste, "lr": args.lr,
            "lr_ajuste": args.lr_ajuste, "lote": args.lote, "semilla": args.semilla, "tf": tf.__version__,
            "hardware": "GPU" if tf.config.list_physical_devices("GPU") else "CPU",
        }, m_va, m_te, sintetico)
        print(f"\nModelo: {ruta_modelo}\nInforme: {carpeta / 'informe.md'}")
        print(f"Prueba: AUC={m_te['auc']} sensibilidad={m_te['sensibilidad']} especificidad={m_te['especificidad']} umbral={umbral:.3f}")
        if etiqueta:
            print(f"\nATENCION: {nombre} NO es un modelo utilizable (ejecucion de humo); no se guardo como pneumonia.keras.")
    finally:
        shutil.rmtree(temporal, ignore_errors=True)


if __name__ == "__main__":
    main()
