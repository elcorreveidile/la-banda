'use server'

import { signIn } from '@/lib/auth'

export async function requestMagicLink(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  if (!email) return
  await signIn('brevo', { email, redirectTo: '/panel' })
}
