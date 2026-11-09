import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

/// SQLite local: `cache` (ultima lectura por usuario) y `cola` (solicitudes de cita pendientes, con su Idempotency-Key).
Future<Database>? _abierta;
Future<Database> abrirDb() => _abierta ??= () async {
      final ruta = p.join(await getDatabasesPath(), 'sigec.db');
      return openDatabase(ruta, version: 1, onCreate: (d, _) async {
        await d.execute('CREATE TABLE IF NOT EXISTS cache (clave TEXT PRIMARY KEY NOT NULL, valor TEXT NOT NULL, en INTEGER NOT NULL)');
        await d.execute('CREATE TABLE IF NOT EXISTS cola (id TEXT PRIMARY KEY NOT NULL, clave TEXT NOT NULL, datos TEXT NOT NULL, creada INTEGER NOT NULL)');
      });
    }();
