/// Formatos de la clinica (port de packages/api-client/src/formato.ts). La Paz es UTC-4 todo el ano.
const _desfase = Duration(hours: 4);
const _simbolo = {'BOB': 'Bs', 'USD': r'US$', 'EUR': '€'};
const _meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const _mesesLargo = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const _dias = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

DateTime? _aFecha(Object? v) {
  if (v == null || v == '') return null;
  if (v is DateTime) return v;
  if (v is int) return DateTime.fromMillisecondsSinceEpoch(v);
  return DateTime.tryParse('$v');
}

/// Reloj de la clinica: los campos UTC del resultado son la hora de La Paz.
DateTime _clinica(DateTime d) => d.toUtc().subtract(_desfase);
String _dos(int n) => n.toString().padLeft(2, '0');

String dinero(Object? valor, [String moneda = 'BOB', bool sinCentavos = false]) {
  if (valor == null || valor == '') return '—';
  final texto = '$valor'.trim();
  final m = RegExp(r'^(-?)(\d+)(?:\.(\d+))?$').firstMatch(texto);
  if (m == null) return texto;
  final signo = m.group(1)!, entero = m.group(2)!, dec = m.group(3) ?? '';
  final miles = entero.replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
  final centavos = ('${dec}00').substring(0, 2);
  final cuerpo = sinCentavos && RegExp(r'^0*$').hasMatch(dec) ? miles : '$miles.$centavos';
  return '$signo${_simbolo[moneda] ?? moneda} $cuerpo';
}

/// «3 nov 2026».
String formatoFecha(Object? v) {
  final d = _aFecha(v);
  if (d == null) return '—';
  final c = _clinica(d);
  return '${c.day} ${_meses[c.month - 1]} ${c.year}';
}

/// «10:30» (24 h).
String formatoHora(Object? v) {
  final d = _aFecha(v);
  if (d == null) return '—';
  final c = _clinica(d);
  return '${_dos(c.hour)}:${_dos(c.minute)}';
}

String formatoFechaHora(Object? v) {
  final d = _aFecha(v);
  return d == null ? '—' : '${formatoFecha(d)}, ${formatoHora(d)}';
}

/// «martes 3 de noviembre».
String formatoDiaLargo(Object? v) {
  final d = _aFecha(v);
  if (d == null) return '—';
  final c = _clinica(d);
  return '${_dias[c.weekday - 1]} ${c.day} de ${_mesesLargo[c.month - 1]}';
}

/// `AAAA-MM-DD` del dia de la clinica en que cae ese instante.
String fechaLocal([Object? v]) {
  final c = _clinica(_aFecha(v) ?? DateTime.now());
  return '${c.year}-${_dos(c.month)}-${_dos(c.day)}';
}

/// Instante ISO UTC de las 00:00 de un dia de la clinica.
String inicioDelDia(String fecha) => DateTime.parse('${fecha}T04:00:00Z').toIso8601String();

/// Suma `dias` a una fecha `AAAA-MM-DD`.
String sumarDias(String fecha, int dias) {
  final d = DateTime.parse('${fecha}T12:00:00Z').add(Duration(days: dias));
  return '${d.year}-${_dos(d.month)}-${_dos(d.day)}';
}

String iniciales(String? nombre) {
  final p = (nombre ?? '').trim().split(RegExp(r'\s+')).where((x) => x.isNotEmpty).toList();
  final s = ((p.isNotEmpty ? p[0][0] : '') + (p.length > 1 ? p[1][0] : '')).toUpperCase();
  return s.isEmpty ? '?' : s;
}
