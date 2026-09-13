import clsx from 'clsx'
import { codenameColor } from '@/components/Codename'
import avatares from '@/lib/panel/avatares.json'

const AVATARES = avatares as Record<string, { role: string; inner: string }>

/**
 * Avatar de un agente de La Banda: máscara geométrica en SVG (trazos en
 * currentColor, así toma el color del codename). Fuente única en el repo
 * X-dos-duros (`marketing/la-banda/build/avatars.mjs`); aquí solo la copia.
 */
export function AgentAvatar({ codename, className }: { codename: string; className?: string }) {
  const a = AVATARES[codename]
  if (!a) {
    return (
      <span className={clsx('flex items-center justify-center rounded-full border border-current text-xs font-bold', codenameColor(codename), className)}>
        {codename.slice(0, 2)}
      </span>
    )
  }
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label={codename} className={clsx(codenameColor(codename), className)} dangerouslySetInnerHTML={{ __html: a.inner }} />
  )
}

/** Markup interior del avatar (para pintarlo dentro de otro SVG, p. ej. el grafo). */
export function avatarInner(codename: string): string | null {
  return AVATARES[codename]?.inner ?? null
}
