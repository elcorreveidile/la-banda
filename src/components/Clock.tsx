'use client'

import { useEffect, useState } from 'react'

export function Clock() {
  const [now, setNow] = useState<string>('')
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString('es-ES', { hour12: false }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return <span suppressHydrationWarning>{now}</span>
}
