import {
  NodeImpl,
  NodeManagerImpl,
  type Node,
  type NodeAskOptions,
  type NodeDiscovery,
  type NodeUuid,
  type Request,
  type RequestAkn,
  type Response,
  type ResponseValue,
  type ServerTransport,
  type WorkspaceDiscovery,
  type WorkspaceFactory
} from '@hcengineering/network'
import type { TickManager } from '@hcengineering/network/types/api/utils'
import { ZMQServerTransport } from './transport'
import type { ZMQNodeData } from './types'

const nodeTransportOps = {
  ask: 'a',
  modify: 'm',
  ping: 'p',
  broadcast: 'b'
}

class NodeProxyImpl implements Node {
  constructor (
    readonly _id: NodeUuid,
    readonly transport: ServerTransport
  ) {}

  async ask<T>(req: Request<T>, options?: NodeAskOptions): Promise<RequestAkn> {
    return (await this.transport.request(this._id, { op: nodeTransportOps.ask, req, options })) as RequestAkn
  }

  async modify<T, V>(workspaceId: string, req: Request<T>): Promise<ResponseValue<V>> {
    return (await this.transport.request(this._id, {
      op: nodeTransportOps.modify,
      workspaceId,
      req
    })) as ResponseValue<V>
  }

  async ping (workspaces: string[], processChildren: boolean): Promise<void> {
    await this.transport.send(this._id, undefined, { op: nodeTransportOps.ping, workspaces, processChildren })
  }

  async close (): Promise<void> {
    // No operation required
  }

  async broadcast<T>(req: Array<Response<T>>): Promise<void> {
    await this.transport.send(this._id, undefined, { op: nodeTransportOps.broadcast, req })
  }
}

export async function createZMQNode (
  nodeId: NodeUuid,
  host: string,
  port: number,
  discovery: NodeDiscovery<ZMQNodeData>,
  workspaceDiscovery: WorkspaceDiscovery,
  workspaceFactory: WorkspaceFactory,
  tickManager: TickManager
): Promise<Node> {
  let transport: ZMQServerTransport | undefined // eslint-disable-line prefer-const

  // A node connection manager
  const nodeManager = new NodeManagerImpl(async (node) => {
    return new NodeProxyImpl(node, transport as ServerTransport)
  }, discovery)

  const node = new NodeImpl(nodeId, workspaceFactory, workspaceDiscovery, nodeManager, tickManager, async () => {
    await transport?.close()
  })

  transport = new ZMQServerTransport(
    nodeId,
    discovery,
    async (sendResponse, clientId, reqId, body) => {
      // Handle incoming requests,
      switch (body.op) {
        case nodeTransportOps.ask: {
          const result = await node?.ask(body.req, body.options)
          await sendResponse(result)
          break
        }
        case nodeTransportOps.modify: {
          const result = await node?.modify(body.workspaceId, body.req)
          await sendResponse(result)

          break
        }
        case nodeTransportOps.ping:
          await node?.ping(body.workspaces, body.processChildren)
          break
        case nodeTransportOps.broadcast:
          await node?.broadcast(body.req)
          break
      }
    },
    undefined,
    // Handle incoming requests,
    { host, port }
  )
  await transport.start()
  return node
}
