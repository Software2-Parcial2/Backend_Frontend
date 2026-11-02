/**
 * Redaccion de datos sensibles en lo que ve el modelo y en lo que devuelve el agente. Defensa en profundidad: las herramientas ya
 * no devuelven datos de pacientes, pero cualquier campo clinico o identificador personal que aparezca se elimina.
 */
const CLAVES_SENSIBLES = /^(paciente_?id|nombre|nombres|apellidos?|documento|dni|ci|email|correo|telefono|celular|direccion|fecha_?nacimiento|diagnostico|historia|historial_?clinico|receta|alergias|medicacion|observaciones|motivo_?consulta|chat_?id|token|password|secret)$/i;

export function redactar<T>(valor: T): T {
  if (Array.isArray(valor)) return valor.map(redactar) as T;
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>).filter(([k]) => !CLAVES_SENSIBLES.test(k)).map(([k, v]) => [k, redactar(v)]),
    ) as T;
  }
  return valor;
}

/** Enmascara en texto libre correos, telefonos, documentos largos y tokens tipo JWT. */
export function redactarTexto(texto: string): string {
  return texto
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[correo omitido]')
    .replace(/eyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}/g, '[token omitido]')
    .replace(/(?<![\w-])(?!\d{4}-\d{2}-\d{2})\+?\d[\d ()-]{6,}\d(?![\w-])/g, '[numero omitido]');
}
