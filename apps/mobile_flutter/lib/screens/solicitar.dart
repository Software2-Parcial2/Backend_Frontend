import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/errores.dart';
import '../api/formato.dart';
import '../models.dart';
import '../offline/cola.dart';
import '../providers.dart';
import '../theme.dart';
import '../widgets/ui.dart';

/// Solicitar cita; con `reprogramar` = id de la cita, reprograma esa.
class SolicitarScreen extends ConsumerStatefulWidget {
  const SolicitarScreen({super.key, this.reprogramar});
  final String? reprogramar;
  @override
  ConsumerState<SolicitarScreen> createState() => _SolicitarState();
}

class _SolicitarState extends ConsumerState<SolicitarScreen> {
  String _esp = '', _medicoId = '', _hora = '';
  late final List<String> _dias = List.generate(6, (i) => sumarDias(fechaLocal(), i));
  late String _dia = _dias.first;
  bool _guardando = false, _origenAplicado = false;
  ApiError? _error;

  Future<void> _guardar(Paciente? me, Medico? medico) async {
    if (me == null || medico == null || _hora.isEmpty) return;
    setState(() { _guardando = true; _error = null; });
    try {
      final r = widget.reprogramar;
      if (r != null) {
        await ref.read(apiProvider).post('/api/citas/$r/reprogramar', {'fechaHora': _hora});
        if (mounted) context.go('/');
        return;
      }
      await ref.read(colaProvider.notifier).agregar(
        {'pacienteId': me.id, 'medicoId': medico.id, 'especialidad': _esp, 'fechaHora': _hora},
        especialidad: _esp, medico: medico.nombre);
      ref.read(colaProvider.notifier).procesar();
      if (mounted) context.push('/pendiente');
    } catch (e) {
      if (mounted) setState(() => _error = e is ApiError ? e : ApiError(0, mensajeAlterno: 'No se pudo guardar'));
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final reprogramar = widget.reprogramar;
    final me = ref.leer(pMe());
    final esps = ref.leer(pEspecialidades());
    final medicos = ref.leer(pMedicos());
    final original = ref.leer(reprogramar == null ? null : pCita(reprogramar));

    if (!_origenAplicado && original.datos != null) {
      _origenAplicado = true;
      _esp = original.datos!.especialidad;
      _medicoId = original.datos!.medicoId;
    }
    if (_esp.isEmpty && reprogramar == null && (esps.datos?.isNotEmpty ?? false)) _esp = esps.datos!.first.codigo;
    final delEsp = (medicos.datos ?? <Medico>[]).where((m) => m.espCodigo == _esp).toList();
    if (reprogramar == null && _esp.isNotEmpty && !delEsp.any((m) => m.id == _medicoId) && delEsp.isNotEmpty) _medicoId = delEsp.first.id;
    final medico = delEsp.where((m) => m.id == _medicoId).firstOrNull;
    final nombreMedico = medicos.datos?.where((m) => m.id == _medicoId).firstOrNull?.nombre ?? '—';

    final franjas = ref.leer(_medicoId.isEmpty ? null : pFranjas(_medicoId, _dia));
    final libres = (franjas.datos ?? <Franja>[]).where((f) => f.estado == 'LIBRE').toList();

    return Column(children: [
      Barra(reprogramar != null ? 'Reprogramar cita' : 'Solicitar cita',
          atras: reprogramar != null ? () => context.pop() : null,
          derecha: franjas.desactualizado ? const Chip2('Sin conexión', tono: Tono.warn) : null),
      Cuerpo(children: [
        if (franjas.desactualizado) const Aviso('Puede guardar su solicitud', tono: Tono.warn, texto: 'Se enviará al volver la conexión. No estará confirmada hasta que el servidor la acepte.'),
        if (reprogramar == null && (esps.datos ?? []).isNotEmpty) ...[
          const Text('Especialidad', style: Txt.fuerte),
          Casillas(children: [for (final e in esps.datos!) Casilla(e.nombre, activa: e.codigo == _esp, onTap: () => setState(() { _esp = e.codigo; _medicoId = ''; _hora = ''; }))]),
          const Text('Médico', style: Txt.fuerte),
          Casillas(children: [for (final m in delEsp) Casilla(m.nombre, activa: m.id == _medicoId, onTap: () => setState(() { _medicoId = m.id; _hora = ''; }))]),
        ],
        if (reprogramar != null && original.datos == null) const Cargando(),
        if (reprogramar != null) CardSigec(children: [const Text('Médico', style: Txt.suave), Text(nombreMedico, style: Txt.fuerte)]),
        const Text('Fecha', style: Txt.fuerte),
        Casillas(children: [for (final d in _dias) Casilla(formatoFecha('${d}T12:00:00Z'), activa: d == _dia, onTap: () => setState(() { _dia = d; _hora = ''; }))]),
        Text.rich(TextSpan(style: Txt.fuerte, children: [
          const TextSpan(text: 'Horario'),
          if (franjas.guardadoEn != null)
            TextSpan(text: ' · ${franjas.desactualizado ? 'última sincronización' : 'actualizado'} ${formatoHora(franjas.guardadoEn)}', style: Txt.suave),
        ])),
        if (franjas.error != null)
          ErrorApiW(franjas.error!)
        else if (franjas.datos == null && _medicoId.isNotEmpty)
          const Cargando(texto: 'Buscando horarios…')
        else if (libres.isEmpty)
          const Text('No hay horarios libres ese día.', style: Txt.suave)
        else
          Casillas(children: [for (final f in libres) Casilla(formatoHora(f.fechaHora), activa: _hora == f.fechaHora, onTap: () => setState(() => _hora = f.fechaHora))]),
        if (_error != null) ErrorApiW(_error!),
        Boton(reprogramar != null ? 'Reprogramar cita' : 'Guardar solicitud', tipo: TipoBoton.pri, deshabilitado: _hora.isEmpty || _guardando || medico == null && reprogramar == null, onTap: () => _guardar(me.datos, medico ?? medicos.datos?.where((m) => m.id == _medicoId).firstOrNull)),
      ]),
    ]);
  }
}
