import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { colors, radius } from './theme';
import { Aviso, Barra, Boton, Card, Chip, Fila, Interruptor, estilos } from './ui';

// Datos de ejemplo del diseno (mov-*). Login OIDC (react-native-app-auth), SQLite y la cola de solicitudes siguen pendientes.
export type Pantalla =
  | 'login' | 'inicio' | 'detalle' | 'solicitar' | 'pendiente' | 'confirmada'
  | 'avisos' | 'perfil' | 'estudio' | 'estudio-rechazado';
export interface Nav { ir: (p: Pantalla) => void; atras: () => void }

const Cuerpo = ({ children }: { children: React.ReactNode }) => (
  <ScrollView style={{ flex: 1 }} contentContainerStyle={estilos.cuerpo}>{children}</ScrollView>
);

export function Login({ nav }: { nav: Nav }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.side, padding: 28, paddingTop: 48, justifyContent: 'space-between' }}>
      <Text accessibilityRole="header" style={{ color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: 1 }}>SIGEC</Text>
      <View style={{ gap: 14 }}>
        <Text style={{ color: '#fff', fontSize: 34, lineHeight: 38, fontWeight: '700' }}>Sus citas y avisos, en su teléfono</Text>
        <Text style={{ color: colors.sideT, fontSize: 16, lineHeight: 24 }}>Inicie sesión con su cuenta de la clínica para ver sus citas, solicitar una nueva y recibir notificaciones.</Text>
      </View>
      <View style={{ gap: 12 }}>
        <Boton tipo="claro" onPress={() => nav.ir('inicio')}>Iniciar sesión</Boton>
        <Text style={{ color: '#93B0B8', fontSize: 13, textAlign: 'center' }}>Se abrirá el inicio de sesión seguro de la clínica</Text>
      </View>
    </View>
  );
}

export function Inicio({ nav }: { nav: Nav }) {
  return (
    <>
      <Barra titulo="Mis citas" derecha={<Chip tono="ok">Sincronizado</Chip>} />
      <Cuerpo>
        <Card onPress={() => nav.ir('detalle')} label="Cita de hoy, Cardiología a las 10:00">
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><Chip tono="ok">Confirmada</Chip><View style={{ flex: 1 }} /><Text style={estilos.suave}>Hoy</Text></View>
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.ink }}>10:00 · Cardiología</Text>
          <Text style={{ color: colors.ink2, fontSize: 15 }}>Dra. Valeria Antelo · Consultorio 3</Text>
        </Card>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><Chip tono="warn">Pendiente de envío</Chip><View style={{ flex: 1 }} /><Text style={estilos.suave}>Sin enviar</Text></View>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>Lun 9 nov · 08:30</Text>
          <Text style={{ color: colors.ink2, fontSize: 15 }}>Neumología · Dr. Marcelo Suárez</Text>
          <Pressable accessibilityRole="button" onPress={() => nav.ir('pendiente')} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ fontWeight: '700', color: colors.pri }}>Ver estado</Text></Pressable>
        </Card>
        <Text style={[estilos.fuerte, { marginTop: 4 }]}>Anteriores</Text>
        <Card>
          <Fila etiqueta="12 sep · 16:30 · Medicina general"><Chip>Atendida</Chip></Fila>
          <Fila etiqueta="4 may · 09:00 · Neumología"><Chip tono="err">Cancelada</Chip></Fila>
        </Card>
      </Cuerpo>
    </>
  );
}

export function Detalle({ nav }: { nav: Nav }) {
  return (
    <>
      <Barra titulo="Detalle de cita" atras={nav.atras} />
      <Cuerpo>
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><Chip tono="ok">Confirmada</Chip><View style={{ flex: 1 }} /><Text style={{ fontFamily: 'monospace', color: colors.ink3, fontSize: 12.5 }}>CT-20261103-0412</Text></View>
          <Text style={{ fontSize: 24, lineHeight: 29, fontWeight: '700', color: colors.ink }}>Hoy, 3 nov{'\n'}10:00</Text>
          <Fila etiqueta="Especialidad" valor="Cardiología" />
          <Fila etiqueta="Médico" valor="Dra. Valeria Antelo" />
          <Fila etiqueta="Consultorio" valor="3" />
          <Fila etiqueta="Pago" valor="Bs 180 en caja" />
        </Card>
        <Text style={estilos.suave}>Le avisaremos por correo y Telegram si algo cambia en su cita.</Text>
        <Boton onPress={() => nav.ir('solicitar')}>Reprogramar</Boton>
        <Boton tipo="peligro" onPress={() => nav.atras()}>Cancelar cita</Boton>
      </Cuerpo>
    </>
  );
}

const DIAS = ['Mié 4', 'Jue 5', 'Vie 6', 'Lun 9'];
const HORAS: { h: string; off?: boolean }[] = [{ h: '08:30' }, { h: '09:00' }, { h: '09:30', off: true }];

