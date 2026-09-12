/**
 * Envío de correo transaccional por la API de Brevo (mismo patrón y mismas
 * variables que wp-next-starter): BREVO_API_KEY y BREVO_SENDER_EMAIL.
 */
const BREVO_API = 'https://api.brevo.com/v3'

export async function sendBrevoEmail({ to, subject, html, text }: { to: string; subject: string; html: string; text: string }): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY?.trim()
  if (!apiKey) throw new Error('Falta BREVO_API_KEY')
  const res = await fetch(`${BREVO_API}/smtp/email`, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'La Banda', email: process.env.BREVO_SENDER_EMAIL?.trim() || 'hola@por2duros.com' },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
}
