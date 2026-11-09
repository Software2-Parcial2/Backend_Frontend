import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_flutter/api/formato.dart';

void main() {
  test('dinero agrupa miles sin coma flotante', () {
    expect(dinero('180.00'), 'Bs 180.00');
    expect(dinero('1250.5'), 'Bs 1,250.50');
    expect(dinero('180.00', 'BOB', true), 'Bs 180');
    expect(dinero(null), '—');
  });
  test('fechas en hora de La Paz (UTC-4)', () {
    const iso = '2026-11-03T14:30:00Z';
    expect(formatoHora(iso), '10:30');
    expect(formatoFecha(iso), '3 nov 2026');
    expect(formatoFechaHora(iso), '3 nov 2026, 10:30');
    expect(formatoDiaLargo(iso), 'martes 3 de noviembre');
    expect(formatoHora('2026-11-03T02:00:00Z'), '22:00');
    expect(fechaLocal('2026-11-03T02:00:00Z'), '2026-11-02');
  });
  test('inicioDelDia y sumarDias', () {
    expect(inicioDelDia('2026-11-03'), '2026-11-03T04:00:00.000Z');
    expect(sumarDias('2026-11-30', 1), '2026-12-01');
    expect(iniciales('Carla Rojas Vaca'), 'CR');
  });
}
