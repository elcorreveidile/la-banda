import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'

/** Protege el panel y su API; el resto (login, auth) es público. */
export const { auth: middleware } = NextAuth(authConfig)

export const config = {
  matcher: ['/panel/:path*', '/api/panel/:path*'],
}
