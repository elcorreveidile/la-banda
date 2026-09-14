/**
 * Marca de La Banda: una cadena de tres nodos con sus traspasos (la seña del grafo del
 * panel). El último nodo va en ámbar (el agente en curso). Cuadrado oscuro redondeado,
 * pensado para tamaños pequeños (cabecera, favicon). Se dimensiona por `className`.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="La Banda" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#1c1917" />
      <path d="M6 15 Q9 8.5 12 15" fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
      <path d="M12 15 Q15 8.5 18 15" fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
      <circle cx="6" cy="15" r="2.1" fill="#ffffff" />
      <circle cx="12" cy="15" r="2.1" fill="#ffffff" />
      <circle cx="18" cy="15" r="2.1" fill="#fbbf24" />
    </svg>
  )
}

export default Logo
