const SERVICIOS = [
  ['MS2 Pacientes', 'Spring Boot · PostgreSQL', 'ok', 'Operativo', '84 ms'],
  ['MS3 Citas', 'NestJS · DynamoDB', 'ok', 'Operativo', '61 ms'],
  ['MS4 Historias clínicas', 'Spring Boot', 'ok', 'Operativo', '97 ms'],
  ['MS5 Imágenes e IA', 'NestJS · FastAPI · S3 · MongoDB', 'warn', 'Lento', '1.420 ms'],
  ['MS6 Facturación', 'Laravel', 'ok', 'Operativo', '73 ms'],
  ['MS7 Inteligencia', 'NestJS · FastAPI · pgvector', 'ok', 'Operativo', '120 ms'],
  ['MS8 Notificaciones', 'NestJS · n8n · DynamoDB', 'err', 'Sin respuesta', '—'],
]

export function Servicios() {
  return (
    <div className="page">
      <div className="ph"><div><h1 className="h1">Estado de servicios</h1><p className="sub">Comprobación de salud de cada microservicio (/health) · datos de ejemplo del diseño</p></div></div>
      <div className="card flush"><div className="scroll"><table className="tbl">
        <thead><tr><th>Servicio</th><th>Tecnología</th><th>Estado</th><th>Respuesta</th></tr></thead>
        <tbody>{SERVICIOS.map(([n, t, tono, e, ms]) => <tr key={n}><td className="b">{n}</td><td>{t}</td><td><span className={`chip ${tono}`}>{e}</span></td><td className="mono">{ms}</td></tr>)}</tbody>
      </table></div></div>
      <div className="banner err" role="alert"><div><b>MS8 no responde</b><span>Los avisos quedan en cola y se reintentan; las citas siguen confirmándose.</span></div></div>
    </div>
  )
}
