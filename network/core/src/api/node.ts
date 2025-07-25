import type { AskOptions } from './client'
import type { NodeDiscovery } from './discovery'
import type { Request, RequestAkn, Response, ResponseValue } from './request'
import type { NodeUuid, WorkspaceUuid } from './types'

export interface NodeAskOptions extends AskOptions {
  target?: WorkspaceUuid[]
}

export interface Node {
  _id: NodeUuid

  ask: <T>(req: Request<T>, options?: NodeAskOptions) => Promise<RequestAkn>

  modify: <T, V>(workspaceId: WorkspaceUuid, req: Request<T>) => Promise<ResponseValue<V>>

  ping: (workspaces: WorkspaceUuid[], processChildren: boolean) => Promise<void>

  /**
   * Inform clients about some request/Response
   */
  broadcast: <T>(req: Array<Response<T>>) => Promise<void>

  close: () => Promise<void>
}

export interface NodeManager extends NodeDiscovery {
  node: (node: NodeUuid) => Promise<Node>
}

export type NodeFactory = (node: NodeUuid) => Promise<Node>

export interface Workspace {
  _id: WorkspaceUuid

  ask: <T, V>(req: Request<T>) => Promise<ResponseValue<V>>

  modify: <T, V>(req: Request<T>) => Promise<ResponseValue<V>>

  suspend: () => Promise<void> // Suspend any system resources, be ready for a resume before any new requests.

  resume: () => Promise<void> // A restore state and be able to respond for user actions.

  close: () => Promise<void>
}

export type WorkspaceFactory = (workspaceId: WorkspaceUuid) => Promise<Workspace>
