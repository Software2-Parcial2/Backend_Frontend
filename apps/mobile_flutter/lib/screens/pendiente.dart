import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/formato.dart';
import '../offline/cola.dart';
import '../theme.dart';
import '../widgets/ui.dart';

(String, Tono) _chip(EstadoSolicitud e) => switch (e) {
      EstadoSolicitud.pendiente => ('Pendiente', Tono.warn),
      EstadoSolicitud.enviando => ('Enviando', Tono.info),
      EstadoSolicitud.confirmando => ('Confirmando', Tono.info),
      EstadoSolicitud.confirmada => ('Confirmada', Tono.ok),
      EstadoSolicitud.conflicto => ('Conflicto', Tono.err),
      EstadoSolicitud.caducada => ('Caducada', Tono.err),
    };

class PendienteScreen extends ConsumerWidget {
  const PendienteScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lista = ref.watch(colaProvider).reversed.toList();
    final cola = ref.read(colaProvider.notifier);
    return Column(children: [
      const Barra('Solicitudes guardadas'),
      Cuerpo(children: [
        if (lista.isEmpty) const CardSigec(children: [Text('No hay solicitudes guardadas.', style: Txt.suave)]),
        for (final s in lista)
          CardSigec(children: [
            Chip2(_chip(s.estado).$1, tono: _chip(s.estado).$2),
            Text('${formatoDiaLargo(s.fechaHora)} · ${formatoHora(s.fechaHora)}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: Col.ink)),
            Text('${nombreEsp(s.espCodigo)} · ${s.medico}', style: const TextStyle(color: Col.ink2, fontSize: 15)),
            Text('Guardada ${formatoFechaHora(s.creada)} · clave ${s.clave.substring(0, 8)}…${s.clave.substring(s.clave.length - 4)}', style: Txt.suave),
            if (s.error != null) Text(s.error!, style: const TextStyle(color: Col.ink2, fontSize: 14)),
            if (s.estado == EstadoSolicitud.confirmada && s.citaId != null) Boton('Ver cita', onTap: () => context.push('/confirmada/${s.citaId}')),
            if (s.estado == EstadoSolicitud.pendiente) Boton('Enviar ahora', onTap: () => cola.reintentar(s.id)),
            if (s.estado == EstadoSolicitud.conflicto || s.estado == EstadoSolicitud.caducada)
              Boton('Elegir otro horario', tipo: TipoBoton.pri, onTap: () { cola.descartar(s.id); context.push('/solicitar'); }),
            if (const [EstadoSolicitud.confirmada, EstadoSolicitud.conflicto, EstadoSolicitud.caducada].contains(s.estado)) Boton('Quitar', onTap: () => cola.descartar(s.id)),
          ]),
        const Aviso('Aún no es una cita confirmada',
            texto: 'Cada solicitud se reenvía con su misma clave, así un reintento nunca crea una reserva duplicada. Las claves caducan a las 24 horas.'),
        Boton('Ver mis citas', tipo: TipoBoton.pri, onTap: () => context.go('/')),
      ]),
    ]);
  }
}
