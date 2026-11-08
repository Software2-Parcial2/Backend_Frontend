import { ApiError, dinero, fechaLocal, formatoDiaLargo, formatoFecha, formatoFechaHora, formatoHora, inicioDelDia, sumarDias } from '@sigec/api-client';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useApi } from './api';
import { agregarSolicitud, descartarSolicitud, procesarCola, reintentarSolicitud, useCola } from './offline/cola';
import { useDatos } from './offline/datos';
import { useSesion } from './sesion';
import { colors, radius } from './theme';
import { Aviso, Barra, Boton, Card, Chip, Fila, Interruptor, estilos } from './ui';

export type Pantalla = 'login' | 'inicio' | 'detalle' | 'solicitar' | 'pendiente' | 'confirmada' | 'avisos' | 'perfil' | 'estudio';
/** `arg` = id de la cita (detalle, confirmada) o de la cita a reprogramar (solicitar). */
export interface Nav { ir: (p: Pantalla, arg?: string) => void; atras: () => void; arg?: string }

interface Paciente { id: string; nombre: string; numeroHistoria: string; documento: string; email: string | null }
interface Cita { citaId: string; estado: string; medicoId: string; especialidad: string; fechaHora: string; facturaId?: string | null; motivoFallo?: string | null }
interface Medico { id: string; nombre: string; especialidad: { codigo: string; nombre: string }; consultorio: string | null }
interface Especialidad { id: string; codigo: string; nombre: string; activa: boolean }
interface Franja { fechaHora: string; estado: string }
interface Aviso_ { id: string; tipo: string; creadaEn: string; leida: boolean }
interface Estudio_ { id: string; estudio: string; validacion: string; creadaEn: string; informe: { texto: string } | null }
interface Prefs { canales: string[]; email: string | null; telegramVinculado: boolean; tiposAviso: string[]; antelacionHoras: number }

const Cuerpo = ({ children }: { children: React.ReactNode }) => <ScrollView style={{ flex: 1 }} contentContainerStyle={estilos.cuerpo}>{children}</ScrollView>;
const Cargando = ({ texto = 'Cargando…' }: { texto?: string }) => <View style={{ padding: 24, alignItems: 'center', gap: 10 }} accessibilityRole="progressbar"><ActivityIndicator color={colors.pri} /><Text style={estilos.suave}>{texto}</Text></View>;
const nombreEsp = (c: string) => (c ? c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, ' ') : '—');
const tonoCita = (e: string) => (e === 'CONFIRMADA' ? 'ok' : e === 'EN_SALA' ? 'info' : e.startsWith('CANCEL') || e === 'NO_ASISTIO' || e === 'ANULADA' ? 'err' : e === 'ATENDIDA' ? 'neutral' : 'warn') as 'ok' | 'info' | 'err' | 'neutral' | 'warn';
const textoCita = (e: string) => ({ CONFIRMADA: 'Confirmada', EN_SALA: 'En sala', ATENDIDA: 'Atendida', NO_ASISTIO: 'No asistió', CANCELADA_USUARIO: 'Cancelada', CANCELADA: 'No se confirmó', ANULADA: 'No se confirmó' }[e] ?? 'En proceso');

function ErrorApi({ error, onReintentar }: { error: ApiError; onReintentar?: () => void }) {
  const t = error.estado === 0 ? 'Sin conexión con el servidor' : error.estado === 403 ? 'No tiene permiso para esto' : error.estado === 401 ? 'Su sesión venció' : 'No se pudo completar';
  return (
    <Aviso tono="err" titulo={t}>
      {`${error.estado === 0 ? 'Revise su red e intente de nuevo.' : (error.detalle ?? error.message)}${error.correlationId ? `\nCódigo de soporte: ${error.correlationId}` : ''}`}
      {onReintentar ? '' : ''}
    </Aviso>
  );
}
const SinConexion = ({ en }: { en?: number }) => <Aviso tono="warn" titulo="Datos guardados en este teléfono">{`No hay conexión con el servidor.${en ? ` Última sincronización: ${formatoFechaHora(new Date(en))}.` : ''}`}</Aviso>;

