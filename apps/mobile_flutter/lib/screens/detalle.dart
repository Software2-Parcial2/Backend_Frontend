import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/errores.dart';
import '../api/formato.dart';
import '../providers.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class DetalleScreen extends ConsumerStatefulWidget {
  const DetalleScreen(this.id, {super.key});
  final String id;
  @override
  ConsumerState<DetalleScreen> createState() => _DetalleState();
}

class _DetalleState extends ConsumerState<DetalleScreen> {
  bool _cancelando = false;
  ApiError? _error;

  Future<void> _cancelar() async {
    setState(() { _cancelando = true; _error = null; });
    try {
      await ref.read(apiProvider).post('/api/citas/${widget.id}/cancelar', {'motivo': 'Cancelada por el paciente desde la app'});
      if (mounted) context.pop();
    } catch (e) {
      if (mounted) setState(() => _error = e is ApiError ? e : ApiError(0, mensajeAlterno: 'No se pudo cancelar'));
    } finally {
      if (mounted) setState(() => _cancelando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cita = ref.leer(pCita(widget.id));
    final medicos = ref.leer(pMedicos());
    final c = cita.datos;
    final m = medicos.datos?.where((x) => x.id == c?.medicoId).firstOrNull;
    final factura = ref.leer(c?.facturaId == null ? null : pFactura(c!.facturaId!));
    return Column(children: [
      Barra('Detalle de cita', atras: () => context.pop()),
      Cuerpo(children: [
        if (cita.error != null) ErrorApiW(cita.error!),
        if (c == null && cita.error == null) const Cargando(),
        if (c != null) ...[
          if (cita.desactualizado) SinConexion(en: cita.guardadoEn),
          CardSigec(gap: 10, children: [
            Row(children: [
              Chip2(textoCita(c.estado), tono: tonoCita(c.estado)),
              const Spacer(),
              Text(c.citaId.substring(0, c.citaId.length < 8 ? c.citaId.length : 8), style: const TextStyle(fontFamily: 'monospace', color: Col.ink3, fontSize: 12.5)),
            ]),
            Text('${formatoDiaLargo(c.fechaHora)}\n${formatoHora(c.fechaHora)}', style: const TextStyle(fontSize: 24, height: 29 / 24, fontWeight: FontWeight.w700, color: Col.ink)),
            Fila('Especialidad', valor: nombreEsp(c.especialidad)),
            Fila('Médico', valor: m?.nombre ?? '—'),
            if (m?.consultorio != null) Fila('Consultorio', valor: m!.consultorio),
            if (factura.datos != null) Fila('Cargo', valor: dinero(factura.datos!.monto, factura.datos!.moneda, true)),
          ]),
          const Text('Le avisaremos por correo y Telegram si algo cambia en su cita.', style: Txt.suave),
          if (_error != null) ErrorApiW(_error!),
          if (c.estado == 'CONFIRMADA') Boton('Reprogramar', onTap: () => context.push('/solicitar?reprogramar=${c.citaId}')),
          if (c.estado == 'CONFIRMADA') Boton('Cancelar cita', tipo: TipoBoton.peligro, deshabilitado: _cancelando, onTap: _cancelar),
        ],
      ]),
    ]);
  }
}
