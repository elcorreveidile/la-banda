import type { DomainConfig } from './types'
import { validateDomain } from './types'
import { toyDomain } from './toy/config'
import { tradingDomain } from './trading/config'
import { olvidosDomain } from './olvidos/config'
import { corpusEleDomain } from './corpus-ele/config'

const DOMAINS: Record<string, DomainConfig> = {
  [toyDomain.name]: toyDomain,
  [tradingDomain.name]: tradingDomain,
  [olvidosDomain.name]: olvidosDomain,
  [corpusEleDomain.name]: corpusEleDomain,
}

for (const d of Object.values(DOMAINS)) validateDomain(d)

export function getDomain(name: string): DomainConfig {
  const d = DOMAINS[name]
  if (!d) throw new Error(`Dominio desconocido: ${name}`)
  return d
}

export function listDomains(): DomainConfig[] {
  return Object.values(DOMAINS)
}

export type { DomainConfig, AgentConfig, AgentDecision, ToolDef } from './types'
