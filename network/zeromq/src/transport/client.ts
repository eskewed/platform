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

import type { AccountUuid, ClientTransport, RequestId } from '@hcengineering/network'

import * as zmq from 'zeromq'
import { transportOperations, type ClientHandler } from '../types'

export class ZMQClientTransport implements ClientTransport {
  subscriber: zmq.Subscriber
  pusher: zmq.Push

  reqCounter: number = 0

  subscribed = new Set<AccountUuid>()

  requests = new Map<RequestId, (data: any) => void>()

  constructor (
    host: string,
    port: number,
    publisherPort: number,
    readonly handler: ClientHandler,
    options?: zmq.SocketOptions<zmq.Subscriber | zmq.Push>
  ) {
    this.subscriber = new zmq.Subscriber(options)
    this.pusher = new zmq.Push(options)

    this.subscriber.connect(`tcp://${host}:${publisherPort}`)
    this.pusher.connect(`tcp://${host}:${port}`)

    void this.handleMessages(this.subscriber, this.handler)
  }

  private async send (clientId: AccountUuid, reqId: RequestId, body: any): Promise<void> {
    if (!this.subscribed.has(clientId)) {
      this.subscriber.subscribe(clientId)
    }
    await this.pusher.send(JSON.stringify([transportOperations.clientSend, clientId, reqId, body]))
  }

  async request (clientId: AccountUuid, body: any): Promise<any> {
    return await new Promise<any>((resolve, reject) => {
      const reqId = (clientId + '-' + this.reqCounter++) as RequestId
      this.requests.set(reqId, resolve)
      void this.send(clientId, reqId, body).catch((err) => {
        reject(err)
      })
    })
  }

  async handleMessages (socket: zmq.Pull | zmq.Subscriber, handler: ClientHandler): Promise<void> {
    for await (const msg of socket) {
      try {
        const [clientId, reqId, body] =
          msg.length === 1 ? JSON.parse(msg.toString()) : [msg[0].toString(), ...JSON.parse(msg[1].toString())]
        const res = this.requests.get(reqId)
        if (res !== undefined) {
          this.requests.delete(reqId)
          res(body)
        } else {
          // Incoming request
          await handler(clientId, reqId, body)
        }
      } catch (err: any) {
        console.error('Error handling message:', err)
      }
    }
  }

  subscribe (account: AccountUuid): void {
    this.subscribed.add(account)
    this.subscriber.subscribe(account)
  }

  unsubscribe (account: AccountUuid): void {
    this.subscriber.unsubscribe(account)
    this.subscribed.delete(account)
  }

  async close (): Promise<void> {
    this.subscriber.close()
    this.pusher.close()

    while (!this.subscriber.closed && !this.pusher.closed) {
      await new Promise<void>((resolve) => setTimeout(resolve))
    }
  }
}

/**
 * A server component to manage clients via ZMQ Subscriber pattern
 *
 * Should be passed to ZMQServerTransport to handle client responses
 */
export class ZMQClientPublisher {
  publisher: zmq.Publisher // Client responses

  constructor (
    readonly host: string,
    readonly port: number,
    options?: zmq.SocketOptions<zmq.Publisher>
  ) {
    this.publisher = new zmq.Publisher(options)
  }

  start (): Promise<void> {
    return this.publisher.bind(`tcp://${this.host}:${this.port}`)
  }

  async send (clientId: AccountUuid, reqId: RequestId | undefined, body: any): Promise<void> {
    // Client is event target
    await this.publisher.send([clientId, JSON.stringify([reqId, body])])
  }

  async close (): Promise<void> {
    this.publisher.close()
    while (!this.publisher.closed) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1))
    }
  }
}
