/**
 * Contenido de la portada pública de kupeku.com (La Banda), bilingüe ES/EN.
 * La página lee `?lang=en` (por defecto `es`). El panel y el login siguen en español.
 * El español es la fuente de verdad del tipo; el inglés debe tener la misma forma.
 */

export type Lang = 'es' | 'en'

export function getLang(v: string | string[] | undefined): Lang {
  const s = Array.isArray(v) ? v[0] : v
  return s === 'en' ? 'en' : 'es'
}

export interface Principle {
  t: string
  d: string
}
export interface AgentItem {
  name: string
  role: string
  veto?: boolean
}
export interface Example {
  tag: string
  title: string
  body: string
  link?: { label: string; href: string }
}
export interface Tier {
  name: string
  price: string
  note: string
  features: string[]
  cta: string
  highlight?: boolean
}

export interface LandingContent {
  langLabel: string
  nav: { como: string; agentes: string; ejemplos: string; precios: string; acceso: string }
  hero: { eyebrow: string; tagline: string; sub: string; ctaPrimary: string; ctaSecondary: string }
  ques: { title: string; body: string; tags: string[] }
  como: { eyebrow: string; title: string; sub: string; principles: Principle[]; flowLabel: string; flow: string[] }
  modelo: { eyebrow: string; title: string; body: string; chips: string[] }
  agentes: { eyebrow: string; title: string; sub: string; note: string; items: AgentItem[] }
  ejemplos: { eyebrow: string; title: string; sub: string; items: Example[] }
  aplica: { eyebrow: string; title: string; body: string; areas: { area: string; uses: string[] }[]; foot: string }
  precios: { eyebrow: string; title: string; sub: string; tiers: Tier[]; foot: string }
  contacto: {
    eyebrow: string
    title: string
    sub: string
    name: string
    email: string
    message: string
    send: string
    sending: string
    okTitle: string
    okBody: string
    error: string
    privacy: string
  }
  footer: { tagline: string; rights: string; acceso: string }
}

const AGENTS_ES: AgentItem[] = [
  { name: 'Tokio', role: 'Abre: rastrea y fija el encargo.' },
  { name: 'Denver', role: 'Documenta y contrasta el contexto.' },
  { name: 'Estocolmo', role: 'Mide y gradúa.' },
  { name: 'Río', role: 'Redacta y marca los límites.' },
  { name: 'Berlín', role: 'Fija las condiciones exactas.' },
  { name: 'Lisboa', role: 'Comprueba y devuelve si algo no cuadra.' },
  { name: 'Nairobi', role: 'Resume todo en una página.' },
  { name: 'Palermo', role: 'Veta. Sin su visto bueno, no hay salida.', veto: true },
  { name: 'Helsinki', role: 'Registra cada versión y decisión.' },
  { name: 'Profesor', role: 'Cierra y emite el informe.' },
]

const AGENTS_EN: AgentItem[] = [
  { name: 'Tokio', role: 'Opens: scopes and sets the brief.' },
  { name: 'Denver', role: 'Documents and cross-checks the context.' },
  { name: 'Estocolmo', role: 'Measures and grades.' },
  { name: 'Río', role: 'Drafts and marks the limits.' },
  { name: 'Berlín', role: 'Sets the exact conditions.' },
  { name: 'Lisboa', role: 'Checks, and sends work back if it does not add up.' },
  { name: 'Nairobi', role: 'Boils it all down to one page.' },
  { name: 'Palermo', role: 'Vetoes. Nothing ships without the go-ahead.', veto: true },
  { name: 'Helsinki', role: 'Logs every version and decision.' },
  { name: 'Profesor', role: 'Closes and issues the report.' },
]

