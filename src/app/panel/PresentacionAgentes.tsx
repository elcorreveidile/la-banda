'use client'

import { useState } from 'react'
import clsx from 'clsx'
import { AgentAvatar } from '@/components/AgentAvatar'
import { Codename } from '@/components/Codename'
import { INTRO_CORPUS, ORDEN_CADENA, presentacionDe, type Idioma } from '@/lib/corpus/presentacion'

/** «Conoce a la banda»: qué es el corpus y un vídeo de cada agente presentándose (es/en). */
export function PresentacionAgentes() {
  const [idioma, setIdioma] = useState<Idioma>('es')
  const intro = INTRO_CORPUS[idioma]
  return (
    <details className="rounded-lg border border-stone-200 bg-stone-50 p-3">
      <summary className="cursor-pointer font-semibold">Conoce a la banda · qué hace cada agente</summary>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="max-w-3xl">
            <p className="font-semibold">{intro.titulo}</p>
            <p className="mt-1 text-sm text-stone-600">{intro.texto}</p>
          </div>
          <div role="group" aria-label="Idioma" className="flex shrink-0 overflow-hidden rounded border border-stone-300 text-xs">
            {(['es', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setIdioma(l)}
                aria-pressed={idioma === l}
                className={clsx('px-2.5 py-1 uppercase', idioma === l ? 'bg-emerald-600 text-white' : 'bg-white hover:bg-stone-100')}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ORDEN_CADENA.map((nombre, i) => {
            const p = presentacionDe(nombre, idioma)
            if (!p) return null
            return (
              <li key={nombre} className="flex flex-col gap-2 rounded-lg border border-stone-200 bg-white p-2">
                <div className="flex items-center gap-2">
                  <AgentAvatar codename={nombre} className="h-8 w-8 shrink-0" />
                  <div className="leading-tight">
                    <Codename name={nombre} />
                    <span className="ml-1.5 text-xs text-stone-400">{i + 1}/10</span>
                    <p className="text-xs text-stone-500">{p.rol}</p>
                  </div>
                </div>
                {/* key: al cambiar de idioma el <video> se vuelve a montar con su fuente. */}
                <video key={p.video} controls preload="none" poster={p.poster} className="aspect-video w-full rounded bg-stone-100">
                  <source src={p.video} type="video/mp4" />
                </video>
                <p className="text-xs text-stone-600">{p.guion}</p>
              </li>
            )
          })}
        </ol>
      </div>
    </details>
  )
}
