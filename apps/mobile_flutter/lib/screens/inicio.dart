import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/formato.dart';
import '../models.dart';
import '../offline/cola.dart';
import '../providers.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class InicioScreen extends ConsumerWidget {
  const InicioScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cola = ref.watch(colaProvider);
    final me = ref.leer(pMe());
    final citas = ref.leer(me.datos == null ? null : pCitas(me.datos!.id));
    final medicos = ref.leer(pMedicos());
    Medico? medico(String id) => medicos.datos?.where((m) => m.id == id).firstOrNull;
    final todas = [...(citas.datos ?? <Cita>[])]..sort((a, b) => a.fechaHora.compareTo(b.fechaHora));
    final ahora = DateTime.now();
    final proximas = todas.where((c) => (DateTime.tryParse(c.fechaHora)?.isAfter(ahora) ?? false) && const ['CONFIRMADA', 'EN_SALA'].contains(c.estado)).toList();
    final anteriores = todas.where((c) => !proximas.contains(c)).toList().reversed.take(8).toList();
    final enCola = cola.where((s) => s.estado != EstadoSolicitud.confirmada).toList();
    final err = me.error ?? citas.error;
    return Column(children: [
      Barra('Mis citas', derecha: citas.desactualizado ? const Chip2('Sin conexión', tono: Tono.warn) : const Chip2('Sincronizado', tono: Tono.ok)),
      Cuerpo(children: [
        if (citas.desactualizado) SinConexion(en: citas.guardadoEn),
        if (err != null) ErrorApiW(err),
        if (citas.datos == null && err == null) const Cargando(texto: 'Cargando sus citas…'),
        if (citas.datos != null && proximas.isEmpty && enCola.isEmpty)
          CardSigec(children: [const Text('No tiene citas próximas', style: Txt.fuerte), Boton('Solicitar cita', tipo: TipoBoton.pri, onTap: () => context.push('/solicitar'))]),
        for (final c in proximas)
          CardSigec(
            onTap: () => context.push('/detalle/${c.citaId}'),
            label: 'Cita de ${nombreEsp(c.especialidad)}',
            children: [
              Row(children: [Chip2(textoCita(c.estado), tono: tonoCita(c.estado)), const Spacer(), Text(formatoFecha(c.fechaHora), style: Txt.suave)]),
              Text('${formatoHora(c.fechaHora)} · ${nombreEsp(c.especialidad)}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: Col.ink)),
              Text('${medico(c.medicoId)?.nombre ?? 'Su médico'}${medico(c.medicoId)?.consultorio != null ? ' · Consultorio ${medico(c.medicoId)!.consultorio}' : ''}',
                  style: const TextStyle(color: Col.ink2, fontSize: 15)),
            ],
          ),
        for (final s in enCola)
          CardSigec(children: [
            Row(children: [
              Chip2(
                s.estado == EstadoSolicitud.conflicto ? 'Conflicto' : s.estado == EstadoSolicitud.caducada ? 'Caducada' : 'Pendiente de envío',
                tono: s.estado == EstadoSolicitud.conflicto || s.estado == EstadoSolicitud.caducada ? Tono.err : Tono.warn,
              ),
              const Spacer(),
              const Text('En este teléfono', style: Txt.suave),
            ]),
            Text('${formatoDiaLargo(s.fechaHora)} · ${formatoHora(s.fechaHora)}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Col.ink)),
            Text('${nombreEsp(s.espCodigo)} · ${s.medico}', style: const TextStyle(color: Col.ink2, fontSize: 15)),
            Semantics(
              button: true,
              child: InkWell(onTap: () => context.push('/pendiente'), child: Container(constraints: const BoxConstraints(minHeight: 44), alignment: Alignment.centerLeft, child: const Text('Ver estado', style: TextStyle(fontWeight: FontWeight.w700, color: Col.pri)))),
            ),
          ]),
        if (anteriores.isNotEmpty) const Padding(padding: EdgeInsets.only(top: 4), child: Text('Anteriores', style: Txt.fuerte)),
        if (anteriores.isNotEmpty)
          CardSigec(children: [
            for (final c in anteriores)
              Fila('${formatoFechaHora(c.fechaHora)} · ${nombreEsp(c.especialidad)}', derecha: Chip2(textoCita(c.estado), tono: tonoCita(c.estado))),
          ]),
      ]),
    ]);
  }
}
