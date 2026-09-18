'use client'

import { useEffect, useRef, useState } from 'react'
import type { LandingContent, Lang } from '@/lib/landing/content'

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

export default function ContactForm({ t, lang, siteKey }: { t: LandingContent['contacto']; lang: Lang; siteKey?: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!siteKey) return
    if (document.querySelector(`script[src="${TURNSTILE_SRC}"]`)) return
    const s = document.createElement('script')
    s.src = TURNSTILE_SRC
    s.async = true
    s.defer = true
    document.head.appendChild(s)
  }, [siteKey])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (state === 'sending') return
    const form = e.currentTarget
    const fd = new FormData(form)
    setState('sending')
    try {
      const res = await fetch('/api/contacto', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: fd.get('name'),
          email: fd.get('email'),
          message: fd.get('message'),
          website: fd.get('website'),
          token: fd.get('cf-turnstile-response'),
          lang,
        }),
      })
      if (!res.ok) throw new Error('failed')
      setState('ok')
      form.reset()
    } catch {
      setState('error')
    }
  }

  if (state === 'ok') {
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-6 text-emerald-900">
        <p className="font-sans text-lg font-semibold">{t.okTitle}</p>
        <p className="mt-1 font-sans text-sm text-emerald-800">{t.okBody}</p>
      </div>
    )
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
      {/* honeypot */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-xs uppercase tracking-wider text-stone-500">{t.name}</span>
          <input name="name" type="text" autoComplete="name" className="rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-sans text-stone-900 outline-none focus:border-stone-900" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-xs uppercase tracking-wider text-stone-500">{t.email}</span>
          <input name="email" type="email" required autoComplete="email" className="rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-sans text-stone-900 outline-none focus:border-stone-900" />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-xs uppercase tracking-wider text-stone-500">{t.message}</span>
        <textarea name="message" required rows={4} className="rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-sans text-stone-900 outline-none focus:border-stone-900" />
      </label>
      {siteKey && <div className="cf-turnstile" data-sitekey={siteKey} data-theme="light" />}
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={state === 'sending'}
          className="rounded-lg bg-stone-900 px-6 py-3 font-sans font-semibold text-white transition hover:bg-stone-700 disabled:opacity-50"
        >
          {state === 'sending' ? t.sending : t.send}
        </button>
        {state === 'error' && <span className="font-sans text-sm text-red-700">{t.error}</span>}
        <span className="font-sans text-xs text-stone-400">{t.privacy}</span>
      </div>
    </form>
  )
}
