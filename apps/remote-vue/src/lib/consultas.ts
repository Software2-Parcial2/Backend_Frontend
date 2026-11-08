import { gql } from '@apollo/client'

export const RESUMEN_CITAS = gql`
  query ResumenCitas($desde: String!, $hasta: String!) {
    resumenCitas(desde: $desde, hasta: $hasta, agruparPor: ESPECIALIDAD) {
      total
      truncado
      grupos { clave total confirmadas canceladas }
    }
  }
`

export const INGRESOS = gql`
  query Ingresos($desde: String!, $hasta: String!) {
    ingresos(desde: $desde, hasta: $hasta, agrupar: mes) { periodo confirmado provisional facturas }
  }
`

export const DEMANDA = gql`
  query Demanda {
    demandaEspecialidades { k silueta sintetico especialidades { especialidad etiqueta citasPorSemana } }
  }
`

export function rangoDias(dias: number, hoy = new Date()): { desde: string; hasta: string } {
  const f = (d: Date) => d.toISOString().slice(0, 10)
  return { desde: f(new Date(hoy.getTime() - dias * 86_400_000)), hasta: f(new Date(hoy.getTime() + 30 * 86_400_000)) }
}

export const RIESGO_INASISTENCIA = gql`
  query Riesgo($dias: Int!, $limite: Int!) {
    riesgoInasistencia(dias: $dias, limite: $limite) {
      citaId especialidad fechaHora
      riesgo { probabilidad riesgo sintetico versionModelo }
    }
  }
`
