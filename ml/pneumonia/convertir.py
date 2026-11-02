#!/usr/bin/env python
"""Convierte el modelo .keras a TFLite (movil) y/o TensorFlow.js (navegador/PWA).

  ml/.venv/bin/python ml/pneumonia/convertir.py --modelo ml/pneumonia/models/pneumonia.keras --tflite --tfjs

TFLite usa el convertidor de TensorFlow (cuantizacion dinamica opcional con --cuantizar).
TF.js usa el paquete `tensorflowjs`, que NO esta en requirements.txt porque arrastra dependencias que chocan con TF/Keras recientes:
instalalo en un venv aparte (python -m venv ml/.venv-tfjs && ml/.venv-tfjs/bin/pip install tensorflowjs) y ejecuta este script con ese interprete.
AVISO: apoyo a la decision, no diagnostico; proyecto academico.
"""
import argparse, os, subprocess, sys
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

def main():
    a = argparse.ArgumentParser()
    a.add_argument("--modelo", type=Path, required=True)
    a.add_argument("--salida", type=Path, default=None, help="por defecto, junto al modelo")
    a.add_argument("--tflite", action="store_true")
    a.add_argument("--tfjs", action="store_true")
    a.add_argument("--cuantizar", action="store_true", help="cuantizacion dinamica de TFLite (modelo ~4x menor, algo menos preciso)")
    args = a.parse_args()
    if not args.modelo.exists():
        sys.exit(f"ERROR: no existe {args.modelo}. Entrena primero (ml/pneumonia/README.md).")
    if not (args.tflite or args.tfjs):
        sys.exit("ERROR: indica --tflite y/o --tfjs")
    salida = args.salida or args.modelo.parent
    salida.mkdir(parents=True, exist_ok=True)
    nombre = args.modelo.stem

    if args.tflite:
        import tensorflow as tf, keras
        modelo = keras.saving.load_model(args.modelo)
        conv = tf.lite.TFLiteConverter.from_keras_model(modelo)
        if args.cuantizar:
            conv.optimizations = [tf.lite.Optimize.DEFAULT]
        destino = salida / f"{nombre}.tflite"
        destino.write_bytes(conv.convert())
        print(f"TFLite: {destino} ({destino.stat().st_size/1e6:.1f} MB)")

    if args.tfjs:
        try:
            import tensorflowjs  # noqa: F401
        except ImportError:
            sys.exit("ERROR: falta `tensorflowjs` en este interprete (ver la cabecera del script: venv aparte).")
        destino = salida / f"{nombre}_tfjs"
        r = subprocess.run([sys.executable, "-m", "tensorflowjs.converters.converter", "--input_format=keras_keras", "--output_format=tfjs_graph_model", str(args.modelo), str(destino)])
        if r.returncode != 0:
            sys.exit("ERROR: la conversion a TF.js fallo (ver salida). Suele ser incompatibilidad de versiones Keras/TF con tensorflowjs.")
        print(f"TF.js: {destino}")

if __name__ == "__main__":
    main()
