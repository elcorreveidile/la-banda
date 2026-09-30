'use client'

import clsx from 'clsx'
import { useFormStatus } from 'react-dom'

/**
 * Botón de una decisión sobre un tema de marketing. Lleva su propia acción (`formAction`) y
 * muestra «…» mientras el servidor la procesa; solo el botón pulsado cambia.
 */
export function BotonTema({ action, label, pendiente, className, confirmar }: { action: (fd: FormData) => Promise<void>; label: string; pendiente: string; className?: string; confirmar?: string }) {
  const { pending, action: enCurso } = useFormStatus()
  const mio = pending && enCurso === action
  return (
    <button
      formAction={action}
      disabled={pending}
      onClick={confirmar ? (e) => { if (!window.confirm(confirmar)) e.preventDefault() } : undefined} className={clsx('rounded px-2 py-1 text-xs font-semibold disabled:opacity-60', className)}
    >
      {mio ? pendiente : label}
    </button>
  )
}
