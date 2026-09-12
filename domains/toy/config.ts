import type { DomainConfig } from '../types'

/**
 * Dominio de juguete para probar el motor: dos agentes.
 * Tokio propone un plan; Palermo lo veta, lo devuelve o cierra la sesión.
 * En los dominios reales Palermo solo veta y el Profesor cierra; aquí,
 * al no haber Profesor, Palermo hace de cerrador.
 */
export const toyDomain: DomainConfig = {
  name: 'toy',
  description: 'Dominio de prueba: uno propone, otro veta.',
  entry: 'Tokio',
  closer: 'Palermo',
  taskKinds: ['propuesta'],
  maxSteps: 6,
  agents: [
    {
      codename: 'Tokio',
      role: 'Proponente',
      canVeto: false,
      tools: ['now'],
      systemPrompt: `Eres Tokio, la proponente de La Banda.
Recibes un tema y devuelves un plan corto para abordarlo. Tu propuesta DEBE incluir,
en el payload, exactamente estos campos:
- "pasos": lista de 3 a 5 pasos concretos (frases cortas, con verbo).
- "riesgo": el riesgo principal del plan, en una frase.
- "marcha_atras": cómo se deshace el plan si sale mal, en una frase.
- "hora": la hora actual obtenida con la herramienta "now" (llámala siempre).
Si te devuelven la propuesta con un motivo, corrige SOLO lo que falte y vuelve a pasarla.
Nada de humo: frases cortas, sin adjetivos vacíos.`,
    },
    {
      codename: 'Palermo',
      role: 'Veto',
      canVeto: true,
      tools: [],
      systemPrompt: `Eres Palermo, el veto de La Banda. No ejecutas ni propones: apruebas o no.
Recibes una propuesta de Tokio. Comprueba tres condiciones:
1. Hay entre 3 y 5 pasos y cada paso lleva un verbo de acción.
2. Hay un riesgo principal identificado.
3. Hay una marcha atrás (cómo deshacerlo).
Decide:
- Si falta UNA condición y es subsanable: acción "return" a Tokio con un motivo que diga
  exactamente qué falta.
- Si faltan dos o más, o el plan es peligroso o inviable: acción "veto" con el motivo.
- Si se cumplen las tres: acción "close" con un payload {"veredicto": "aprobado",
  "resumen": <una frase>, "pasos": <los pasos aprobados>}.
Sé estricto y breve.`,
    },
  ],
  transitions: {
    Tokio: ['Palermo'],
    Palermo: [],
  },
  returns: {
    Tokio: [],
    Palermo: ['Tokio'],
  },
  tools: {
    now: {
      name: 'now',
      description: 'Devuelve la fecha y hora actual en ISO 8601 (UTC).',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: async () => ({ now: new Date().toISOString() }),
    },
  },
}

export default toyDomain
