import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sqflite/sqflite.dart';

import 'api/cliente.dart';
import 'api/errores.dart';
import 'api/formato.dart' show inicioDelDia, sumarDias;
import 'config.dart';
import 'models.dart';
import 'offline/db.dart';
import 'sesion/sesion.dart';

/// Cliente HTTP comun; el token se pide a la sesion en cada peticion.
final apiProvider = Provider<ClienteApi>((ref) => ClienteApi(
      baseUrl: apiUrl,
      token: () => ref.read(sesionProvider.notifier).token(),
    ));

/// Lectura con copia local. `clave` identifica la copia en SQLite (por usuario). `cargar` devuelve JSON (cacheable).
class Peticion<T> {
  Peticion(this.clave, this.cargar, this.convertir);
  final String clave;
  final Future<Object?> Function(ClienteApi) cargar;
  final T Function(Object?) convertir;
  @override
  bool operator ==(Object other) => other is Peticion && other.clave == clave;
  @override
  int get hashCode => clave.hashCode;
}

class Lectura<T> {
  const Lectura({this.datos, this.cargando = true, this.error, this.desactualizado = false, this.guardadoEn});
  final T? datos;
  final bool cargando;
  final ApiError? error;
  /// true si se muestra la copia guardada porque el servidor no respondio.
  final bool desactualizado;
  final int? guardadoEn;
}

final _lecturaProvider = FutureProvider.autoDispose.family<Lectura<Object?>, Peticion<Object?>>((ref, pet) async {
  final api = ref.watch(apiProvider);
  final sub = ref.watch(sesionProvider.select((s) => s.sub));
  final llave = '${sub.isEmpty ? 'anonimo' : sub}:${pet.clave}';
  try {
    final json = await pet.cargar(api);
    final en = DateTime.now().millisecondsSinceEpoch;
    unawaited(abrirDb().then((d) => d.insert('cache', {'clave': llave, 'valor': jsonEncode(json), 'en': en}, conflictAlgorithm: ConflictAlgorithm.replace)).catchError((_) => 0));
    return Lectura(datos: pet.convertir(json), cargando: false, guardadoEn: en);
  } catch (e) {
    final err = e is ApiError ? e : ApiError(0, mensajeAlterno: '$e');
    if (err.estado == 0 || err.estado >= 500) {
      try {
        final filas = await (await abrirDb()).query('cache', where: 'clave = ?', whereArgs: [llave]);
        if (filas.isNotEmpty) {
          return Lectura(datos: pet.convertir(jsonDecode(filas.first['valor'] as String)), cargando: false, desactualizado: true, guardadoEn: filas.first['en'] as int);
        }
      } catch (_) {}
    }
    return Lectura(cargando: false, error: err);
  }
});

extension LecturaRef on WidgetRef {
  /// Observa una lectura. `null` = en espera (clave aun desconocida).
  Lectura<T> leer<T>(Peticion<T>? p) {
    if (p == null) return Lectura<T>(cargando: false);
    final a = watch(_lecturaProvider(p as Peticion<Object?>));
    final v = a.value;
    if (v == null) return const Lectura();
    return Lectura<T>(datos: v.datos as T?, cargando: v.cargando, error: v.error, desactualizado: v.desactualizado, guardadoEn: v.guardadoEn);
  }

  void recargar<T>(Peticion<T> p) => invalidate(_lecturaProvider(p as Peticion<Object?>));
}

List<T> _lista<T>(Object? j, T Function(Map) f) => [for (final e in (j as List)) f(e as Map)];

Peticion<Paciente> pMe() => Peticion('me', (a) => a.get('/api/pacientes/me'), (j) => Paciente.fromJson(j as Map));
Peticion<List<Cita>> pCitas(String pacienteId) => Peticion(
    'citas:$pacienteId', (a) async => (await a.pagina('/api/citas', query: {'pacienteId': pacienteId}, limite: 100)).items, (j) => _lista(j, Cita.fromJson));
Peticion<Cita> pCita(String id) => Peticion('cita:$id', (a) => a.get('/api/citas/$id'), (j) => Cita.fromJson(j as Map));
Peticion<List<Medico>> pMedicos() => Peticion('medicos', (a) => a.todas('/api/medicos'), (j) => _lista(j, Medico.fromJson));
Peticion<List<Especialidad>> pEspecialidades() =>
    Peticion('especialidades', (a) => a.todas('/api/especialidades'), (j) => _lista(j, Especialidad.fromJson).where((e) => e.activa).toList());
Peticion<List<Franja>> pFranjas(String medicoId, String dia) => Peticion(
    'disp:$medicoId:$dia',
    (a) async => (await a.pagina('/api/citas/disponibilidad', query: {'medicoId': medicoId, 'desde': inicioDelDia(dia), 'hasta': inicioDelDia(sumarDias(dia, 1))}, limite: 100)).items,
    (j) => _lista(j, Franja.fromJson));
Peticion<({String monto, String moneda})?> pFactura(String id) => Peticion('factura:$id', (a) async {
      try {
        return await a.get('/api/facturacion/facturas/$id');
      } catch (_) {
        return null;
      }
    }, (j) => j is Map ? (monto: '${j['monto']}', moneda: '${j['moneda']}') : null);
Peticion<List<AvisoN>> pAvisos(String pacienteId) => Peticion(
    'avisos:$pacienteId', (a) async => (await a.pagina('/api/notificaciones', query: {'pacienteId': pacienteId}, limite: 30)).items, (j) => _lista(j, AvisoN.fromJson));
Peticion<Prefs> pPrefs(String pacienteId) => Peticion('prefs:$pacienteId', (a) => a.get('/api/notificaciones/preferencias/$pacienteId'), (j) => Prefs.fromJson(j as Map));
Peticion<List<EstudioN>> pEstudios() =>
    Peticion('estudios', (a) async => (await a.pagina('/api/imagenes', limite: 30)).items, (j) => _lista(j, EstudioN.fromJson));
