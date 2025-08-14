// Logbook REST helpers
import { type OperationDomain } from '@hcengineering/core'
import type { RestClient } from './types'

const DOMAIN: OperationDomain = 'logbook' as OperationDomain

export interface ListEntriesParams {
  pilotId?: string
  from?: number
  to?: number
  limit?: number
  offset?: number
}

export interface TotalsParams {
  pilotId?: string
  period?: string
}

export async function listEntries (client: RestClient, params: ListEntriesParams): Promise<any> {
  const { value } = await client.domainRequest<any>(DOMAIN, { listEntries: params })
  return value
}

export async function getTotals (client: RestClient, params: TotalsParams): Promise<any> {
  const { value } = await client.domainRequest<any>(DOMAIN, { getTotals: params })
  return value
}

export async function upsertEntry (client: RestClient, entry: any): Promise<any> {
  const { value } = await client.domainRequest<any>(DOMAIN, { upsertEntry: { entry } })
  return value
}

export async function deleteEntry (client: RestClient, entryId: string): Promise<any> {
  const { value } = await client.domainRequest<any>(DOMAIN, { deleteEntry: { entryId } })
  return value
}

export async function createEndorsement (client: RestClient, entryId: string, signerId: string): Promise<any> {
  const { value } = await client.domainRequest<any>(DOMAIN, { createEndorsement: { entryId, signerId } })
  return value
}