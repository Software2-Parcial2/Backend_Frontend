import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sqflite/sqflite.dart';

import '../api/cliente.dart';
import '../api/errores.dart';
import '../providers.dart';
import 'db.dart';

/// Cola de solicitudes de cita (SQLite). Misma logica que la PWA: cada solicitud nace con su Idempotency-Key y la conserva en cada
/// reintento, de modo que un envio cortado a medias nunca crea una reserva duplicada. Las claves valen 24 horas.
enum EstadoSolicitud { pendiente, enviando, confirmando, confirmada, conflicto, caducada }

const vigenciaClave = Duration(hours: 24);

class Solicitud {
  Solicitud({
    required this.id, required this.clave, required this.creada, required this.estado, required this.cuerpo,
    required this.especialidad, required this.medico, this.intentos = 0, this.citaId, this.error,
  });
  final String id;
  String clave;
  int creada, intentos;
  EstadoSolicitud estado;
  String? citaId, error;
  final Map<String, dynamic> cuerpo; // pacienteId, medicoId, especialidad, fechaHora
  final String especialidad, medico; // resumen para mostrar

  String get fechaHora => cuerpo['fechaHora'] as String;
  String get espCodigo => cuerpo['especialidad'] as String;

  Map<String, dynamic> toJson() => {
        'id': id, 'clave': clave, 'creada': creada, 'intentos': intentos, 'estado': estado.name, 'citaId': citaId, 'error': error,
        'cuerpo': cuerpo, 'resumen': {'especialidad': especialidad, 'medico': medico},
      };

  factory Solicitud.fromJson(Map<String, dynamic> j) => Solicitud(
        id: j['id'] as String, clave: j['clave'] as String, creada: j['creada'] as int, intentos: (j['intentos'] as int?) ?? 0,
        estado: EstadoSolicitud.values.byName(j['estado'] as String), citaId: j['citaId'] as String?, error: j['error'] as String?,
        cuerpo: (j['cuerpo'] as Map).cast<String, dynamic>(),
        especialidad: (j['resumen'] as Map)['especialidad'] as String, medico: (j['resumen'] as Map)['medico'] as String,
      );
}

/// Almacen de la cola (SQLite en la app, en memoria en las pruebas).
abstract class AlmacenCola {
  Future<List<Solicitud>> todas();
  Future<void> guardar(Solicitud s);
  Future<void> borrar(String id);
}

class AlmacenColaSqlite implements AlmacenCola {
  @override
  Future<List<Solicitud>> todas() async {
    final filas = await (await abrirDb()).query('cola', orderBy: 'creada');
    return [for (final f in filas) Solicitud.fromJson(jsonDecode(f['datos'] as String) as Map<String, dynamic>)];
  }

  @override
  Future<void> guardar(Solicitud s) async => (await abrirDb()).insert(
        'cola', {'id': s.id, 'clave': s.clave, 'datos': jsonEncode(s.toJson()), 'creada': s.creada},
        conflictAlgorithm: ConflictAlgorithm.replace);

  @override
  Future<void> borrar(String id) async => (await abrirDb()).delete('cola', where: 'id = ?', whereArgs: [id]);
}

class AlmacenColaMemoria implements AlmacenCola {
  final _m = <String, Solicitud>{};
  @override
  Future<List<Solicitud>> todas() async => (_m.values.toList()..sort((a, b) => a.creada.compareTo(b.creada)));
  @override
  Future<void> guardar(Solicitud s) async => _m[s.id] = Solicitud.fromJson(s.toJson());
  @override
  Future<void> borrar(String id) async => _m.remove(id);
}

/// Logica de la cola, independiente de Riverpod para poder probarla.
class ColaServicio {
  ColaServicio(this.almacen, {DateTime Function()? ahora, this.esperaCita}) : _ahora = ahora ?? DateTime.now;
  final AlmacenCola almacen;
  final DateTime Function() _ahora;
  final Future<Json> Function(ClienteApi, String)? esperaCita;
  bool _enCurso = false;
  List<Solicitud> instantanea = [];

  Future<List<Solicitud>> refrescar() async => instantanea = await almacen.todas();

  Future<Solicitud> agregar(Map<String, dynamic> cuerpo, {required String especialidad, required String medico}) async {
    final s = Solicitud(
      id: nuevoUuid(), clave: nuevoUuid(), creada: _ahora().millisecondsSinceEpoch, estado: EstadoSolicitud.pendiente,
      cuerpo: cuerpo, especialidad: especialidad, medico: medico);
    await almacen.guardar(s);
    await refrescar();
    return s;
  }

  Future<void> descartar(String id) async {
    await almacen.borrar(id);
    await refrescar();
  }

