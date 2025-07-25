import type { ClientBroadcast } from '../api/client'
import type { NodeData, NodeDiscovery, WorkspaceDiscovery } from '../api/discovery'
import type { Node, NodeAskOptions, NodeFactory, NodeManager, Workspace, WorkspaceFactory } from '../api/node'
import type { Request, RequestAkn, Response, ResponseValue } from '../api/request'
import { timeouts } from '../api/timeouts'
import type { AccountUuid, NodeUuid, WorkspaceUuid } from '../api/types'
import type { TickManager } from '../api/utils'
import { groupByArray } from '../utils'

class WorkspaceSession {
  workspace: Workspace | Promise<Workspace>
  tick: number
  lastUse: number
  state: 'ready' | 'suspended'

  constructor (workspace: Workspace | Promise<Workspace>, tick: number, lastUse: number, state: 'ready' | 'suspended') {
    this.workspace = workspace
    this.tick = tick
    this.lastUse = lastUse
    this.state = state
  }

  async getWorkspace (): Promise<Workspace> {
    if (this.workspace instanceof Promise) {
      this.workspace = await this.workspace
    }
    return this.workspace
  }

  async suspend (): Promise<void> {
    const ws = await this.getWorkspace()
    if (this.state === 'ready') {
      this.workspace = ws.suspend().then(() => ws)
      await this.workspace
      this.state = 'suspended'
    }
  }

  async resume (): Promise<void> {
    const ws = await this.getWorkspace()
    if (this.state === 'suspended') {
      this.workspace = ws.resume().then(() => ws)
      await this.workspace
      this.state = 'ready'
    }
  }
}

export class NodeImpl implements Node {
  workspaces: Record<WorkspaceUuid, WorkspaceSession> = {}
  constructor (
    readonly _id: NodeUuid,
    readonly workspaceFactory: WorkspaceFactory,
    readonly workspaceDiscovery: WorkspaceDiscovery,
    readonly discovery: NodeManager,
    readonly tickManager: TickManager,
    readonly onClose?: () => Promise<void>
  ) {
    this.tickManager.register(async (tick, tps) => {
      this.handleWorkspaceClose(tick, tps)
    })
  }

  onClientBroadcast?: ClientBroadcast

  handleWorkspaceClose (tick: number, tps: number): void {
    const now = this.tickManager.now()
    for (const [wsid, { workspace, tick: wstick, lastUse }] of Object.entries(this.workspaces)) {
      if (tick % tps === wstick && !(workspace instanceof Promise)) {
        if (now - lastUse > timeouts.closeWorkspaceTimeout) {
          // Not used for 5 minutes, close it
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete this.workspaces[wsid as WorkspaceUuid]
          void workspace.suspend().catch()
        }
      }
    }
  }

  async workspace (workspaceId: WorkspaceUuid): Promise<WorkspaceSession> {
    let workspace = this.workspaces[workspaceId]
    if (workspace == null) {
      // Create and store the promise immediately to prevent race conditions
      const wrk = this.workspaceFactory(workspaceId)
      const tick = this.tickManager.nextHash()
      workspace = new WorkspaceSession(wrk, tick, this.tickManager.now(), 'ready')
      this.workspaces[workspaceId] = workspace
    }
    if (workspace.state === 'suspended') {
      await workspace.resume()
    }

    return workspace
  }

  async ask<T>(req: Request<T>, options?: NodeAskOptions): Promise<RequestAkn> {
    const result: RequestAkn = {
      workspaces: {}
    }
    const workspaces = options?.target ?? (await this.workspaceDiscovery.byAccount(req.account))

    const byNode = await this.groupWorkspaces(workspaces)

    // For self workspaces we need to resolve child workspaces.
    await this.includeChildWorkspaces(byNode, options)

    const promises: Array<Promise<void>> = []
    for (const [node, _workspaces] of byNode.entries()) {
      const workspaces = _workspaces.filter((ws) => req.workspaces[ws] == null)
      if (workspaces.length === 0) {
        continue
      }

      if (node === this._id) {
        const localWorkspaces = this.getFilteredWorkspaces(workspaces, options)

        for (const ws of localWorkspaces) {
          req.workspaces[ws] = this._id
          result.workspaces[ws] = this._id
        }

        void this.askLocal(req, localWorkspaces).catch((err) => {
          console.error('failed to ask local workspaces', err)
        })
      } else {
        const wrk = await this.discovery.node(node)
        promises.push(this.askTo(req, wrk, workspaces, result, options))
      }
    }
    await Promise.all(promises)
    return result
  }

  private getFilteredWorkspaces (workspaces: WorkspaceUuid[], options: NodeAskOptions | undefined): WorkspaceUuid[] {
    let localWorkspaces = workspaces
    if (options?.workspace !== undefined) {
      const wsSet = new Set<WorkspaceUuid>(options?.workspace)
      localWorkspaces = workspaces.filter((it) => wsSet.has(it))
    }
    return localWorkspaces
  }

  private async groupWorkspaces (workspaces: WorkspaceUuid[]): Promise<Map<NodeUuid, WorkspaceUuid[]>> {
    const byNode = new Map<NodeUuid, WorkspaceUuid[]>()
    for (const workspace of workspaces) {
      const node = await this.discovery.byWorkspace(workspace)
      byNode.set(node, (byNode.get(node) ?? []).concat(workspace))
    }
    return byNode
  }

