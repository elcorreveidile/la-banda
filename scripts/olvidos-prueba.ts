/**
 * Prueba de la fase 3 (brief §8.3): envía a la redacción tres textos ya
 * publicados en olvidosdegranada.es y compara el veredicto con lo decidido
 * entonces (los tres se publicaron: el veredicto esperado es «publicable»).
 *
 * Uso (en local, con .env.local con DATABASE_URL y ZAI_API_KEY):
 *   npx tsx --env-file=.env.local scripts/olvidos-prueba.ts            # envía y evalúa en línea
 *   npx tsx --env-file=.env.local scripts/olvidos-prueba.ts --comparar  # solo imprime el resultado guardado
 *
 * Corre el orquestador EN LÍNEA (sin ticks): tarda varios minutos por texto.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { db } from '../src/db'
import { sessions } from '../src/db/schema'
import { manuscripts, versions } from '../src/db/olvidos'
import { engine } from '../src/engine'
import { getDomain } from '../domains'
import { createManuscript, objectionsForSession, setVersionSession } from '../src/lib/olvidos/manuscripts'

const DIR = join(process.cwd(), 'docs', 'olvidos-prueba')

interface Texto {
  slug: string
  title: string
  byline: string
  section: string
  url: string
  decision: string
  body: string
}

function parse(file: string): Texto {
  const raw = readFileSync(join(DIR, file), 'utf8')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/)
  if (!m) throw new Error(`sin frontmatter: ${file}`)
  const meta: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, '')
  }
  return { slug: file.replace(/\.md$/, ''), title: meta.title, byline: meta.byline, section: meta.section, url: meta.url, decision: meta.decision, body: m[2].trim() }
}

async function comparar() {
  const rows = await db.select().from(manuscripts)
  for (const t of readdirSync(DIR).filter((f) => f.endsWith('.md')).map(parse)) {
    const m = rows.find((r) => r.title === t.title)
    if (!m) {
      console.log(`\n${t.title}\n  sin enviar`)
      continue
    }
    const [v] = await db.select().from(versions).where(eq(versions.manuscriptId, m.id))
    const [s] = v?.sessionId ? await db.select().from(sessions).where(eq(sessions.id, v.sessionId)) : []
    const objs = v?.sessionId ? await objectionsForSession(v.sessionId) : []
    const report = (s?.finalReport ?? {}) as { veredicto?: string; informe?: string }
    console.log(`\n${t.title}`)
    console.log(`  decidido entonces: ${t.decision} · La Banda: ${report.veredicto ?? s?.status ?? '—'} (registro Helsinki: ${v?.decision ?? '—'})`)
    console.log(`  objeciones: ${objs.filter((o) => o.severity === 'mayor').length} mayores, ${objs.filter((o) => o.severity === 'menor').length} menores`)
    for (const o of objs) console.log(`   ${o.number}. [${o.severity}] ${o.agent} ${o.location ?? ''}: ${o.text}`)
    if (report.informe) console.log(`  informe:\n    ${String(report.informe).replace(/\n/g, '\n    ')}`)
  }
}

async function enviar() {
  const domain = getDomain('olvidos')
  for (const t of readdirSync(DIR).filter((f) => f.endsWith('.md')).map(parse)) {
    console.log(`\n→ ${t.title} (${t.section}, ${t.body.split(/\s+/).length} palabras)`)
    const { manuscript, version } = await createManuscript({ title: t.title, byline: t.byline, section: t.section, format: 'md', sourceName: t.url, text: t.body, createdBy: 'scripts/olvidos-prueba' })
    const { session } = await engine.openSession(domain, {
      kind: 'manuscrito',
      createdBy: 'scripts/olvidos-prueba',
      payload: { manuscriptId: manuscript.id, versionId: version.id, titulo: t.title, firma: t.byline, seccion: t.section, version: 1, palabras: version.wordCount },
    })
    await setVersionSession(version.id, session.id)
    const final = await engine.runSession(domain, session.id)
    console.log(`  sesión ${session.id}: ${final.status}`)
  }
  await comparar()
}

const modo = process.argv.includes('--comparar') ? comparar : enviar
modo()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
