/**
 * Configuración del dominio política (Con-textos 29N, sección de Olvidos de Granada).
 * Decidido con Javier: tres entregas diarias (mañana 09:00, tarde 15:00, noche 21:00, hora de Madrid)
 * más extras (madrugada, algo que ocurre); La Banda prepara y VERIFICA, una persona aprueba en el
 * sondeo; la noticia que llega sin veredicto con fuentes no se ve nunca; las noticias salen de La
 * Banda, de Javier y de visitantes registrados (los envíos se verifican igual).
 */

import { hayClavePara, modeloEfectivo } from '@/engine/provider'

export const POLITICA_DOMAIN = 'politica'

/** Primer y último día (Madrid) con ediciones: de la convocatoria a las elecciones. */
export function rangoEdiciones(env: Record<string, string | undefined> = process.env): { desde: string; hasta: string } {
  const ok = (v: string | undefined, def: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : def)
  return { desde: ok(env.POLITICA_DESDE, '2026-10-06'), hasta: ok(env.POLITICA_HASTA, '2026-11-29') }
}

/** Veda de sondeos (art. 69.7 LOREG) y cierre de urnas: mismos instantes que el sondeo. */
export const VEDA_INICIO = new Date('2026-11-23T23:00:00Z')
export const CIERRE_URNAS = new Date('2026-11-29T19:00:00Z')
export const enVeda = (t: Date) => t >= VEDA_INICIO && t < CIERRE_URNAS

/**
 * Modelos. Mismo patrón que marketing: sin prefijo es `anthropic:`, y mientras `ANTHROPIC_ACTIVO`
 * no valga 1 todo pasa a z.ai (`modeloEfectivo`). Las mesas, Sonnet 5; Río (redacta) y Palermo
 * (el que aprueba o veta), los fuertes.
 */
function conProveedor(v: string | undefined, def: string, env: Record<string, string | undefined>): string {
  const m = v?.trim() || def
  return modeloEfectivo(m.includes(':') ? m : `anthropic:${m}`, env)
}
export const modeloMesa = (env: Record<string, string | undefined> = process.env) => conProveedor(env.POLITICA_MODELO_MESA, 'claude-sonnet-5', env)
export const modeloRedactor = (env: Record<string, string | undefined> = process.env) => conProveedor(env.POLITICA_MODELO_REDACTOR, 'claude-opus-5-5', env)
export const modeloJuez = (env: Record<string, string | undefined> = process.env) => conProveedor(env.POLITICA_MODELO_JUEZ, 'claude-opus-5-5', env)

export function modelosDisponibles(env: Record<string, string | undefined> = process.env): boolean {
  return [modeloMesa(env), modeloRedactor(env), modeloJuez(env)].every((m) => hayClavePara(m, env))
}

/** Mesa colgada: se abandona pasado este tiempo (la bomba ya reintenta pasos). */
export const POLITICA_SESION_MAX_MS = 3 * 60 * 60 * 1000
/** Retención de la traza de sesiones terminadas (la traza no lleva datos de personas; 90 días). */
export const POLITICA_TRAZA_MS = 90 * 24 * 60 * 60 * 1000

/** Línea editorial de Con-textos 29N: la leen todos los agentes en leerEncargo. */
export const LINEA_EDITORIAL = {
  publico: 'lectores de Con-textos, la sección de Olvidos de Granada de especiales de actualidad con contexto: gente que quiere entender, no que le den la razón',
  principios: [
    'Hecho e interpretación, siempre separados y marcados. La interpretación es breve, prudente y se presenta como lectura, nunca como dato.',
    'Mismo rasero para todos los partidos y personas: mismos criterios, mismo tono, mismo espacio. Nada de adjetivos que valoren, ni siquiera suaves.',
    'La fuente primaria primero (BOE, Diario de Sesiones, comunicado oficial, grabación del acto) y después la prensa que la cuenta. Una cita solo entra si se puede ver u oír su origen.',
    'Un hecho se da por verificado con la fuente primaria o con al menos dos fuentes independientes entre sí (no dos medios que copian la misma agencia). Si no hay ninguna de las dos, NO entra como hecho: o se descarta o se cuenta como «circula, sin confirmar» con ese veredicto.',
    'Nunca se afirma nada de personas privadas. De personajes públicos, solo lo documentado y relacionado con su cargo.',
    'Sin recomendaciones de voto, sin pronósticos de escaños ni de resultados, sin proyecciones propias.',
    'Encuestas: solo de empresas con ficha técnica (quién la encarga, trabajo de campo, muestra, margen), con su fecha, y NUNCA como pronóstico. Durante la veda (del 24-nov a las 00:00 al cierre de urnas del 29-nov) no se citan encuestas ni sondeos, ni los de esta web: se explica el contexto sin cifras de sondeos.',
    'El sondeo ciudadano de esta web NO es una encuesta científica: no se usa para afirmar nada sobre la opinión de los españoles.',
    'Imágenes, audios y capturas sin origen comprobable son «sin pruebas»: se explica qué se sabe de su procedencia y qué no.',
  ],
  cierre:
    'Cierra con una línea breve «Qué vigilar» (lo que puede cambiar la historia en las próximas horas) cuando proceda, sin adivinar el resultado. Sin llamadas a votar.',
}