export function Login() {
  const s = useSesion();
  return (
    <View style={{ flex: 1, backgroundColor: colors.side, padding: 28, paddingTop: 48, justifyContent: 'space-between' }}>
      <Text accessibilityRole="header" style={{ color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: 1 }}>SIGEC</Text>
      <View style={{ gap: 14 }}>
        <Text style={{ color: '#fff', fontSize: 34, lineHeight: 38, fontWeight: '700' }}>Sus citas y avisos, en su teléfono</Text>
        <Text style={{ color: colors.sideT, fontSize: 16, lineHeight: 24 }}>Inicie sesión con su cuenta de la clínica para ver sus citas, solicitar una nueva y recibir notificaciones.</Text>
      </View>
      <View style={{ gap: 12 }}>
        {s.error && <Text style={{ color: '#FFB4B4', fontSize: 14 }} accessibilityRole="alert">{s.error}</Text>}
        {s.estado === 'cargando' ? <Cargando texto="Comprobando su sesión…" /> : <Boton tipo="claro" onPress={() => void s.entrar()}>Iniciar sesión</Boton>}
        <Text style={{ color: '#93B0B8', fontSize: 13, textAlign: 'center' }}>Se abrirá el inicio de sesión seguro de la clínica</Text>
      </View>
    </View>
  );
}

function useBase() {
  const api = useApi();
  const cola = useCola(api);
  const me = useDatos<Paciente>('me', (a, signal) => a.get<Paciente>('/api/pacientes/me', { signal }));
  const citas = useDatos<Cita[]>(me.datos ? `citas:${me.datos.id}` : null, (a, signal) => a.pagina<Cita>('/api/citas', { query: { pacienteId: me.datos!.id }, limite: 100, signal }).then((p) => p.items));
  const medicos = useDatos<Medico[]>('medicos', (a, signal) => a.todas<Medico>('/api/medicos', { limite: 100, signal }).then((r) => r.items));
  return { api, cola, me, citas, medicos };
}

