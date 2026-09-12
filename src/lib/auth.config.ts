import type { NextAuthConfig } from 'next-auth'

/**
 * Parte de la configuración que también corre en el middleware (Edge):
 * sin adaptador ni proveedores que toquen la base de datos.
 * NUNCA AUTH_URL en producción: `trustHost` toma el host real de la petición.
 */
export const authConfig = {
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login', verifyRequest: '/login?sent=1', error: '/login' },
  providers: [],
  callbacks: {
    authorized({ auth }) {
      return Boolean(auth?.user?.email)
    },
  },
} satisfies NextAuthConfig
