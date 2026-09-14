import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requestMagicLink } from './actions'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const session = await auth()
  if (session?.user) redirect('/panel')
  const { sent, error } = await searchParams

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <header>
        <h1 className="text-lg font-bold">La Banda</h1>
        <p className="text-stone-500">Acceso al panel por enlace mágico.</p>
      </header>

      {sent ? (
        <p className="rounded border border-stone-300 bg-white p-4">Revisa tu correo: te hemos enviado el enlace de acceso.</p>
      ) : (
        <form action={requestMagicLink} className="flex flex-col gap-3 rounded border border-stone-300 bg-white p-4">
          <label className="flex flex-col gap-1">
            <span>Correo</span>
            <input name="email" type="email" required autoComplete="email" className="rounded border border-stone-300 px-2 py-1.5 sm:py-1" />
          </label>
          <button type="submit" className="rounded bg-stone-900 px-3 py-2 sm:py-1.5 text-white hover:bg-stone-700">
            Enviar enlace
          </button>
          {error && <p className="text-red-700">No se pudo entrar. Solo los correos autorizados reciben enlace.</p>}
        </form>
      )}
    </main>
  )
}
