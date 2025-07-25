import type { RequestId } from './request'
import type { AccountUuid, NodeUuid } from './types'

export interface ClientTransport {
  request: (clientId: AccountUuid, reqId: RequestId, body: any) => Promise<any>
  subscribe: (account: AccountUuid) => void
  unsubscribe: (account: AccountUuid) => void
  close: () => Promise<void>
}

export interface ServerTransport {
  nodeId: NodeUuid

  request: (target: NodeUuid, body: any) => Promise<any>
  send: (target: NodeUuid, reqId: RequestId | undefined, body: any) => Promise<void>
  close: () => Promise<void>
}