  private async includeChildWorkspaces (
    byNode: Map<NodeUuid, WorkspaceUuid[]>,
    options?: NodeAskOptions
  ): Promise<void> {
    const selfWorkspace = byNode.get(this._id) ?? []
    if (selfWorkspace.length > 0) {
      let optionsSet: Set<WorkspaceUuid> | undefined
      if (options?.workspace !== undefined) {
        // We need to enhance options to include child workspaces
        optionsSet = new Set(options.workspace)
      }
      for (const ws of selfWorkspace) {
        const childWs = await this.workspaceDiscovery.byWorkspace(ws)
        if (options?.workspace !== undefined && optionsSet !== undefined && optionsSet.has(ws)) {
          options.workspace.push(...childWs)
        }
        for (const cws of childWs) {
          const node = await this.discovery.byWorkspace(cws)
          byNode.set(node, (byNode.get(node) ?? []).concat(cws))
        }
      }
    }
  }

  async askTo<T>(
    req: Request<T>,
    wrk: Node,
    workspaces: WorkspaceUuid[],
    result: RequestAkn,
    options?: NodeAskOptions
  ): Promise<void> {
    const response = await wrk.ask<T>(req, { ...options, target: workspaces })
    const localWorkspaces = new Set(
      this.getFilteredWorkspaces(Object.keys(response.workspaces) as WorkspaceUuid[], options)
    )
    if (localWorkspaces.size > 0) {
      for (const [ws, nodeId] of Object.entries(response.workspaces)) {
        if (!localWorkspaces.has(ws as WorkspaceUuid)) {
          continue
        }
        result.workspaces[ws as WorkspaceUuid] = nodeId
        req.workspaces[ws as WorkspaceUuid] = nodeId
      }
    }
  }

  async askLocal<T, V>(req: Request<T>, workspaces: WorkspaceUuid[]): Promise<void> {
    const targetNode = await this.discovery.byAccount(req.account)
    const target = targetNode === this._id ? this : await this.discovery.node(targetNode)
    for (const ws of workspaces) {
      const worker = await this.workspace(ws)
      const data = await (await worker.getWorkspace()).ask<T, V>(req)
      await target.broadcast([
        {
          _id: req._id,
          account: req.account,
          workspaceId: ws,
          nodeId: this._id,
          data
        }
      ])
    }
  }

  async modify<T, V>(workspaceId: WorkspaceUuid, req: Request<T>): Promise<ResponseValue<V>> {
    const wsNode = await this.discovery.byWorkspace(workspaceId)

    if (wsNode === this._id) {
      const wrk = await this.workspace(workspaceId)
      return await (await wrk.getWorkspace()).modify<T, V>(req)
    }
    const node = await this.discovery.node(wsNode)
    return await node.modify<T, V>(workspaceId, req)
  }

  async broadcast<T>(req: Array<Response<T>>): Promise<void> {
    const byAccount = groupByArray(req, (it) => it.account)
    for (const [account, values] of byAccount.entries()) {
      const nodeId = await this.discovery.byAccount(account)
      if (this._id === nodeId) {
        // Broadcast to local clients
        await this.onClientBroadcast?.(account, values)
      } else {
        // Broadcast to remote node
        const wrk = await this.discovery.node(nodeId)
        await wrk.broadcast(values)
      }
    }
  }

  async ping (workspaces: WorkspaceUuid[], processChildren: boolean): Promise<void> {
    const wsSet = new Set<WorkspaceUuid>(workspaces)

    if (processChildren) {
      const toProcess = Array.from(wsSet)

      while (toProcess.length > 0) {
        const ws = toProcess.pop()
        if (ws === undefined) {
          break
        }
        const childWs = await this.workspaceDiscovery.byWorkspace(ws)
        for (const cws of childWs) {
          if (!wsSet.has(cws)) {
            wsSet.add(cws)
            toProcess.push(cws)
          }
        }
      }
    }

    const byNode = await this.groupWorkspaces(Array.from(wsSet))

    for (const [node, workspaces] of byNode.entries()) {
      if (node === this._id) {
        // Ping local workspaces
        for (const ws of workspaces) {
          const wrk = await this.workspace(ws)
          wrk.lastUse = this.tickManager.now()
        }
      } else {
        const wrk = await this.discovery.node(node)
        await wrk.ping(workspaces, false)
      }
    }
  }

  async close (): Promise<void> {
    for (const { workspace } of Object.values(this.workspaces)) {
      if (workspace instanceof Promise) {
        await workspace.then(async (w) => {
          await w.close()
        })
      } else {
        await workspace.close()
      }
    }
    await this.onClose?.()
  }
}

export class NodeManagerImpl implements NodeManager {
  nodes: Record<NodeUuid, Node | Promise<Node>> = {}
  constructor (
    private readonly nodeFactory: NodeFactory,
    readonly discover: NodeDiscovery
  ) {}

  async node (node: NodeUuid): Promise<Node> {
    let wrk = this.nodes[node]
    if (wrk instanceof Promise) {
      wrk = await wrk
    }
    if (wrk == null) {
      wrk = this.nodeFactory(node)
      this.nodes[node] = wrk
      try {
        wrk = await wrk
        this.nodes[node] = wrk
      } catch (err: any) {
        console.error('Error creating worker for node', node, err)
        throw err
      }
    }
    return wrk
  }

  async close (): Promise<void> {
    for (const wrk of Object.values(this.nodes)) {
      if (wrk instanceof Promise) {
        await wrk.then(async (w) => {
          await w.close()
        })
      } else {
        await wrk.close()
      }
    }
    this.nodes = {}
  }

  byAccount: (account: AccountUuid) => Promise<NodeUuid> = async (account) => {
    return await this.discover.byAccount(account)
  }

  byWorkspace: (workspace: WorkspaceUuid) => Promise<NodeUuid> = async (workspace) => {
    return await this.discover.byWorkspace(workspace)
  }

  list: () => Iterable<NodeUuid> = () => {
    return this.discover.list()
  }

  stats: (node: NodeUuid) => Promise<NodeData> = async (node) => {
    return await this.discover.stats(node)
  }
}