  /// Otra intencion del usuario: clave nueva.
  Future<void> reintentar(String id) async {
    final s = instantanea.where((x) => x.id == id).firstOrNull;
    if (s == null) return;
    s..estado = EstadoSolicitud.pendiente..error = null..clave = nuevoUuid()..creada = _ahora().millisecondsSinceEpoch..citaId = null;
    await almacen.guardar(s);
    await refrescar();
  }

  Future<void> _act(Solicitud s, void Function(Solicitud) c) async {
    c(s);
    await almacen.guardar(s);
    await refrescar();
  }

  /// Envia las pendientes. Corta el ciclo ante falta de red (0) o sesion vencida (401).
  Future<void> procesar(ClienteApi api) async {
    if (_enCurso) return;
    _enCurso = true;
    try {
      await refrescar();
      for (final s in [...instantanea]) {
        if (const [EstadoSolicitud.confirmada, EstadoSolicitud.conflicto, EstadoSolicitud.caducada].contains(s.estado)) continue;
        if (s.estado == EstadoSolicitud.pendiente && _ahora().millisecondsSinceEpoch - s.creada > vigenciaClave.inMilliseconds) {
          await _act(s, (x) => x..estado = EstadoSolicitud.caducada..error = 'Pasaron más de 24 horas: vuelva a solicitar la cita.');
          continue;
        }
        try {
          if (s.citaId == null) {
            await _act(s, (x) => x..estado = EstadoSolicitud.enviando..intentos += 1..error = null);
            final r = await api.post('/api/citas', s.cuerpo, s.clave) as Map;
            await _act(s, (x) => x..estado = EstadoSolicitud.confirmando..citaId = '${r['citaId']}');
          }
          final c = await (esperaCita ?? ((a, id) => esperarCita(a, id, max: const Duration(seconds: 30))))(api, s.citaId!);
          if (c['estado'] == 'CANCELADA' || c['estado'] == 'CANCELADA_USUARIO') {
            await _act(s, (x) => x..estado = EstadoSolicitud.conflicto..error = (c['motivoFallo'] as String?) ?? 'La cita no pudo confirmarse.');
          } else {
            await _act(s, (x) => x.estado = EstadoSolicitud.confirmada);
          }
        } catch (e) {
          if (e is ApiError && e.code == 'TIEMPO_AGOTADO') {
            await _act(s, (x) => x..estado = EstadoSolicitud.confirmando..error = 'El servidor sigue procesando la cita.');
          } else if (e is ApiError && (e.estado == 409 || e.estado == 422 || e.estado == 400)) {
            await _act(s, (x) => x..estado = EstadoSolicitud.conflicto..error = e.estado == 409 ? 'Ese horario ya no está disponible. Elija otro turno.' : e.message);
          } else {
            await _act(s, (x) => x
              ..estado = x.citaId != null ? EstadoSolicitud.confirmando : EstadoSolicitud.pendiente
              ..error = e is ApiError && e.estado == 0 ? 'Sin conexión: se enviará al volver.' : (e is ApiError ? e.message : 'Error al enviar'));
          }
          if (e is ApiError && (e.estado == 0 || e.estado == 401)) break;
        }
      }
    } finally {
      _enCurso = false;
    }
  }
}

final colaServicioProvider = Provider<ColaServicio>((ref) => ColaServicio(AlmacenColaSqlite()));

/// Solicitudes de la cola; reintenta al abrir la app y cada 20 s (no hay evento «online»).
class ColaNotifier extends Notifier<List<Solicitud>> {
  ColaServicio get _s => ref.read(colaServicioProvider);

  @override
  List<Solicitud> build() {
    final t = Timer.periodic(const Duration(seconds: 20), (_) => procesar());
    ref.onDispose(t.cancel);
    Future.microtask(procesar);
    return const [];
  }

  Future<void> procesar() async {
    await _s.procesar(ref.read(apiProvider));
    state = List.of(_s.instantanea);
  }

  Future<void> agregar(Map<String, dynamic> cuerpo, {required String especialidad, required String medico}) async {
    await _s.agregar(cuerpo, especialidad: especialidad, medico: medico);
    state = List.of(_s.instantanea);
  }

  Future<void> descartar(String id) async {
    await _s.descartar(id);
    state = List.of(_s.instantanea);
  }

  Future<void> reintentar(String id) async {
    await _s.refrescar();
    await _s.reintentar(id);
    state = List.of(_s.instantanea);
    unawaited(procesar());
  }
}

final colaProvider = NotifierProvider<ColaNotifier, List<Solicitud>>(ColaNotifier.new);
