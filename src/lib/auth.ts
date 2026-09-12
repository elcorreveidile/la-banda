import NextAuth from 'next-auth'
import Resend from 'next-auth/providers/resend'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { getDb } from '@/db'
import { authAccounts, authSessions, authUsers, authVerificationTokens } from '@/db/schema'
import { authConfig } from './auth.config'

/** Correos que pueden entrar (ALLOWED_EMAILS, separados por comas). Vacío = nadie. */
export function allowedEmails(): Set<string> {
  return new Set(
    (process.env.ALLOWED_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
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
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.EMAIL_FROM ?? 'La Banda <hola@por2duros.com>',
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    /** Solo se envía enlace mágico a los correos de la lista. */
    signIn({ user }) {
      const email = user.email?.toLowerCase()
      return Boolean(email && allowedEmails().has(email))
    },
  },
}))
