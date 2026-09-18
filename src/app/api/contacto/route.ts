import { NextResponse } from 'next/server'
import { sendBrevoEmail } from '@/lib/brevo'
import { verifyTurnstile } from '@/lib/turnstile'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

/**
 * POST /api/contacto — formulario público de la portada.
 * Antispam: honeypot silencioso (`website`) + Cloudflare Turnstile (se omite sin clave).
 * Avisa por email (Brevo) a CONTACT_EMAIL (fallback: BREVO_SENDER_EMAIL). Mejor esfuerzo.
 */
export async function POST(req: Request) {
  const data = (await req.json().catch(() => null)) as
    | { name?: string; email?: string; message?: string; website?: string; token?: string; lang?: string }
    | null
  if (!data) return NextResponse.json({ error: 'bad-request' }, { status: 400 })

  // honeypot: si viene relleno, fingimos éxito y no hacemos nada
  if (typeof data.website === 'string' && data.website.trim()) return NextResponse.json({ ok: true })

  const name = String(data.name ?? '').trim().slice(0, 120)
  const email = String(data.email ?? '').trim().slice(0, 200)
  const message = String(data.message ?? '').trim().slice(0, 4000)
  const okEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
  if (!okEmail || message.length < 5) return NextResponse.json({ error: 'invalid' }, { status: 400 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const passed = await verifyTurnstile(data.token, ip)
  if (!passed) return NextResponse.json({ error: 'captcha' }, { status: 400 })

  const to = process.env.CONTACT_EMAIL?.trim() || process.env.BREVO_SENDER_EMAIL?.trim() || 'hola@por2duros.com'
  const lang = data.lang === 'en' ? 'en' : 'es'
  try {
    await sendBrevoEmail({
      to,
      subject: `La Banda · nuevo contacto (${lang}): ${name || email}`,
      text: `Nombre: ${name || '—'}\nCorreo: ${email}\nIdioma: ${lang}\n\n${message}`,
      html: `<p><b>Nombre:</b> ${esc(name || '—')}</p><p><b>Correo:</b> ${esc(email)}</p><p><b>Idioma:</b> ${lang}</p><hr><p style="white-space:pre-wrap">${esc(message)}</p>`,
    })
  } catch {
    return NextResponse.json({ error: 'send-failed' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
