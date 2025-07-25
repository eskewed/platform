import { v4 as uuid } from 'uuid'
import { type AskOptions, type Client, type SessionManager } from '../api/client'
import type { NodeDiscovery, WorkspaceDiscovery } from '../api/discovery'
import type { Node } from '../api/node'
import type { Request, RequestAkn, RequestId, Response, ResponseValue } from '../api/request'
import { timeouts } from '../api/timeouts'
import type { AccountUuid, WorkspaceUuid } from '../api/types'
import type { TickManager } from '../api/utils'
import type { NodeImpl } from './node'

interface RequestData<T, V> {
  request: Request<T>
  time: number
  responses: Array<Response<V>>
  akn: RequestAkn | undefined
  promise: Promise<ResponseValue<V>>

  resolve: (value: ResponseValue<V>) => void
  reject: (err: Error) => void
}
class SessionImpl implements Client {
  requests = new Map<RequestId, RequestData<any, any>>()

  onClose?: () => void
  onBroadcast?: (<T>(response: Response<T>) => void) | undefined

  lastOp: number = performance.now()

  constructor (
    readonly account: AccountUuid,
    readonly sessionId: string,
    readonly localNode: Node,
    readonly tick: number
  ) {}

  async ask<T, V>(req: T, options?: AskOptions): Promise<ResponseValue<V>> {
    this.lastOp = performance.now()

    const requestId = uuid() as RequestId
    const request: Request<T> = {
      _id: requestId,
      account: this.account,
      data: req,
      workspaces: {}
    }

    let resolveRequest = (value: ResponseValue<V>): void => {}
    let rejectRequest = (_: Error): void => {}

    const rdata: RequestData<T, V> = {
      request,
      time: Date.now(),
      akn: undefined,
      responses: [],
      resolve: () => {},
      reject: () => {},
      promise: new Promise<ResponseValue<V>>((resolve, reject) => {
        resolveRequest = resolve as RequestData<T, V>['resolve']
        rejectRequest = reject as RequestData<T, V>['reject']
      })
    }
    this.requests.set(requestId, rdata)
    rdata.resolve = resolveRequest
    rdata.reject = rejectRequest

    rdata.akn = await this.localNode.ask(request, { ...(options ?? {}), target: undefined })

    this.checkResponses(rdata, rdata.responses)

    return await rdata.promise
  }

  async modify<T, V>(workspaceId: WorkspaceUuid, req: T): Promise<ResponseValue<V>> {
    this.lastOp = performance.now()

    const requestId = uuid() as RequestId
    const request: Request<T> = {
      _id: requestId,
      account: this.account,
      data: req,
      workspaces: {}
    }
    return await this.localNode.modify(workspaceId, request)
  }

  checkResponses (rdata: RequestData<any, any>, responses: Array<Response<any>>): void {
    for (const response of responses) {
      if (response._id == null) {
        continue
      }
      if (rdata.akn?.workspaces[response.workspaceId] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete rdata.akn.workspaces[response.workspaceId]
      }
    }
    if (rdata.akn !== undefined && Object.keys(rdata.akn.workspaces).length === 0) {
      rdata.responses.sort((a, b) => a.workspaceId.localeCompare(b.workspaceId))

      // Flatten all response values properly
      const allValues = rdata.responses.flatMap((r) => r.data.value)
      const totalCount = rdata.responses.reduce((sum, r) => sum + r.data.total, 0)

      rdata.resolve({ value: allValues, total: totalCount })
      this.requests.delete(rdata.request._id)
    }
  }

  handleResponse<T>(responses: Array<Response<T>>): void {
    for (const response of responses) {
      if (response._id == null) {
        // This is a broadcast response, call the callback if it exists.
        this.onBroadcast?.(response)
        continue
      }

      const rdata = this.requests.get(response._id)
      if (rdata == null) {
        console.warn('Response for unknown request', response._id, response)
        continue
      }

      rdata.responses.push(response)

      this.checkResponses(rdata, [response])
    }
  }