export function Inicio({ nav }: { nav: Nav }) {
  const { cola, me, citas, medicos } = useBase();
  const medico = (id: string) => medicos.datos?.find((m) => m.id === id);
  const todas = [...(citas.datos ?? [])].sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));
  const proximas = todas.filter((c) => Date.parse(c.fechaHora) >= Date.now() && ['CONFIRMADA', 'EN_SALA'].includes(c.estado));
  const anteriores = todas.filter((c) => !proximas.includes(c)).reverse().slice(0, 8);
  const enCola = cola.filter((s) => s.estado !== 'CONFIRMADA');
  const err = me.error ?? citas.error;
  return (
    <>
      <Barra titulo="Mis citas" derecha={citas.desactualizado ? <Chip tono="warn">Sin conexión</Chip> : <Chip tono="ok">Sincronizado</Chip>} />
      <Cuerpo>
        {citas.desactualizado && <SinConexion en={citas.guardadoEn} />}
        {err && <ErrorApi error={err} />}
        {!citas.datos && !err && <Cargando texto="Cargando sus citas…" />}
        {citas.datos && proximas.length === 0 && enCola.length === 0 && <Card><Text style={estilos.fuerte}>No tiene citas próximas</Text><Boton tipo="pri" onPress={() => nav.ir('solicitar')}>Solicitar cita</Boton></Card>}
        {proximas.map((c) => (
          <Card key={c.citaId} onPress={() => nav.ir('detalle', c.citaId)} label={`Cita de ${nombreEsp(c.especialidad)}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}><Chip tono={tonoCita(c.estado)}>{textoCita(c.estado)}</Chip><View style={{ flex: 1 }} /><Text style={estilos.suave}>{formatoFecha(c.fechaHora)}</Text></View>
            <Text style={{ fontSize: 22, fontWeight: '700', color: colors.ink }}>{formatoHora(c.fechaHora)} · {nombreEsp(c.especialidad)}</Text>
            <Text style={{ color: colors.ink2, fontSize: 15 }}>{medico(c.medicoId)?.nombre ?? 'Su médico'}{medico(c.medicoId)?.consultorio ? ` · Consultorio ${medico(c.medicoId)!.consultorio}` : ''}</Text>
          </Card>
        ))}
        {enCola.map((s) => (
          <Card key={s.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}><Chip tono={s.estado === 'CONFLICTO' || s.estado === 'CADUCADA' ? 'err' : 'warn'}>{s.estado === 'CONFLICTO' ? 'Conflicto' : s.estado === 'CADUCADA' ? 'Caducada' : 'Pendiente de envío'}</Chip><View style={{ flex: 1 }} /><Text style={estilos.suave}>En este teléfono</Text></View>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>{formatoDiaLargo(s.cuerpo.fechaHora)} · {formatoHora(s.cuerpo.fechaHora)}</Text>
            <Text style={{ color: colors.ink2, fontSize: 15 }}>{nombreEsp(s.cuerpo.especialidad)} · {s.resumen.medico}</Text>
            <Pressable accessibilityRole="button" onPress={() => nav.ir('pendiente')} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ fontWeight: '700', color: colors.pri }}>Ver estado</Text></Pressable>
          </Card>
        ))}
        {anteriores.length > 0 && <Text style={[estilos.fuerte, { marginTop: 4 }]}>Anteriores</Text>}
        {anteriores.length > 0 && <Card>{anteriores.map((c) => <Fila key={c.citaId} etiqueta={`${formatoFechaHora(c.fechaHora)} · ${nombreEsp(c.especialidad)}`}><Chip tono={tonoCita(c.estado)}>{textoCita(c.estado)}</Chip></Fila>)}</Card>}
      </Cuerpo>
    </>
  );
}

export function Detalle({ nav }: { nav: Nav }) {
  const api = useApi();
  const id = nav.arg;
  const cita = useDatos<Cita>(id ? `cita:${id}` : null, (a, signal) => a.get<Cita>(`/api/citas/${id}`, { signal }));
  const medicos = useDatos<Medico[]>('medicos', (a, signal) => a.todas<Medico>('/api/medicos', { limite: 100, signal }).then((r) => r.items));
  const factura = useDatos<{ monto: string; moneda: string } | null>(cita.datos?.facturaId ? `factura:${cita.datos.facturaId}` : null, (a, signal) => a.get<{ monto: string; moneda: string }>(`/api/facturacion/facturas/${cita.datos!.facturaId}`, { signal }).catch(() => null));
  const [cancelando, setCancelando] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const c = cita.datos;
  const m = medicos.datos?.find((x) => x.id === c?.medicoId);
  async function cancelar() {
    setCancelando(true); setError(null);
    try { await api.post(`/api/citas/${id}/cancelar`, { motivo: 'Cancelada por el paciente desde la app' }); nav.atras(); } catch (e) { setError(e instanceof ApiError ? e : new ApiError(0, undefined, 'No se pudo cancelar')); } finally { setCancelando(false); }
  }
  return (
    <>
      <Barra titulo="Detalle de cita" atras={nav.atras} />
      <Cuerpo>
        {cita.error && <ErrorApi error={cita.error} />}
        {!c && !cita.error && <Cargando />}
        {c && (
          <>
            {cita.desactualizado && <SinConexion en={cita.guardadoEn} />}
            <Card style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}><Chip tono={tonoCita(c.estado)}>{textoCita(c.estado)}</Chip><View style={{ flex: 1 }} /><Text style={{ fontFamily: 'monospace', color: colors.ink3, fontSize: 12.5 }}>{c.citaId.slice(0, 8)}</Text></View>
              <Text style={{ fontSize: 24, lineHeight: 29, fontWeight: '700', color: colors.ink }}>{formatoDiaLargo(c.fechaHora)}{'\n'}{formatoHora(c.fechaHora)}</Text>
              <Fila etiqueta="Especialidad" valor={nombreEsp(c.especialidad)} />
              <Fila etiqueta="Médico" valor={m?.nombre ?? '—'} />
              {m?.consultorio ? <Fila etiqueta="Consultorio" valor={m.consultorio} /> : null}
              {factura.datos ? <Fila etiqueta="Cargo" valor={dinero(factura.datos.monto, factura.datos.moneda, { sinCentavos: true })} /> : null}
            </Card>
            <Text style={estilos.suave}>Le avisaremos por correo y Telegram si algo cambia en su cita.</Text>
            {error && <ErrorApi error={error} />}
            {c.estado === 'CONFIRMADA' && <Boton onPress={() => nav.ir('solicitar', c.citaId)}>Reprogramar</Boton>}
            {c.estado === 'CONFIRMADA' && <Boton tipo="peligro" disabled={cancelando} onPress={() => void cancelar()}>Cancelar cita</Boton>}
          </>
        )}
      </Cuerpo>
    </>
  );
}

function Casilla({ txt, on, onPress }: { txt: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on }} onPress={onPress}
      style={{ flex: 1, minWidth: 80, height: 48, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.pri : '#fff', borderColor: on ? colors.pri : colors.bd }}>
      <Text style={{ fontWeight: '700', fontSize: 15, color: on ? '#fff' : colors.ink }}>{txt}</Text>
    </Pressable>
  );
}

export function Solicitar({ nav }: { nav: Nav }) {
  const { api, me } = useBase();
  const reprogramar = nav.arg;
  const esps = useDatos<Especialidad[]>('especialidades', (a, signal) => a.todas<Especialidad>('/api/especialidades', { limite: 100, signal }).then((r) => r.items.filter((e) => e.activa)));
  const medicos = useDatos<Medico[]>('medicos', (a, signal) => a.todas<Medico>('/api/medicos', { limite: 100, signal }).then((r) => r.items));
  const original = useDatos<Cita>(reprogramar ? `cita:${reprogramar}` : null, (a, signal) => a.get<Cita>(`/api/citas/${reprogramar}`, { signal }));
  const [esp, setEsp] = useState('');
  const [medicoId, setMedicoId] = useState('');
  const dias = useMemo(() => Array.from({ length: 6 }, (_, i) => sumarDias(fechaLocal(), i)), []);
  const [dia, setDia] = useState(dias[0]!);
  const [hora, setHora] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => { if (original.datos) { setEsp(original.datos.especialidad); setMedicoId(original.datos.medicoId); } }, [original.datos]);
  useEffect(() => { if (!esp && !reprogramar && esps.datos?.[0]) setEsp(esps.datos[0].codigo); }, [esps.datos, esp, reprogramar]);
  const delEsp = (medicos.datos ?? []).filter((m) => m.especialidad.codigo === esp);
  useEffect(() => { if (!reprogramar && esp && !delEsp.some((m) => m.id === medicoId) && delEsp[0]) setMedicoId(delEsp[0].id); }, [esp, delEsp, medicoId, reprogramar]);
  const medico = delEsp.find((m) => m.id === medicoId);
  const franjas = useDatos<Franja[]>(medicoId ? `disp:${medicoId}:${dia}` : null, (a, signal) =>
    a.pagina<Franja>('/api/citas/disponibilidad', { query: { medicoId, desde: inicioDelDia(dia), hasta: inicioDelDia(sumarDias(dia, 1)) }, limite: 100, signal }).then((p) => p.items));
  const libres = (franjas.datos ?? []).filter((f) => f.estado === 'LIBRE');

  async function guardar() {
    if (!me.datos || !medico || !hora) return;
    setGuardando(true); setError(null);
    try {
      if (reprogramar) { await api.post(`/api/citas/${reprogramar}/reprogramar`, { fechaHora: hora }); nav.ir('inicio'); return; }
      await agregarSolicitud({ pacienteId: me.datos.id, medicoId: medico.id, especialidad: esp, fechaHora: hora }, { especialidad: esp, medico: medico.nombre });
      void procesarCola(api);
      nav.ir('pendiente');
    } catch (e) { setError(e instanceof ApiError ? e : new ApiError(0, undefined, 'No se pudo guardar')); } finally { setGuardando(false); }
  }
  return (
    <>
      <Barra titulo={reprogramar ? 'Reprogramar cita' : 'Solicitar cita'} atras={reprogramar ? nav.atras : undefined} derecha={franjas.desactualizado ? <Chip tono="warn">Sin conexión</Chip> : undefined} />
      <Cuerpo>
        {franjas.desactualizado && <Aviso tono="warn" titulo="Puede guardar su solicitud">Se enviará al volver la conexión. No estará confirmada hasta que el servidor la acepte.</Aviso>}
        {!reprogramar && (esps.datos ?? []).length > 0 && (
          <>
            <Text style={estilos.fuerte}>Especialidad</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{(esps.datos ?? []).map((e) => <Casilla key={e.id} txt={e.nombre} on={e.codigo === esp} onPress={() => { setEsp(e.codigo); setMedicoId(''); setHora(''); }} />)}</View>
            <Text style={estilos.fuerte}>Médico</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{delEsp.map((m) => <Casilla key={m.id} txt={m.nombre} on={m.id === medicoId} onPress={() => { setMedicoId(m.id); setHora(''); }} />)}</View>
          </>
        )}
        {reprogramar && medico === undefined && !original.datos && <Cargando />}
        {reprogramar && <Card><Text style={estilos.suave}>Médico</Text><Text style={estilos.fuerte}>{medicos.datos?.find((m) => m.id === medicoId)?.nombre ?? '—'}</Text></Card>}
        <Text style={estilos.fuerte}>Fecha</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{dias.map((d) => <Casilla key={d} txt={formatoFecha(`${d}T12:00:00Z`)} on={d === dia} onPress={() => { setDia(d); setHora(''); }} />)}</View>
        <Text style={estilos.fuerte}>Horario{franjas.guardadoEn ? <Text style={[estilos.suave, { fontWeight: '400' }]}> · {franjas.desactualizado ? 'última sincronización' : 'actualizado'} {formatoHora(new Date(franjas.guardadoEn))}</Text> : null}</Text>
        {franjas.error ? <ErrorApi error={franjas.error} /> : !franjas.datos && medicoId ? <Cargando texto="Buscando horarios…" /> : libres.length === 0 ? <Text style={estilos.suave}>No hay horarios libres ese día.</Text> : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{libres.map((f) => <Casilla key={f.fechaHora} txt={formatoHora(f.fechaHora)} on={hora === f.fechaHora} onPress={() => setHora(f.fechaHora)} />)}</View>
        )}
        {error && <ErrorApi error={error} />}
        <Boton tipo="pri" disabled={!hora || guardando || !medico} onPress={() => void guardar()}>{reprogramar ? 'Reprogramar cita' : 'Guardar solicitud'}</Boton>
      </Cuerpo>
    </>
  );
}

const CHIPS: Record<string, { t: string; tono: 'warn' | 'info' | 'ok' | 'err' }> = {
  PENDIENTE: { t: 'Pendiente', tono: 'warn' }, ENVIANDO: { t: 'Enviando', tono: 'info' }, CONFIRMANDO: { t: 'Confirmando', tono: 'info' },
  CONFIRMADA: { t: 'Confirmada', tono: 'ok' }, CONFLICTO: { t: 'Conflicto', tono: 'err' }, CADUCADA: { t: 'Caducada', tono: 'err' },
};

export function Pendiente({ nav }: { nav: Nav }) {
  const api = useApi();
  const cola = useCola(api);
  const lista = [...cola].reverse();
  return (
    <>
      <Barra titulo="Solicitudes guardadas" />
      <Cuerpo>
        {lista.length === 0 && <Card><Text style={estilos.suave}>No hay solicitudes guardadas.</Text></Card>}
        {lista.map((s) => (
          <Card key={s.id} style={{ gap: 8 }}>
            <Chip tono={CHIPS[s.estado]!.tono}>{CHIPS[s.estado]!.t}</Chip>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink }}>{formatoDiaLargo(s.cuerpo.fechaHora)} · {formatoHora(s.cuerpo.fechaHora)}</Text>
            <Text style={{ color: colors.ink2, fontSize: 15 }}>{nombreEsp(s.cuerpo.especialidad)} · {s.resumen.medico}</Text>
            <Text style={estilos.suave}>Guardada {formatoFechaHora(new Date(s.creada))} · clave {s.clave.slice(0, 8)}…{s.clave.slice(-4)}</Text>
            {s.error ? <Text style={{ color: colors.ink2, fontSize: 14 }}>{s.error}</Text> : null}
            {s.estado === 'CONFIRMADA' && s.citaId && <Boton onPress={() => nav.ir('confirmada', s.citaId)}>Ver cita</Boton>}
            {s.estado === 'PENDIENTE' && <Boton onPress={() => { void reintentarSolicitud(s.id).then(() => procesarCola(api)); }}>Enviar ahora</Boton>}
            {(s.estado === 'CONFLICTO' || s.estado === 'CADUCADA') && <Boton tipo="pri" onPress={() => { void descartarSolicitud(s.id); nav.ir('solicitar'); }}>Elegir otro horario</Boton>}
            {(s.estado === 'CONFIRMADA' || s.estado === 'CONFLICTO' || s.estado === 'CADUCADA') && <Boton onPress={() => void descartarSolicitud(s.id)}>Quitar</Boton>}
          </Card>
        ))}
        <Aviso titulo="Aún no es una cita confirmada">Cada solicitud se reenvía con su misma clave, así un reintento nunca crea una reserva duplicada. Las claves caducan a las 24 horas.</Aviso>
        <Boton tipo="pri" onPress={() => nav.ir('inicio')}>Ver mis citas</Boton>
      </Cuerpo>
    </>
  );
}

export function Confirmada({ nav }: { nav: Nav }) {
  const id = nav.arg;
  const cita = useDatos<Cita>(id ? `cita:${id}` : null, (a, signal) => a.get<Cita>(`/api/citas/${id}`, { signal }));
  const medicos = useDatos<Medico[]>('medicos', (a, signal) => a.todas<Medico>('/api/medicos', { limite: 100, signal }).then((r) => r.items));
  const c = cita.datos;
  const m = medicos.datos?.find((x) => x.id === c?.medicoId);
  return (
    <>
      <Barra titulo="Cita confirmada" atras={() => nav.ir('inicio')} />
      <Cuerpo>
        {cita.error && <ErrorApi error={cita.error} />}
        {!c && !cita.error && <Cargando />}
        {c && (
          <>
            <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Chip tono={tonoCita(c.estado)}>{textoCita(c.estado)}</Chip>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink }}>{nombreEsp(c.especialidad)}</Text>
              <Text style={estilos.texto}>{formatoDiaLargo(c.fechaHora)} · {formatoHora(c.fechaHora)}</Text>
              <Text style={estilos.suave}>{m?.nombre ?? ''}{m?.consultorio ? ` · Consultorio ${m.consultorio}` : ''}</Text>
            </Card>
            <Boton tipo="pri" onPress={() => nav.ir('detalle', c.citaId)}>Ver detalle de la cita</Boton>
          </>
        )}
        <Boton onPress={() => nav.ir('inicio')}>Volver a mis citas</Boton>
      </Cuerpo>
    </>
  );
}

const TXT_AVISO: Record<string, string> = { CITA_CONFIRMADA: 'Cita confirmada', CITA_CANCELADA: 'Cita cancelada', CITA_REPROGRAMADA: 'Cita reprogramada', RECORDATORIO: 'Recordatorio', RECORDATORIO_REFUERZO: 'Recordatorio', ESTUDIO_VALIDADO: 'Estudio validado' };

export function Avisos() {
  const api = useApi();
  const me = useDatos<Paciente>('me', (a, signal) => a.get<Paciente>('/api/pacientes/me', { signal }));
  const avisos = useDatos<Aviso_[]>(me.datos ? `avisos:${me.datos.id}` : null, (a, signal) => a.pagina<Aviso_>('/api/notificaciones', { query: { pacienteId: me.datos!.id }, limite: 30, signal }).then((p) => p.items));
  async function marcar() {
    const ids = (avisos.datos ?? []).filter((a) => !a.leida).map((a) => a.id);
    if (ids.length) { await api.post('/api/notificaciones/leidas', { ids }).catch(() => undefined); avisos.recargar(); }
  }
  return (
    <>
      <Barra titulo="Avisos" derecha={<Pressable accessibilityRole="button" onPress={() => void marcar()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={estilos.fuerte}>Marcar leídos</Text></Pressable>} />
      <Cuerpo>
        {avisos.desactualizado && <SinConexion en={avisos.guardadoEn} />}
        {avisos.error && <ErrorApi error={avisos.error} />}
        {!avisos.datos && !avisos.error && <Cargando />}
        {avisos.datos && (
          <Card>
            {avisos.datos.length === 0 && <Text style={estilos.suave}>Todavía no tiene avisos.</Text>}
            {avisos.datos.map((a) => (
              <View key={a.id} style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line2 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 6, backgroundColor: !a.leida ? colors.pri : 'transparent' }} />
                <View style={{ flex: 1 }}><View style={{ flexDirection: 'row' }}><Text style={estilos.fuerte}>{TXT_AVISO[a.tipo] ?? a.tipo}</Text><View style={{ flex: 1 }} /><Text style={estilos.suave}>{formatoFechaHora(a.creadaEn)}</Text></View></View>
              </View>
            ))}
          </Card>
        )}
        <Text style={estilos.suave}>Los avisos no incluyen diagnósticos ni estudios. El detalle se consulta dentro de la app.</Text>
      </Cuerpo>
    </>
  );
}

export function Perfil({ nav }: { nav: Nav }) {
  const api = useApi();
  const sesion = useSesion();
  const me = useDatos<Paciente>('me', (a, signal) => a.get<Paciente>('/api/pacientes/me', { signal }));
  const prefs = useDatos<Prefs>(me.datos ? `prefs:${me.datos.id}` : null, (a, signal) => a.get<Prefs>(`/api/notificaciones/preferencias/${me.datos!.id}`, { signal }));
  const [error, setError] = useState<ApiError | null>(null);
  async function cambiarCanal(canal: 'EMAIL' | 'TELEGRAM', on: boolean) {
    const p = prefs.datos; if (!p || !me.datos) return;
    const canales = on ? [...p.canales, canal] : p.canales.filter((c) => c !== canal);
    if (canales.length === 0) return; // al menos un canal
    setError(null);
    try { await api.put(`/api/notificaciones/preferencias/${me.datos.id}`, { canales, tiposAviso: p.tiposAviso, antelacionHoras: p.antelacionHoras }); prefs.recargar(); } catch (e) { setError(e instanceof ApiError ? e : new ApiError(0, undefined, 'No se pudo guardar')); }
  }
  const p = me.datos;
  return (
    <>
      <Barra titulo="Perfil" />
      <Cuerpo>
        {me.error && <ErrorApi error={me.error} />}
        {!p && !me.error && <Cargando />}
        {p && (
          <>
            {me.desactualizado && <SinConexion en={me.guardadoEn} />}
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.priT, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontWeight: '700', fontSize: 18, color: colors.priD }}>{p.nombre.split(' ').slice(0, 2).map((x) => x[0]).join('')}</Text></View>
              <View><Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>{p.nombre}</Text><Text style={estilos.suave}>{p.numeroHistoria} · {p.documento}</Text></View>
            </Card>
            {prefs.datos && (
              <Card>
                <Text style={estilos.fuerte}>Avisos</Text>
                <Fila etiqueta="Correo electrónico"><Interruptor value={prefs.datos.canales.includes('EMAIL')} onValueChange={(v) => void cambiarCanal('EMAIL', v)} label="Avisos por correo electrónico" /></Fila>
                <Fila etiqueta="Telegram"><Interruptor value={prefs.datos.canales.includes('TELEGRAM')} onValueChange={(v) => void cambiarCanal('TELEGRAM', v)} label="Avisos por Telegram" /></Fila>
                <Text style={estilos.suave}>{prefs.datos.telegramVinculado ? 'Telegram vinculado.' : 'Telegram se vincula con un código de un solo uso desde el portal web.'}</Text>
              </Card>
            )}
            {error && <ErrorApi error={error} />}
            <Card>
              <Pressable accessibilityRole="button" onPress={() => nav.ir('estudio')} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center' }}><Text style={estilos.fuerte}>Mis estudios</Text><View style={{ flex: 1 }} /><Text style={{ color: colors.ink3 }}>›</Text></Pressable>
            </Card>
          </>
        )}
        <Boton onPress={() => void sesion.salir()}>Cerrar sesión</Boton>
      </Cuerpo>
    </>
  );
}

export function Estudio({ nav }: { nav: Nav }) {
  const api = useApi();
  const estudios = useDatos<Estudio_[]>('estudios', (a, signal) => a.pagina<Estudio_>('/api/imagenes', { limite: 30, signal }).then((p) => p.items));
  async function ver(e: Estudio_) {
    const { url } = await api.get<{ url: string }>(`/api/imagenes/${e.id}/url`).catch(() => ({ url: '' }));
    if (url) await import('react-native').then(({ Linking }) => Linking.openURL(url));
  }
  return (
    <>
      <Barra titulo="Mis estudios" atras={() => nav.ir('perfil')} />
      <Cuerpo>
        {estudios.desactualizado && <SinConexion en={estudios.guardadoEn} />}
        {estudios.error && <ErrorApi error={estudios.error} />}
        {!estudios.datos && !estudios.error && <Cargando />}
        {estudios.datos?.length === 0 && <Card><Text style={estilos.suave}>Todavía no tiene informes validados.</Text></Card>}
        {(estudios.datos ?? []).map((e) => (
          <Card key={e.id} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={estilos.fuerte}>Radiografía de tórax</Text><View style={{ flex: 1 }} /><Chip tono={e.validacion === 'VALIDADO' ? 'ok' : 'warn'}>{e.validacion === 'VALIDADO' ? 'Informe validado' : 'En revisión'}</Chip></View>
            <Text style={estilos.suave}>{formatoFecha(e.creadaEn)}</Text>
            <Text style={{ color: colors.ink2, fontSize: 15 }}>{e.informe?.texto ?? 'Su médico aún no valida este estudio.'}</Text>
            <Boton onPress={() => void ver(e)}>Ver imagen</Boton>
          </Card>
        ))}
        <Aviso titulo="Subir un estudio previo">Disponible en el portal web. Aquí aún no se puede elegir una imagen del teléfono (falta el selector de imágenes de Expo).</Aviso>
      </Cuerpo>
    </>
  );
}
