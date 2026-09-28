/**
 * Ficha de HECHOS de WordNext para los artículos del dominio marketing. Es la única fuente de
 * cifras y afirmaciones sobre WordNext: Palermo veta cualquier precio, función o dato de
 * WordNext que no esté aquí. Se mantiene A MANO al cambiar precios o funciones (fuente:
 * CLAUDE.md y src/lib/pricing.ts / src/lib/memberships.ts de wp-next-starter; los precios de
 * membresía deben coincidir también con el escaparate). Última revisión: 2026-09-28.
 */

export const HECHOS_REVISADOS = '2026-09-28'

export const HECHOS_WORDNEXT = {
  queEs:
    'WordNext es una plataforma y estudio con sede en Estepona (Málaga, España). Reconstruye webs WordPress con Next.js conservando diseño, URLs y posicionamiento, y ofrece una plataforma multi-web (app.wordnext.tech) donde cada negocio edita su web por bloques, sin plugins.',
  enlaces: {
    escaparate: 'https://www.wordnext.tech',
    escaparateEn: 'https://www.wordnext.tech/en',
    comprobar: 'https://app.wordnext.tech/comprobar',
    configurar: 'https://app.wordnext.tech/configurar',
    crear: 'https://app.wordnext.tech/crear',
    guardian: 'https://www.wordnext.tech/guardian',
    docencia: 'https://www.wordnext.tech/docencia',
    blog: 'https://blog.wordnext.tech',
  },
  membresias: [
    { plan: 'Gratis', precio: '0 €/mes', incluye: '3 páginas, blog sin límite de entradas, distintivo «Hecho con WordNext»' },
    { plan: 'Esencial', precio: '19 €/mes', incluye: 'páginas sin límite, marca propia (sin distintivo), analítica sin cookies, 1 dominio propio' },
    { plan: 'Negocio', precio: '49 €/mes', incluye: 'lo de Esencial + reservas con agenda, cuestionarios, asistente de IA en el editor, 2 dominios' },
    { plan: 'Crecimiento', precio: '99 €/mes', incluye: 'lo de Negocio + cobros con Stripe Connect (productos, cursos, señal de reservas) con 5 % de comisión por venta, 5 dominios' },
    { plan: 'Escala', precio: '149 €/mes', incluye: 'lo de Crecimiento sin comisión por venta, 10 dominios' },
    { plan: 'Docente', precio: '29 €/mes', incluye: 'web + cursos con área de alumno + actividades autocorregidas, 5 % de comisión' },
    { plan: 'Academia', precio: '69 €/mes', incluye: 'varios profesores (5 incluidos), cada uno ve solo lo suyo; 0 % de comisión; 3 dominios' },
  ],
  extras: ['Dominio extra: 5 €/mes', 'Asistente de IA (Docente/Academia): 10 €/mes', 'Tutorías con agenda (Docente/Academia): 8 €/mes', 'Profesor extra o web de profesor extra (Academia): 8 €/mes'],
  proyectos: [
    { paquete: 'Exprés', desde: '600 €', que: 'landing o web de 1 página, en 48 h' },
    { paquete: 'Esencial', desde: '1.900 €', que: 'web pequeña + blog' },
    { paquete: 'Pro', desde: '3.900 €', que: 'web corporativa multipágina + panel' },
    { paquete: 'A medida', desde: '7.900 €', que: 'multimarca, tienda o integraciones' },
  ],
  proyectosNota: 'Precio cerrado y público en app.wordnext.tech/configurar (el cliente elige paquete y extras y ve el total); sin llamada previa para saberlo.',
  funciones: [
    'Editor por bloques con vista previa en vivo; menú visual; dominio propio con certificado automático',
    'Migrador de WordPress (API REST o export WXR) y de Squarespace por HTML público; comprobador gratuito en app.wordnext.tech/comprobar',
    'Blog con listado paginado, buscador y artículos bilingües enlazados',
    'Newsletter con doble opt-in y correo de bienvenida automático',
    'Reservas con agenda y señal por Stripe; cancelación por enlace',
    'Cursos con módulos, lecciones, progreso, entregas corregidas por el profesor y certificados en PDF',
    'Cobros con Stripe Connect: el dinero va a la cuenta del negocio',
    'Analítica propia sin cookies (páginas vistas y visitantes únicos por hash diario)',
    'Modo guiado de cinco pasos para personalizar la web de muestra',
  ],
  guardian: [
    'WordNext Guardian: cada web es legible por asistentes de IA (manifiesto /.well-known/agent.json y servidor MCP) con solo lo que ya es público',
    'Firewall agéntico: un carril rápido determinista (sin IA) decide permitir, bloquear o cuarentena en cada petición de un agente, y la IP nunca se guarda en claro (solo un hash diario)',
    'Las peticiones sospechosas por contenido (inyección de prompt, intento de sacar datos) las juzga después un equipo de agentes (La Banda); si no llega a veredicto, se bloquea (fail-closed)',
    'Lo que se juzga como ataque se aprende como regla para todas las webs durante 30 días',
    'Una IA puede reservar o preparar una compra en nombre de una persona solo si el negocio lo activa, y siempre con confirmación de la persona o con un mandato firmado por ella; el precio lo calcula siempre el servidor',
  ],
  noDecir: [
    'No inventar clientes, testimonios, cifras de tráfico, rankings ni porcentajes de mejora que no estén aquí',
    'No prometer posiciones en Google ni que las IAs vayan a citar la web',
    'No dar precios de competidores salvo que vengan de una fuente buscada y citada con su fecha',
    'No decir que WordNext tiene app móvil, comunidad de alumnos, cupones ni pagos a plazos (aún no existen)',
  ],
} as const

/** La ficha en texto, para la herramienta leerHechos. */
export function fichaDeHechos(): { revisada: string; ficha: typeof HECHOS_WORDNEXT } {
  return { revisada: HECHOS_REVISADOS, ficha: HECHOS_WORDNEXT }
}
