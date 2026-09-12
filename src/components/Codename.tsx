import clsx from 'clsx'

/** Color fijo por codename (los diez de La Banda; cualquier otro, gris). */
const COLORS: Record<string, string> = {
  Tokio: 'text-rose-700',
  Denver: 'text-amber-700',
  Estocolmo: 'text-sky-700',
  Río: 'text-emerald-700',
  Berlín: 'text-violet-700',
  Lisboa: 'text-cyan-700',
  Nairobi: 'text-orange-700',
  Palermo: 'text-red-800',
  Helsinki: 'text-lime-700',
  Profesor: 'text-stone-900',
}

export function codenameColor(codename: string | null | undefined): string {
  return (codename && COLORS[codename]) || 'text-stone-500'
}

export function Codename({ name, className }: { name: string; className?: string }) {
  return <span className={clsx('font-bold', codenameColor(name), className)}>{name}</span>
}