export const CONTENT: Record<Lang, LandingContent> = {
  es: {
    langLabel: 'EN',
    nav: { como: 'Cómo trabaja', agentes: 'Los agentes', ejemplos: 'Ejemplos', precios: 'Precios', acceso: 'Acceso al panel' },
    hero: {
      eyebrow: 'Motor de agentes',
      tagline: 'Diez agentes con roles fijos, veto obligatorio y traspasos trazables.',
      sub: 'Un equipo de IA que trabaja con método: cada uno hace una cosa, uno veta y todo queda registrado. No es un chatbot; es una cadena de montaje con control de calidad.',
      ctaPrimary: 'Cómo trabaja',
      ctaSecondary: 'Acceso al panel',
    },
    ques: {
      title: 'No es un chatbot. Es un método.',
      body: 'La Banda orquesta diez agentes especializados que se pasan el trabajo en cadena. El método —el cómo— es fijo; el dominio —el qué— se configura en un archivo. Hoy corre tres bandas distintas con el mismo motor: un corpus de español, una mesa de trading y una revisión editorial.',
      tags: ['Roles fijos', 'Veto obligatorio', 'Traspasos trazables', 'Revisión humana'],
    },
    como: {
      eyebrow: 'Cómo trabaja',
      title: 'Seis reglas que no se rompen',
      sub: 'El método es el producto. Estas seis reglas gobiernan cualquier banda, sea cual sea el trabajo.',
      principles: [
        { t: 'Un trabajo por agente', d: 'Cada agente tiene un cometido y unas herramientas cerradas. El que busca no aprueba; el que aprueba no ejecuta.' },
        { t: 'Veto obligatorio', d: 'Ninguna acción final se hace sin el visto bueno explícito de Palermo.' },
        { t: 'Ficheros, no memoria', d: 'Los agentes no comparten contexto. Se comunican por traspasos con remitente, carga y hora.' },
        { t: 'Devolución posible', d: 'Cualquier agente puede devolver el trabajo al anterior con un motivo. Para eso está Lisboa.' },
        { t: 'El Profesor cierra', d: 'Lee la cadena entera y emite el informe final. No decide nada por el camino.' },
        { t: 'Dominio en configuración', d: 'Cambiar de oficio es cambiar un archivo, no el motor. Trading, corpus o editorial: el mismo núcleo.' },
      ],
      flowLabel: 'El recorrido de una sesión',
      flow: ['Encargo', 'Cadena de agentes', 'Veto de Palermo', 'Informe del Profesor'],
    },
    modelo: {
      eyebrow: 'Sin cerrojo de proveedor',
      title: 'El modelo de IA lo eliges tú',
      body: 'La Banda no depende de un solo proveedor. Cada agente puede usar el modelo que quieras —Claude, GLM/z.ai u otros compatibles— y, si uno falla o tarda, reintenta con el siguiente. Controlas el coste y evitas quedar atado a una sola API.',
      chips: ['Claude (Anthropic)', 'GLM · z.ai', 'Modelo por agente', 'Failover automático'],
    },
    agentes: {
      eyebrow: 'La banda',
      title: 'Diez agentes, una cadena',
      sub: 'Los mismos diez personajes cambian de oficio según el trabajo. Dos papeles no se mueven: Palermo veta y el Profesor cierra.',
      note: 'Nombres fijos, funciones que se adaptan a cada dominio.',
      items: AGENTS_ES,
    },
    ejemplos: {
      eyebrow: 'En producción',
      title: 'Tres bandas, un mismo motor',
      sub: 'Tres procesos reales, distintos entre sí, resueltos con la misma cadena.',
      items: [
        {
          tag: 'Enseñanza · ELE',
          title: 'Corpus Granada',
          body: 'Produce y anota muestras de español niveladas por el Plan Curricular del Instituto Cervantes (A1–C2), situadas en Granada. Palermo veta lo flojo; una persona revisa antes de publicar.',
          link: { label: 'clinicacultural.com/corpus', href: 'https://www.clinicacultural.com/corpus' },
        },
        {
          tag: 'Finanzas · simulación',
          title: 'Mesa de trading',
          body: 'Analiza BTC/USD y ETH/USD con velas horarias y decide operaciones sobre una cartera ficticia. Detecta la señal, calcula el tamaño, fija la invalidación y no ejecuta nada sin veto.',
        },
        {
          tag: 'Editorial',
          title: 'Olvidos de Granada',
          body: 'Revisa manuscritos contra la hoja de estilo y emite objeciones numeradas y un veredicto —publicable, con cambios o rechazado—. Señala, no reescribe.',
        },
      ],
    },
    aplica: {
      eyebrow: 'A qué más se aplica',
      title: 'Un método para toda la empresa',
      body: 'La Banda no es una herramienta suelta: es una capa de método que entra en cualquier proceso con pasos, criterios y un «esto sí / esto no». Aplicada departamento a departamento, es una vía hacia la digitalización integral —con control de calidad y trazabilidad en cada paso—.',
      areas: [
        { area: 'Legal y cumplimiento', uses: ['Revisión de contratos y cláusulas', 'Cumplimiento normativo y RGPD', 'Análisis de pliegos y licitaciones'] },
        { area: 'Finanzas y administración', uses: ['Control y conciliación de facturas', 'Informes financieros y de gestión', 'Due diligence de operaciones'] },
        { area: 'Comercial y clientes', uses: ['Cualificación de leads y oportunidades', 'Propuestas y presupuestos', 'Calidad de la atención al cliente'] },
        { area: 'Personas y RRHH', uses: ['Cribado de candidaturas', 'Onboarding y documentación interna', 'Políticas internas y su cumplimiento'] },
        { area: 'Operaciones y calidad', uses: ['Auditorías y listas de control', 'Control de calidad de procesos', 'Triaje y gestión de incidencias'] },
        { area: 'Datos y conocimiento', uses: ['Validación y limpieza de datos', 'Síntesis documental y research', 'Documentación técnica y base de conocimiento'] },
      ],
      foot: '¿No ves tu proceso? Cuéntanoslo: casi todo flujo de revisión y decisión encaja.',
    },
    precios: {
      eyebrow: 'Precios',
      title: 'Empieza con un piloto, crece si funciona',
      sub: 'Cada banda se configura a mano para tu proceso. Por eso empezamos por un piloto cerrado y, si convence, pasa a operación.',
      tiers: [
        {
          name: 'Piloto',
          price: 'desde 900 €',
          note: 'pago único',
          features: ['Análisis de tu proceso', 'Una banda configurada a medida', 'Un primer lote real', 'Informe de trazabilidad'],
          cta: 'Empezar un piloto',
        },
        {
          name: 'Operación',
          price: 'desde 200 €',
          note: 'al mes, por banda',
          features: ['Ejecución programada', 'Panel y traspasos trazables', 'Ajustes de prompts y soporte', 'Coste de IA incluido hasta un volumen'],
          cta: 'Hablar de operación',
          highlight: true,
        },
        {
          name: 'A medida',
          price: 'Presupuesto',
          note: 'empresa',
          features: ['Varias bandas / dominios', 'Integración por API con tus sistemas', 'SLA y prioridad', 'Formación del equipo'],
          cta: 'Pedir presupuesto',
        },
      ],
      foot: 'Precios orientativos. El coste depende del proceso y del volumen; lo cerramos contigo.',
    },
    contacto: {
      eyebrow: 'Más información',
      title: 'Cuéntanos tu proceso',
      sub: 'Escríbenos qué tarea repites y te decimos si cabe una banda, cómo la montaríamos y cuánto costaría.',
      name: 'Nombre',
      email: 'Correo',
      message: 'Tu proceso o pregunta',
      send: 'Enviar',
      sending: 'Enviando…',
      okTitle: 'Recibido. Gracias.',
      okBody: 'Te respondemos en breve al correo que nos has dejado.',
      error: 'No se pudo enviar. Inténtalo de nuevo en un momento.',
      privacy: 'Usamos tu correo solo para responderte.',
    },
    footer: { tagline: 'La Banda · un motor de agentes con método.', rights: 'Todos los derechos reservados.', acceso: 'Acceso al panel' },
  },

  en: {
    langLabel: 'ES',
    nav: { como: 'How it works', agentes: 'The agents', ejemplos: 'Examples', precios: 'Pricing', acceso: 'Panel login' },
    hero: {
      eyebrow: 'Agent engine',
      tagline: 'Ten agents with fixed roles, a mandatory veto and traceable hand-offs.',
      sub: 'An AI team that works with method: each does one job, one vetoes, and everything is logged. Not a chatbot — an assembly line with quality control.',
      ctaPrimary: 'How it works',
      ctaSecondary: 'Panel login',
    },
    ques: {
      title: 'Not a chatbot. A method.',
      body: 'La Banda orchestrates ten specialised agents that pass work down a chain. The method — the how — is fixed; the domain — the what — lives in a config file. Today the same engine runs three different bands: a Spanish corpus, a trading desk and an editorial review.',
      tags: ['Fixed roles', 'Mandatory veto', 'Traceable hand-offs', 'Human review'],
    },
    como: {
      eyebrow: 'How it works',
      title: 'Six rules that never break',
      sub: 'The method is the product. These six rules govern any band, whatever the job.',
      principles: [
        { t: 'One job per agent', d: 'Each agent has one task and a closed set of tools. The one who searches does not approve; the one who approves does not execute.' },
        { t: 'Mandatory veto', d: 'No final action happens without Palermo’s explicit sign-off.' },
        { t: 'Files, not memory', d: 'Agents share no context. They talk only through hand-offs, each with sender, payload and timestamp.' },
        { t: 'Sending back is allowed', d: 'Any agent can return the work to a previous one with a reason. That is what Lisboa is for.' },
        { t: 'The Profesor closes', d: 'Reads the whole chain and issues the final report. Decides nothing along the way.' },
        { t: 'Domain in config', d: 'Switching trades means switching a file, not the engine. Trading, corpus or editorial: same core.' },
      ],
      flowLabel: 'The path of a session',
      flow: ['Brief', 'Agent chain', 'Palermo’s veto', 'Profesor’s report'],
    },
    modelo: {
      eyebrow: 'No provider lock-in',
      title: 'You choose the AI model',
      body: 'La Banda does not depend on a single provider. Each agent can use whatever model you want — Claude, GLM/z.ai or other compatible ones — and if one fails or stalls, it retries with the next. You control cost and avoid being tied to one API.',
      chips: ['Claude (Anthropic)', 'GLM · z.ai', 'Model per agent', 'Automatic failover'],
    },
    agentes: {
      eyebrow: 'The band',
      title: 'Ten agents, one chain',
      sub: 'The same ten characters change trade depending on the job. Two roles never move: Palermo vetoes and the Profesor closes.',
      note: 'Fixed names, functions that adapt to each domain.',
      items: AGENTS_EN,
    },
    ejemplos: {
      eyebrow: 'In production',
      title: 'Three bands, one engine',
      sub: 'Three real, very different processes, solved with the same chain.',
      items: [
        {
          tag: 'Teaching · Spanish',
          title: 'Corpus Granada',
          body: 'Produces and annotates Spanish samples graded by the Instituto Cervantes curriculum (A1–C2), set in Granada. Palermo vetoes weak work; a human reviews before publishing.',
          link: { label: 'clinicacultural.com/corpus', href: 'https://www.clinicacultural.com/corpus' },
        },
        {
          tag: 'Finance · simulation',
          title: 'Trading desk',
          body: 'Analyses BTC/USD and ETH/USD on hourly candles and decides trades on a fictional portfolio. Spots the signal, sizes the position, sets the invalidation — and executes nothing without a veto.',
        },
        {
          tag: 'Editorial',
          title: 'Olvidos de Granada',
          body: 'Reviews manuscripts against the style guide and issues numbered objections plus a verdict — publishable, with changes, or rejected. It flags, it does not rewrite.',
        },
      ],
    },
    aplica: {
      eyebrow: 'Where else it fits',
      title: 'A method for the whole company',
      body: 'La Banda is not a standalone tool: it is a layer of method that fits any process with steps, criteria and a clear yes/no. Applied department by department, it is a path to end-to-end digitalization — with quality control and traceability at every step.',
      areas: [
        { area: 'Legal & compliance', uses: ['Contract and clause review', 'Regulatory compliance and GDPR', 'Tender and bid analysis'] },
        { area: 'Finance & admin', uses: ['Invoice control and reconciliation', 'Financial and management reports', 'Deal due diligence'] },
        { area: 'Sales & customers', uses: ['Lead and opportunity qualification', 'Proposals and quotes', 'Customer support quality'] },
        { area: 'People & HR', uses: ['CV and application screening', 'Onboarding and internal docs', 'Internal policies and compliance'] },
        { area: 'Operations & quality', uses: ['Audits and checklists', 'Process quality control', 'Incident triage and handling'] },
        { area: 'Data & knowledge', uses: ['Data validation and cleaning', 'Document synthesis and research', 'Technical docs and knowledge base'] },
      ],
      foot: 'Not seeing your process? Tell us: almost any review-and-decision flow fits.',
    },
    precios: {
      eyebrow: 'Pricing',
      title: 'Start with a pilot, grow if it works',
      sub: 'Each band is configured by hand for your process. So we start with a fixed pilot and, if it convinces you, move to operation.',
      tiers: [
        {
          name: 'Pilot',
          price: 'from €900',
          note: 'one-off',
          features: ['Analysis of your process', 'A band configured to measure', 'A first real batch', 'Traceability report'],
          cta: 'Start a pilot',
        },
        {
          name: 'Operation',
          price: 'from €200',
          note: 'per month, per band',
          features: ['Scheduled runs', 'Panel and traceable hand-offs', 'Prompt tuning and support', 'AI cost included up to a volume'],
          cta: 'Talk about operation',
          highlight: true,
        },
        {
          name: 'Custom',
          price: 'Quote',
          note: 'enterprise',
          features: ['Several bands / domains', 'API integration with your systems', 'SLA and priority', 'Team training'],
          cta: 'Request a quote',
        },
      ],
      foot: 'Indicative prices. Cost depends on the process and volume; we close it with you.',
    },
    contacto: {
      eyebrow: 'More information',
      title: 'Tell us about your process',
      sub: 'Write to us about the task you repeat and we will tell you whether a band fits, how we would build it and what it would cost.',
      name: 'Name',
      email: 'Email',
      message: 'Your process or question',
      send: 'Send',
      sending: 'Sending…',
      okTitle: 'Got it. Thank you.',
      okBody: 'We will reply shortly to the email you left us.',
      error: 'Could not send. Please try again in a moment.',
      privacy: 'We use your email only to reply to you.',
    },
    footer: { tagline: 'La Banda · an agent engine with method.', rights: 'All rights reserved.', acceso: 'Panel login' },
  },
}