function Casilla({ txt, on, off, onPress }: { txt: string; on?: boolean; off?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!on, disabled: !!off }}
      disabled={off}
      onPress={onPress}
      style={{ flex: 1, minWidth: 80, height: 48, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
        backgroundColor: on ? colors.pri : off ? colors.line2 : '#fff', borderColor: on ? colors.pri : off ? colors.line : colors.bd }}
    >
      <Text style={{ fontWeight: '700', fontSize: 15, color: on ? '#fff' : off ? colors.ink3 : colors.ink, textDecorationLine: off ? 'line-through' : 'none' }}>{txt}</Text>
    </Pressable>
  );
}

export function Solicitar({ nav }: { nav: Nav }) {
  const [dia, setDia] = useState(3);
  const [hora, setHora] = useState('08:30');
  return (
    <>
      <Barra titulo="Solicitar cita" derecha={<Chip tono="warn">Sin conexión</Chip>} />
      <Cuerpo>
        <Aviso tono="warn" titulo="Puede guardar su solicitud">Se enviará al volver la conexión. No estará confirmada hasta que el servidor la acepte.</Aviso>
        <Card><Text style={estilos.suave}>Especialidad</Text><Text style={estilos.fuerte}>Neumología</Text></Card>
        <Card><Text style={estilos.suave}>Médico</Text><Text style={estilos.fuerte}>Dr. Marcelo Suárez</Text></Card>
        <Text style={estilos.fuerte}>Fecha</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{DIAS.map((d, i) => <Casilla key={d} txt={d} on={i === dia} onPress={() => setDia(i)} />)}</View>
        <Text style={estilos.fuerte}>Horario <Text style={[estilos.suave, { fontWeight: '400' }]}>· última sincronización 08:40</Text></Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{HORAS.map((h) => <Casilla key={h.h} txt={h.h} off={h.off} on={!h.off && hora === h.h} onPress={() => setHora(h.h)} />)}</View>
        <Boton tipo="pri" onPress={() => nav.ir('pendiente')}>Guardar solicitud</Boton>
      </Cuerpo>
    </>
  );
}

export function Pendiente({ nav }: { nav: Nav }) {
  const pasos = [
    { t: 'Guardada en el teléfono', d: 'Hoy 09:12', hecho: true },
    { t: 'Envío al servidor', d: 'Automático al volver la conexión', hecho: false },
    { t: 'Confirmación de la clínica', d: 'Se comprueba que el horario siga libre', hecho: false },
  ];
  return (
    <>
      <Barra titulo="Solicitud guardada" derecha={<Chip tono="warn">Sin conexión</Chip>} />
      <Cuerpo>
        <Card style={{ gap: 10 }}>
          <Chip tono="warn">Pendiente de envío</Chip>
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.ink }}>Lun 9 nov · 08:30</Text>
          <Text style={{ color: colors.ink2, fontSize: 15 }}>Neumología · Dr. Marcelo Suárez</Text>
        </Card>
        <Card style={{ gap: 14 }}>
          {pasos.map((p) => (
            <View key={p.t} style={{ flexDirection: 'row', gap: 14 }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, marginTop: 4, backgroundColor: p.hecho ? colors.pri : '#fff', borderWidth: p.hecho ? 0 : 2, borderColor: colors.bd }} />
              <View><Text style={estilos.fuerte}>{p.t}</Text><Text style={estilos.suave}>{p.d}</Text></View>
            </View>
          ))}
        </Card>
        <Aviso titulo="Aún no es una cita confirmada">Si el horario se ocupa mientras tanto, le pediremos elegir otro turno.</Aviso>
        <Boton tipo="pri" onPress={() => nav.ir('inicio')}>Ver mis citas</Boton>
      </Cuerpo>
    </>
  );
}

export function Confirmada({ nav }: { nav: Nav }) {
  return (
    <>
      <Barra titulo="Cita confirmada" atras={() => nav.ir('inicio')} />
      <Cuerpo>
        <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
          <Chip tono="ok">Confirmada</Chip>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink }}>Cardiología</Text>
          <Text style={estilos.texto}>Martes 3 de noviembre · 10:00</Text>
          <Text style={estilos.suave}>Dra. Valeria Antelo · Consultorio 3</Text>
        </Card>
        <Card><Fila etiqueta="Cargo registrado" valor="Bs 180" /><Fila etiqueta="Aviso enviado" valor="Correo y Telegram" /></Card>
        <Text style={estilos.suave}>Se confirmó tras guardarse su solicitud sin conexión y enviarse al recuperar la señal.</Text>
        <Boton tipo="pri" onPress={() => nav.ir('detalle')}>Ver detalle de la cita</Boton>
        <Boton onPress={() => nav.ir('inicio')}>Volver a mis citas</Boton>
      </Cuerpo>
    </>
  );
}

