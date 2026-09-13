/**
 * Petición HTTP con `node:https`/`node:http`, fuera del `fetch` que Vercel instrumenta.
 *
 * Por qué existe: Vercel añade a cada `fetch` saliente de una función la cabecera de
 * traza `x-vercel-id` con un salto por función atravesada, y su borde responde
 * **508 INFINITE_LOOP_DETECTED** a cualquier petición que llegue con ~6 saltos o más.
 * En la cadena de ticks (tick → tick → tick) las llamadas a la Clínica (otro proyecto de
 * Vercel) empezaban a recibir 508 a partir del tercer o cuarto agente (comprobado el
 * 2026-09-14: con 4 saltos 401, con 6 saltos 508). Con este cliente cada tick nace con
 * la traza limpia y la Clínica nunca ve los saltos.
 *
 * Solo para hablar con nuestros propios despliegues (tick, Clínica). El resto (z.ai,
 * velas) sigue con `fetch`.
 */

import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'

export interface OpcionesLimpias {
  method?: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
}

export interface RespuestaLimpia {
  ok: boolean
  status: number
  statusText: string
  text(): Promise<string>
  json<T = unknown>(): Promise<T>
}

export function fetchLimpio(url: string, opciones: OpcionesLimpias = {}): Promise<RespuestaLimpia> {
  const u = new URL(url)
  const pedir = u.protocol === 'http:' ? httpRequest : httpsRequest
  const timeoutMs = opciones.timeoutMs ?? 20_000
  const body = opciones.body
  const headers: Record<string, string> = { ...(opciones.headers ?? {}) }
  if (body !== undefined && !Object.keys(headers).some((h) => h.toLowerCase() === 'content-length')) {
    headers['content-length'] = String(Buffer.byteLength(body))
  }
  return new Promise((resolve, reject) => {
    const req = pedir(
      { protocol: u.protocol, hostname: u.hostname, port: u.port || undefined, path: `${u.pathname}${u.search}`, method: opciones.method ?? 'GET', headers },
      (res) => {
        const trozos: Buffer[] = []
        res.on('data', (c: Buffer) => trozos.push(c))
        res.on('end', () => {
          const status = res.statusCode ?? 0
          const texto = Buffer.concat(trozos).toString('utf8')
          resolve({
            ok: status >= 200 && status < 300,
            status,
            statusText: res.statusMessage ?? '',
            text: async () => texto,
            json: async <T,>() => JSON.parse(texto) as T,
          })
        })
        res.on('error', reject)
      },
    )
    req.setTimeout(timeoutMs, () => {
      req.destroy(Object.assign(new Error(`tiempo de espera (${Math.round(timeoutMs / 1000)} s)`), { name: 'TimeoutError' }))
    })
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}
