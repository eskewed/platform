//
// Copyright © 2025 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

import type { AccountUuid, NodeDiscovery, NodeUuid, RequestId, ServerTransport } from '@hcengineering/network'

import * as zmq from 'zeromq'
import { transportOperations, type ServerHandler, type ZMQNodeData } from '../types'

export class ZMQServerTransport implements ServerTransport {
  nodes = new Map<NodeUuid, zmq.Push>()
  pullSocket: zmq.Pull

  reqCounter: number = 0

  requests = new Map<RequestId, (data: any) => void>()

  constructor (
    readonly nodeId: NodeUuid,
    readonly discovery: NodeDiscovery<ZMQNodeData>,
    readonly handler: ServerHandler,
    readonly handleClientSend:
    | ((clientId: AccountUuid, reqId: RequestId | undefined, body: any) => Promise<void>)
    | undefined,
    readonly options: {
      host: string
      port: number
      zmq?: zmq.SocketOptions<zmq.Pull>
    } = { host: '0.0.0.0', port: 3700 }
  ) {
    this.pullSocket = new zmq.Pull(this.options.zmq)
  }

  async send (target: NodeUuid, reqId: RequestId | undefined, body: any): Promise<void> {
    // Our node is event target
    await this.node(target).send(JSON.stringify([transportOperations.nodeSend, this.nodeId, reqId, body]))
  }

  async sendClient (clientId: AccountUuid, reqId: RequestId | undefined, body: any): Promise<void> {
    const clientNodeId = await this.discovery.byAccount(clientId)
    if (this.nodeId === clientNodeId) {
      await this.handleClientSend?.(clientId, reqId, body)
    } else {
      // Wrong node, pass to proper one
      await this.node(clientNodeId).send(JSON.stringify([transportOperations.clientRedirect, clientId, reqId, body]))
    }
  }

  async request (targetNode: NodeUuid, body: any): Promise<any> {
    return await new Promise<any>((resolve, reject) => {
      const reqId = (this.nodeId + '-' + this.reqCounter++) as RequestId
      this.requests.set(reqId, (value) => {
        if (this.nodeId === 'node4') {
          console.log('recieve response', targetNode, 'reqId', reqId, 'body', body, value)
        }
        resolve(value)
      })
      setTimeout(() => {
        if (this.requests.has(reqId)) {
          console.error('Request timeout', targetNode, 'from', this.nodeId, reqId, body)
        }
      }, 10000)

      if (this.nodeId === 'node4') {
        console.log('send request', targetNode, 'reqId', reqId, 'body', body)
      }
      void this.send(targetNode, reqId, body).catch((err) => {
        reject(err)
      })
    })
  }

  async handleMessages (socket: zmq.Pull | zmq.Subscriber, handler: ServerHandler): Promise<void> {
    for await (const msg of socket) {
      try {
        const [target, clientId, reqId, body] =
          msg.length === 1 ? JSON.parse(msg.toString()) : [msg[0].toString(), ...JSON.parse(msg[1].toString())]

        if (this.nodeId === 'node5') {
          console.log('message to node5', target, clientId, reqId, body)
        }
        if (target === transportOperations.clientRedirect) {
          // Forward to client
          void this.sendClient(clientId, reqId, body).catch((err) => {
            console.error('failed to send client redirect', err)
          })
          continue
        }

        const res = this.requests.get(reqId)
        if (res !== undefined) {
          this.requests.delete(reqId)
          res(body)
        } else {
          if (target === transportOperations.nodeSend) {
            // Node <-> Node request
            void handler((resp) => this.send(clientId, reqId, resp), { node: clientId }, reqId, body).catch((err) => {
              console.error('failed to handle message', err)
            })
          } else if (target === transportOperations.clientSend) {
            // Client request
            await handler((resp) => this.sendClient(clientId, reqId, resp), { client: clientId }, reqId, body).catch(
              (err) => {
                console.error('failed to handle message', err)
              }
            )
          }
        }
      } catch (err: any) {
        console.error('Error handling message:', err)
      }
    }
  }

  async start (): Promise<void> {
    await this.pullSocket.bind(`tcp://${this.options.host}:${this.options.port}`)

    // Initialize connections to all node's
    for (const nde of this.discovery.list()) {
      if (nde !== this.nodeId) {
        await this.connect(nde)
      }
    }

    void this.handleMessages(this.pullSocket, this.handler)
  }

  async close (): Promise<void> {
    this.pullSocket.close()

    for (const nde of this.nodes.values()) {
      nde.close()
    }

    while (!this.pullSocket.closed && this.nodes.values().some((it) => !it.closed)) {
      await new Promise<void>((resolve) => setTimeout(resolve))
    }
  }

  private async connect (node: NodeUuid): Promise<zmq.Push> {
    let push = this.nodes.get(node)
    if (push === undefined) {
      const stats = await this.discovery.stats(node)
      push = new zmq.Push(this.options.zmq)
      push.connect(`tcp://${stats.host}:${stats.port}`)
      this.nodes.set(node, push)
    }
    return push
  }

  private node (node: NodeUuid): zmq.Push {
    const nodeRef = this.nodes.get(node)
    if (nodeRef === undefined) {
      throw new Error('Invalid node')
    }
    return nodeRef
  }
}
