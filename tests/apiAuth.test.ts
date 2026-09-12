import { afterEach, describe, expect, it } from 'vitest'
import { apiUnauthorized } from '@/lib/apiAuth'

const req = (auth?: string) => new Request('http://x/api/v1/trading', { headers: auth ? { authorization: auth } : {} })

describe('clave de la API v1', () => {
  const prev = process.env.LA_BANDA_API_KEY
  afterEach(() => {
    process.env.LA_BANDA_API_KEY = prev
  })
  it('503 sin clave configurada, 401 con clave errónea, null con la correcta', () => {
    delete process.env.LA_BANDA_API_KEY
    expect(apiUnauthorized(req('Bearer x'))?.status).toBe(503)
    process.env.LA_BANDA_API_KEY = 'secreta'
    expect(apiUnauthorized(req())?.status).toBe(401)
    expect(apiUnauthorized(req('Bearer otra'))?.status).toBe(401)
    expect(apiUnauthorized(req('Bearer secreta'))).toBeNull()
  })
})
