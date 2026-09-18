import type { Metadata } from 'next'
import Link from 'next/link'
import Logo from '@/components/Logo'
import { AgentAvatar } from '@/components/AgentAvatar'
import ContactForm from '@/components/landing/ContactForm'
import { CONTENT, getLang, type Lang } from '@/lib/landing/content'

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const lang = getLang((await searchParams).lang)
  const desc =
    lang === 'en'
      ? 'La Banda: an agent engine. Ten agents with fixed roles, a mandatory veto and traceable hand-offs. Not a chatbot — a method.'
      : 'La Banda: un motor de agentes. Diez agentes con roles fijos, veto obligatorio y traspasos trazables. No es un chatbot; es un método.'
  return {
    title: 'La Banda — motor de agentes',
    description: desc,
    robots: { index: true, follow: true },
    openGraph: { title: 'La Banda — motor de agentes', description: desc, type: 'website' },
  }
}

const CHAIN_COLORS = ['#D84C4C', '#D4A574', '#5A8C6E', '#2C3E50']

function ChainDots() {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span
            className="block h-2.5 w-2.5 rounded-full"
            style={{ background: i === 9 ? '#fbbf24' : CHAIN_COLORS[i % 4], opacity: i === 9 ? 1 : 0.9 }}
          />
          {i < 9 && <span className="block h-px w-4 bg-stone-300" />}
        </span>
      ))}
    </div>
  )
}