  close (): void {
    this.onClose?.()
  }

  async retryIfNeeded (time: number): Promise<void> {
    for (const [, rdata] of this.requests.entries()) {
      if (time - rdata.time > timeouts.retryTimeout) {
        const wsretry = Array.from(Object.keys(rdata.akn?.workspaces ?? {})) as WorkspaceUuid[]
        if (wsretry.length > 0) {
          await this.localNode.ask(rdata.request, { target: wsretry })
        }
      }
    }
  }
}

export class SessionManagerImpl implements SessionManager {
  clients = new Map<string, SessionImpl>()
  clientsByUuid = new Map<AccountUuid, SessionImpl[]>()

  rid: number = 0
  warmupRequests = new Map<number, Promise<void>>()

  constructor (
    readonly node: NodeImpl,
    readonly tickManager: TickManager,

    readonly workspaceDiscovery: WorkspaceDiscovery,
    readonly nodeDiscovery: NodeDiscovery
  ) {
    this.node.onClientBroadcast = async (account: AccountUuid, response: Array<Response<any>>) => {
      for (const session of this.clientsByUuid.get(account) ?? []) {
        session.handleResponse(response)
      }
    }
    tickManager.register(async (tick, tps) => {
      // Retry failed requests
      const time = performance.now()
      for (const c of this.clients.values()) {
        if (tick % tps === c.tick) {
          await c.retryIfNeeded(time)
        }
      }
      // Every 30 seconds, do a ping
      if (tick % (tps * timeouts.pingTimeout) === 0) {
        void this.doPing(Array.from(this.clientsByUuid.keys())).catch((err) => {
          console.error('Error pinging accounts', err)
        })
      }
    })
  }

  async doPing (accounts: AccountUuid[]): Promise<void> {
    try {
      const workspaces = new Set<WorkspaceUuid>()
      for (const account of accounts) {
        const wss = await this.workspaceDiscovery.byAccount(account)
        for (const ws of wss) {
          workspaces.add(ws)
        }
      }
      await this.node.ping(Array.from(workspaces), true)
    } catch (err) {
      console.error('Error pinging accounts', err)
    }
  }

  async register (account: AccountUuid, sessionId: string): Promise<Client> {
    const accountNode = await this.nodeDiscovery.byAccount(account)
    if (accountNode !== this.node._id) {
      throw new Error(
        'Invalid host node for account ' + account + ', expected ' + this.node._id + ', got ' + accountNode
      )
    }
    const oldSession = this.clients.get(sessionId)
    oldSession?.close()

    const session = new SessionImpl(account, sessionId, this.node, this.tickManager.nextHash())
    this.clients.set(sessionId, session)
    this.clientsByUuid.set(account, (this.clientsByUuid.get(account) ?? []).concat(session))

    const id = ++this.rid
    this.warmupRequests.set(id, this.warmupAccount(account, id))

    return session
  }

  async warmupAccount (account: AccountUuid, id: number): Promise<void> {
    try {
      const workspaces = await this.workspaceDiscovery.byAccount(account)
      await this.node.ping(workspaces, true)
    } catch (err: any) {
      console.error(err)
    } finally {
      this.warmupRequests.delete(id)
    }
  }

  async unregister (sessionid: string): Promise<void> {
    const session = this.clients.get(sessionid)
    session?.onClose?.()
    this.clients.delete(sessionid)
    if (session !== undefined) {
      this.clientsByUuid.set(
        session.account,
        (this.clientsByUuid.get(session.account) ?? []).filter((it) => it.sessionId !== sessionid)
      )
    }
    await Promise.resolve()
  }

  close (): void {
    for (const session of this.clients.values()) {
      session.close()
    }
  }

  async waitWarmups (): Promise<void> {
    const promises = Array.from(this.warmupRequests.values())
    if (promises.length > 0) {
      await Promise.all(promises)
    }
  }
}
