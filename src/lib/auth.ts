import NextAuth from 'next-auth'
import type { EmailConfig } from 'next-auth/providers'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { getDb } from '@/db'
import { authAccounts, authSessions, authUsers, authVerificationTokens } from '@/db/schema'
import { authConfig } from './auth.config'
import { sendBrevoEmail } from './brevo'

/** Correos que pueden entrar (ALLOWED_EMAILS, separados por comas). Vacío = nadie. */
export function allowedEmails(): Set<string> {
  return new Set(
    (process.env.ALLOWED_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
}

/** Proveedor de enlace mágico por la API de Brevo (Auth.js no trae uno; el tipo `email` admite `sendVerificationRequest` propio). */
function brevoMagicLink(): EmailConfig {
  return {
    id: 'brevo',
    name: 'Brevo',
    type: 'email',
    from: process.env.BREVO_SENDER_EMAIL?.trim() || 'hola@por2duros.com',
    maxAge: 15 * 60,
    options: {},
    async sendVerificationRequest({ identifier, url }) {
      const host = new URL(url).host
      await sendBrevoEmail({
        to: identifier,
        subject: `Tu acceso a La Banda (${host})`,
        text: `Entra en La Banda con este enlace (caduca en 15 minutos):\n\n${url}\n\nSi no lo has pedido, ignora este correo.`,
        html: `<p>Entra en La Banda con este enlace (caduca en 15 minutos):</p><p><a href="${url}">${url}</a></p><p style="color:#777">Si no lo has pedido, ignora este correo.</p>`,
      })
    },
  }
}

/** Configuración perezosa: el adaptador abre la conexión en la primera petición, no al importar. */
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  ...authConfig,
  adapter: DrizzleAdapter(getDb(), {
    usersTable: authUsers,
    accountsTable: authAccounts,
    sessionsTable: authSessions,
    verificationTokensTable: authVerificationTokens,
  }),
  providers: [brevoMagicLink()],
  callbacks: {
    ...authConfig.callbacks,
    /** Solo se envía enlace mágico a los correos de la lista. */
    signIn({ user }) {
      const email = user.email?.toLowerCase()
      return Boolean(email && allowedEmails().has(email))
    },
  },
}))
