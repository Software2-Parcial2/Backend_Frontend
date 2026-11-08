import { H1 } from './ui'

export { Inicio } from './Inicio'
export { Citas, Confirmada } from './Citas'
export { Solicitar, Pendientes } from './Solicitar'
export { Datos, Estudios, PreferenciasPaciente as Preferencias } from './Perfil'

export function Instalar() {
  return (
    <>
      <div><h1 className="h1" style={H1}>Instale la app en su teléfono</h1><p className="sub">Acceda más rápido y reserve citas aunque no tenga señal</p></div>
      <div className="card col" style={{ gap: 14, maxWidth: 640 }}>
        <div className="li"><span className="chip pri">1</span><div><div className="b">Abra el menú del navegador</div><div className="sm muted">Toque los tres puntos o el botón de compartir</div></div></div>
        <div className="li"><span className="chip pri">2</span><div><div className="b">Elija «Agregar a la pantalla de inicio»</div><div className="sm muted">Se creará un ícono de SIGEC</div></div></div>
        <div className="li"><span className="chip pri">3</span><div><div className="b">Abra SIGEC desde el ícono</div><div className="sm muted">Sus solicitudes guardadas se enviarán al volver la conexión</div></div></div>
        <div className="fx"><a className="btn pri" href="#/inicio" style={{ height: 46 }}>Entendido</a></div>
      </div>
    </>
  )
}