export default async function Home({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang: Lang = getLang((await searchParams).lang)
  const t = CONTENT[lang]
  const other = lang === 'es' ? '/?lang=en' : '/'
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || undefined

  return (
    <div className="overflow-x-clip font-sans text-stone-800">
      {/* barra superior */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-[#f7f5f1]/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <Link href={lang === 'es' ? '/' : '/?lang=en'} className="flex min-w-0 items-center gap-2.5">
            <Logo className="h-8 w-8 flex-none" />
            <span className="font-mono text-base font-bold tracking-tight text-stone-900 sm:text-lg">La Banda</span>
          </Link>
          <nav className="hidden items-center gap-6 font-mono text-sm text-stone-600 md:flex">
            <a href="#como" className="hover:text-stone-900">{t.nav.como}</a>
            <a href="#agentes" className="hover:text-stone-900">{t.nav.agentes}</a>
            <a href="#ejemplos" className="hover:text-stone-900">{t.nav.ejemplos}</a>
            <a href="#precios" className="hover:text-stone-900">{t.nav.precios}</a>
          </nav>
          <div className="flex flex-none items-center gap-3">
            <a href={other} className="font-mono text-sm text-stone-500 hover:text-stone-900" aria-label="language">{t.langLabel}</a>
            <Link href="/login" className="whitespace-nowrap rounded-lg bg-stone-900 px-3.5 py-2 font-mono text-sm text-white hover:bg-stone-700">
              <span className="sm:hidden">Panel</span>
              <span className="hidden sm:inline">{t.nav.acceso}</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5">
        {/* hero */}
        <section className="grid gap-10 py-16 md:grid-cols-[1.1fr_0.9fr] md:items-center md:py-24">
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-amber-700">{t.hero.eyebrow}</p>
            <h1 className="mt-4 font-sans text-4xl font-bold leading-[1.08] tracking-tight text-stone-900 md:text-5xl">
              {t.hero.tagline}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-stone-600">{t.hero.sub}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#como" className="rounded-lg bg-stone-900 px-6 py-3 font-sans font-semibold text-white hover:bg-stone-700">{t.hero.ctaPrimary}</a>
              <Link href="/login" className="rounded-lg border border-stone-300 px-6 py-3 font-sans font-semibold text-stone-800 hover:border-stone-900">{t.hero.ctaSecondary}</Link>
            </div>
          </div>
          <div className="min-w-0 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-mono text-xs uppercase tracking-wider text-stone-400">corpus · trading · olvidos</span>
              <Logo className="h-6 w-6" />
            </div>
            <div className="mt-6 flex flex-col gap-4">
              <ChainDots />
              <p className="font-mono text-xs text-stone-500">Tokio → … → Palermo <span className="text-amber-700">(veto)</span> → Profesor</p>
              <div className="grid grid-cols-2 gap-2 pt-2">
                {t.como.flow.map((f, i) => (
                  <div key={i} className="rounded-lg border border-stone-200 bg-[#f7f5f1] px-3 py-2 font-mono text-xs text-stone-700">
                    <span className="text-stone-400">{i + 1}.</span> {f}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* qué es */}
        <section className="border-t border-stone-200 py-16">
          <h2 className="max-w-3xl font-sans text-3xl font-bold tracking-tight text-stone-900">{t.ques.title}</h2>
          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-stone-600">{t.ques.body}</p>
          <div className="mt-7 flex flex-wrap gap-2.5">
            {t.ques.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-stone-300 bg-white px-4 py-1.5 font-mono text-sm text-stone-700">{tag}</span>
            ))}
          </div>
        </section>

        {/* cómo trabaja */}
        <section id="como" className="scroll-mt-20 border-t border-stone-200 py-16">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-amber-700">{t.como.eyebrow}</p>
          <h2 className="mt-3 font-sans text-3xl font-bold tracking-tight text-stone-900">{t.como.title}</h2>
          <p className="mt-4 max-w-2xl text-lg text-stone-600">{t.como.sub}</p>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {t.como.principles.map((p, i) => (
              <div key={i} className="rounded-xl border border-stone-200 bg-white p-6">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-sm text-amber-700">0{i + 1}</span>
                  <h3 className="font-sans text-lg font-semibold text-stone-900">{p.t}</h3>
                </div>
                <p className="mt-2 text-stone-600">{p.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* modelo / APIs */}
        <section className="border-t border-stone-200 py-16">
          <div className="rounded-2xl bg-stone-900 p-8 text-stone-100 md:p-12">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-amber-400">{t.modelo.eyebrow}</p>
            <h2 className="mt-3 max-w-2xl font-sans text-3xl font-bold tracking-tight text-white">{t.modelo.title}</h2>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-stone-300">{t.modelo.body}</p>
            <div className="mt-7 flex flex-wrap gap-2.5">
              {t.modelo.chips.map((c) => (
                <span key={c} className="rounded-full border border-stone-700 bg-stone-800 px-4 py-1.5 font-mono text-sm text-stone-200">{c}</span>
              ))}
            </div>
          </div>
        </section>

        {/* agentes */}
        <section id="agentes" className="scroll-mt-20 border-t border-stone-200 py-16">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-amber-700">{t.agentes.eyebrow}</p>
          <h2 className="mt-3 font-sans text-3xl font-bold tracking-tight text-stone-900">{t.agentes.title}</h2>
          <p className="mt-4 max-w-2xl text-lg text-stone-600">{t.agentes.sub}</p>
          <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {t.agentes.items.map((a) => (
              <div key={a.name} className={`min-w-0 rounded-xl border p-4 ${a.veto ? 'border-amber-300 bg-amber-50' : 'border-stone-200 bg-white'}`}>
                <div className="flex items-center gap-3">
                  <AgentAvatar codename={a.name} className="h-10 w-10 flex-none" />
                  <span className="font-mono font-bold text-stone-900">{a.name}</span>
                  {a.veto && (
                    <span className="ml-auto rounded-md bg-amber-200 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-900">veto</span>
                  )}
                </div>
                <p className={`mt-2.5 text-sm ${a.veto ? 'text-amber-900' : 'text-stone-600'}`}>{a.role}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 font-mono text-sm text-stone-400">{t.agentes.note}</p>
        </section>

        {/* ejemplos */}
        <section id="ejemplos" className="scroll-mt-20 border-t border-stone-200 py-16">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-amber-700">{t.ejemplos.eyebrow}</p>
          <h2 className="mt-3 font-sans text-3xl font-bold tracking-tight text-stone-900">{t.ejemplos.title}</h2>
          <p className="mt-4 max-w-2xl text-lg text-stone-600">{t.ejemplos.sub}</p>
          <div className="mt-9 grid gap-5 md:grid-cols-3">
            {t.ejemplos.items.map((e) => (
              <div key={e.title} className="flex flex-col rounded-2xl border border-stone-200 bg-white p-6">
                <span className="font-mono text-xs uppercase tracking-wider text-stone-400">{e.tag}</span>
                <h3 className="mt-2 font-sans text-xl font-bold text-stone-900">{e.title}</h3>
                <p className="mt-3 flex-1 text-stone-600">{e.body}</p>
                {e.link && (
                  <a href={e.link.href} target="_blank" rel="noreferrer" className="mt-4 font-mono text-sm text-amber-700 hover:text-amber-900">{e.link.label} ↗</a>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* a qué más se aplica */}
        <section className="border-t border-stone-200 py-16">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-amber-700">{t.aplica.eyebrow}</p>
          <h2 className="mt-3 font-sans text-3xl font-bold tracking-tight text-stone-900">{t.aplica.title}</h2>
          <p className="mt-4 max-w-3xl text-lg text-stone-600">{t.aplica.body}</p>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {t.aplica.areas.map((a, i) => (
              <div key={a.area} className={`min-w-0 rounded-xl border p-5 ${a.live ? 'border-emerald-300 bg-emerald-50/50' : 'border-stone-200 bg-white'}`}>
                <div className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: CHAIN_COLORS[i % 4] }} />
                  <h3 className="font-mono text-sm font-bold uppercase tracking-wide text-stone-900">{a.area}</h3>
                </div>
                {a.live && (
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {t.aplica.liveLabel} · {a.live}
                  </span>
                )}
                <ul className="mt-3 flex flex-col gap-2">
                  {a.uses.map((u) => (
                    <li key={u} className="flex items-start gap-2.5 text-sm text-stone-600">
                      <span className="mt-[7px] h-1 w-1 flex-none rounded-full bg-amber-500" />
                      {u}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-6 text-stone-500">{t.aplica.foot}</p>
        </section>

        {/* precios */}
        <section id="precios" className="scroll-mt-20 border-t border-stone-200 py-16">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-amber-700">{t.precios.eyebrow}</p>
          <h2 className="mt-3 font-sans text-3xl font-bold tracking-tight text-stone-900">{t.precios.title}</h2>
          <p className="mt-4 max-w-2xl text-lg text-stone-600">{t.precios.sub}</p>
          <div className="mt-9 grid gap-5 md:grid-cols-3">
            {t.precios.tiers.map((tier) => (
              <div key={tier.name} className={`flex flex-col rounded-2xl border p-6 ${tier.highlight ? 'border-stone-900 bg-white shadow-md ring-1 ring-stone-900' : 'border-stone-200 bg-white'}`}>
                <span className="font-mono text-sm uppercase tracking-wider text-stone-500">{tier.name}</span>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-sans text-3xl font-bold text-stone-900">{tier.price}</span>
                  <span className="font-mono text-xs text-stone-400">{tier.note}</span>
                </div>
                <ul className="mt-5 flex flex-1 flex-col gap-2.5">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-stone-600">
                      <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-amber-500" />
                      {f}
                    </li>
                  ))}
                </ul>
                <a href="#contacto" className={`mt-6 rounded-lg px-5 py-3 text-center font-sans font-semibold ${tier.highlight ? 'bg-stone-900 text-white hover:bg-stone-700' : 'border border-stone-300 text-stone-800 hover:border-stone-900'}`}>{tier.cta}</a>
              </div>
            ))}
          </div>
          <p className="mt-6 font-mono text-sm text-stone-400">{t.precios.foot}</p>
        </section>

        {/* contacto */}
        <section id="contacto" className="scroll-mt-20 border-t border-stone-200 py-16">
          <div className="grid gap-10 md:grid-cols-[0.9fr_1.1fr] md:items-start">
            <div className="min-w-0">
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-amber-700">{t.contacto.eyebrow}</p>
              <h2 className="mt-3 font-sans text-3xl font-bold tracking-tight text-stone-900">{t.contacto.title}</h2>
              <p className="mt-4 text-lg text-stone-600">{t.contacto.sub}</p>
            </div>
            <div className="min-w-0 rounded-2xl border border-stone-200 bg-white p-6 md:p-8">
              <ContactForm t={t.contacto} lang={lang} siteKey={siteKey} />
            </div>
          </div>
        </section>
      </main>

      {/* pie */}
      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-5 py-8 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <Logo className="h-6 w-6" />
            <span className="font-mono text-sm text-stone-600">{t.footer.tagline}</span>
          </div>
          <div className="flex items-center gap-5 font-mono text-sm text-stone-500">
            <Link href="/login" className="hover:text-stone-900">{t.footer.acceso}</Link>
            <a href={other} className="hover:text-stone-900">{t.langLabel}</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
