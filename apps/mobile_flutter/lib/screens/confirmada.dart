import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/formato.dart';
import '../providers.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class ConfirmadaScreen extends ConsumerWidget {
  const ConfirmadaScreen(this.id, {super.key});
  final String id;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cita = ref.leer(pCita(id));
    final medicos = ref.leer(pMedicos());
    final c = cita.datos;
    final m = medicos.datos?.where((x) => x.id == c?.medicoId).firstOrNull;
    return Column(children: [
      Barra('Cita confirmada', atras: () => context.go('/')),
      Cuerpo(children: [
        if (cita.error != null) ErrorApiW(cita.error!),
        if (c == null && cita.error == null) const Cargando(),
        if (c != null) ...[
          CardSigec(centrado: true, padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16), children: [
            Chip2(textoCita(c.estado), tono: tonoCita(c.estado)),
            Text(nombreEsp(c.especialidad), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: Col.ink)),
            Text('${formatoDiaLargo(c.fechaHora)} · ${formatoHora(c.fechaHora)}', style: Txt.texto),
            Text('${m?.nombre ?? ''}${m?.consultorio != null ? ' · Consultorio ${m!.consultorio}' : ''}', style: Txt.suave),
          ]),
          Boton('Ver detalle de la cita', tipo: TipoBoton.pri, onTap: () => context.push('/detalle/${c.citaId}')),
        ],
        Boton('Volver a mis citas', onTap: () => context.go('/')),
      ]),
    ]);
  }
}
