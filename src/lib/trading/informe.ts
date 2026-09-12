/**
 * El Profesor debe cerrar solo con el informe, pero el modelo a veces devuelve el
 * dossier entero con el informe anidado (a veces `informe` trae el resultado; otras,
 * solo fecha y firma). Se combinan los dos niveles y mandan los campos de arriba.
 */
export function informeFinal(report: unknown): unknown {
  if (!report || typeof report !== 'object') return report
  const { informe, ...top } = report as Record<string, unknown>
  const inner = informe && typeof informe === 'object' ? (informe as Record<string, unknown>) : {}
  return { ...inner, ...top }
}