const AVISOS = [
  { t: 'Cita confirmada', h: '08:52', d: 'Tu cita del 3 de noviembre a las 10:00 fue confirmada.', nuevo: true },
  { t: 'Recordatorio', h: '08:00', d: 'Tu cita es hoy a las 10:00. Consulta el detalle en la app.', nuevo: true },
  { t: 'Cita cancelada', h: '2 nov', d: 'Tu cita del 4 de mayo fue cancelada.', nuevo: false },
  { t: 'Cita reprogramada', h: '28 oct', d: 'Tu cita fue movida al 3 de noviembre a las 10:00.', nuevo: false },
];

export function Avisos() {
  const [leidos, setLeidos] = useState(false);
  return (
    <>
      <Barra titulo="Avisos" derecha={<Pressable accessibilityRole="button" onPress={() => setLeidos(true)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={estilos.fuerte}>Marcar leídos</Text></Pressable>} />
      <Cuerpo>
        <Card>
          {AVISOS.map((a) => (
            <View key={a.t} style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line2 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 6, backgroundColor: a.nuevo && !leidos ? colors.pri : 'transparent' }} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row' }}><Text style={estilos.fuerte}>{a.t}</Text><View style={{ flex: 1 }} /><Text style={estilos.suave}>{a.h}</Text></View>
                <Text style={{ color: colors.ink2, fontSize: 15 }}>{a.d}</Text>
              </View>
            </View>
          ))}
        </Card>
        <Text style={estilos.suave}>Los avisos no incluyen diagnósticos ni estudios. El detalle se consulta dentro de la app.</Text>
      </Cuerpo>
    </>
  );
}

export function Perfil({ nav }: { nav: Nav }) {
  const [correo, setCorreo] = useState(true);
  const [telegram, setTelegram] = useState(false);
  return (
    <>
      <Barra titulo="Perfil" />
      <Cuerpo>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.priT, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontWeight: '700', fontSize: 18, color: colors.priD }}>CR</Text></View>
          <View><Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>Carla Rojas Vaca</Text><Text style={estilos.suave}>HC-004218 · 7845123 SC</Text></View>
        </Card>
        <Card>
          <Text style={estilos.fuerte}>Avisos</Text>
          <Fila etiqueta="Correo electrónico"><Interruptor value={correo} onValueChange={setCorreo} label="Avisos por correo electrónico" /></Fila>
          <Fila etiqueta="Telegram"><Interruptor value={telegram} onValueChange={setTelegram} label="Avisos por Telegram" /></Fila>
          <Text style={estilos.suave}>Telegram se vincula con un código de un solo uso.</Text>
        </Card>
        <Card>
          <Pressable accessibilityRole="button" onPress={() => nav.ir('estudio')} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center' }}><Text style={estilos.fuerte}>Mis estudios</Text><View style={{ flex: 1 }} /><Text style={{ color: colors.ink3 }}>›</Text></Pressable>
          <Pressable accessibilityRole="button" style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center' }}><Text style={estilos.fuerte}>Mis datos de contacto</Text><View style={{ flex: 1 }} /><Text style={{ color: colors.ink3 }}>›</Text></Pressable>
        </Card>
        <Boton onPress={() => nav.ir('login')}>Cerrar sesión</Boton>
      </Cuerpo>
    </>
  );
}

export function Estudio({ nav, rechazado }: { nav: Nav; rechazado?: boolean }) {
  return (
    <>
      <Barra titulo="Subir estudio previo" atras={() => nav.ir('perfil')} />
      <Cuerpo>
        <View style={{ height: 240, borderRadius: radius.card, backgroundColor: '#1B2A31', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#B9CBD1', fontSize: 12.5 }}>Vista previa de la imagen</Text></View>
        <Card>
          {rechazado ? <Chip tono="err">No es una radiografía de tórax</Chip> : <Chip tono="ok">Es una radiografía de tórax</Chip>}
          <Text style={estilos.fuerte}>{rechazado ? 'foto_documento.jpg' : 'radiografia_2025.jpg'}</Text>
          <Text style={estilos.suave}>{rechazado ? 'Comprobado en su teléfono. La imagen no salió de su dispositivo ni se envió.' : 'Comprobado en su teléfono con un modelo local. La imagen todavía no salió de su dispositivo.'}</Text>
        </Card>
        {rechazado
          ? <Aviso titulo="Qué puede hacer">Elija una radiografía de tórax en JPG o PNG.</Aviso>
          : <Aviso titulo="Solo apoyo al médico">La app no interpreta la imagen; su médico la revisará.</Aviso>}
        {rechazado ? (
          <>
            <Boton tipo="pri" onPress={() => nav.ir('estudio')}>Elegir otra imagen</Boton>
            <Boton onPress={() => nav.ir('perfil')}>Cancelar</Boton>
          </>
        ) : (
          <>
            <Boton onPress={() => nav.ir('estudio-rechazado')}>Elegir otra imagen</Boton>
            <Boton tipo="pri" onPress={() => nav.ir('perfil')}>Enviar estudio</Boton>
          </>
        )}
      </Cuerpo>
    </>
  );
}
