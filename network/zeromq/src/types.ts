import type { AccountUuid, NodeData, NodeUuid, RequestId } from '@hcengineering/network'

export type ZMQNodeData = NodeData & {
  host: string
  port: number
}

export type ClientHandler = (clientId: AccountUuid, reqId: RequestId | undefined, body: any) => Promise<void>

export type ServerHandler = (
  sendResponse: (body: any) => Promise<void>,
  clientId: { node: NodeUuid } | { client: AccountUuid },
  reqId: RequestId | undefined,
  body: any
) => Promise<void>

export const transportOperations = {
  nodeSend: '@',
  clientSend: '%',
  clientRedirect: '$'
}
