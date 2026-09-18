/**
 * Verificación de Cloudflare Turnstile en el servidor (mismo patrón que wp-next-starter).
 * Sin `TURNSTILE_SECRET_KEY` (desarrollo) se omite la comprobación y se da por válido.
 */
export async function verifyTurnstile(token: string | undefined, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim()
  if (!secret) return true // dev / sin claves
  if (!token) return false
  try {
    const body = new URLSearchParams({ secret, response: token })
    if (ip) body.set('remoteip', ip)
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(8_000),
    })
    const data = (await res.json().catch(() => ({ success: false }))) as { success?: boolean }
    return Boolean(data.success)
  } catch {
    return false
  }
}
