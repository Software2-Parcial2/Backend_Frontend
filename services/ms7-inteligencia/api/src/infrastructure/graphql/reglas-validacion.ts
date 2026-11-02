import { GraphQLError, Kind, type FragmentDefinitionNode, type SelectionSetNode, type ValidationContext, type ASTVisitor } from 'graphql';

export interface Limites {
  maxProfundidad: number;
  maxComplejidad: number;
}

/**
 * Regla de validacion que limita la profundidad y la complejidad de una operacion ANTES de ejecutarla.
 * Profundidad = niveles de anidamiento de campos; complejidad = campos totales (alias y fragmentos expandidos, de modo que
 * repetir un campo con alias o por fragmentos cuenta cada vez). Los fragmentos ciclicos los rechaza ya la validacion estandar.
 */
export function limitarConsulta({ maxProfundidad, maxComplejidad }: Limites) {
  return (contexto: ValidationContext): ASTVisitor => {
    const fragmentos = new Map<string, FragmentDefinitionNode>();
    for (const def of contexto.getDocument().definitions) if (def.kind === Kind.FRAGMENT_DEFINITION) fragmentos.set(def.name.value, def);

    const medir = (set: SelectionSetNode, nivel: number, visitados: Set<string>): { profundidad: number; campos: number } => {
      let profundidad = nivel;
      let campos = 0;
      for (const sel of set.selections) {
        if (sel.kind === Kind.FIELD) {
          if (sel.name.value.startsWith('__')) continue;
          campos++;
          const hijo = sel.selectionSet ? medir(sel.selectionSet, nivel + 1, visitados) : { profundidad: nivel + 1, campos: 0 };
          profundidad = Math.max(profundidad, hijo.profundidad);
          campos += hijo.campos;
        } else {
          const set2 = sel.kind === Kind.INLINE_FRAGMENT ? sel.selectionSet : fragmentos.get(sel.name.value)?.selectionSet;
          if (sel.kind === Kind.FRAGMENT_SPREAD) {
            if (visitados.has(sel.name.value)) continue;
            visitados = new Set(visitados).add(sel.name.value);
          }
          if (set2) {
            const hijo = medir(set2, nivel, visitados);
            profundidad = Math.max(profundidad, hijo.profundidad);
            campos += hijo.campos;
          }
        }
      }
      return { profundidad, campos };
    };

    return {
      OperationDefinition(op) {
        const { profundidad, campos } = medir(op.selectionSet, 0, new Set());
        if (profundidad > maxProfundidad) {
          contexto.reportError(new GraphQLError(`La consulta es demasiado profunda (${profundidad} > ${maxProfundidad})`, { nodes: op, extensions: { code: 'CONSULTA_DEMASIADO_PROFUNDA' } }));
        }
        if (campos > maxComplejidad) {
          contexto.reportError(new GraphQLError(`La consulta es demasiado compleja (${campos} campos > ${maxComplejidad})`, { nodes: op, extensions: { code: 'CONSULTA_DEMASIADO_COMPLEJA' } }));
        }
      },
    };
  };
}
