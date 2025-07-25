import type { AccountUuid, NodeUuid, WorkspaceUuid } from './types'

export type RequestId = string & { __requestId: true }

export interface Request<T = any> {
  _id: RequestId
  account: AccountUuid

  // Workspace filter
  workspace?: WorkspaceUuid | WorkspaceUuid[]

  workspaces: Record<WorkspaceUuid, NodeUuid> // A list of already processed workspaces.
  data: T
}

export interface RequestAkn {
  // A list of nodes we need to retrieve data from, or retry to ask again if required.
  workspaces: Record<WorkspaceUuid, NodeUuid>
}

export interface ResponseValue<T> {
  value: T[]
  total: number
}

export interface Response<T = any> {
  _id: RequestId | undefined
  account: AccountUuid

  nodeId: NodeUuid
  workspaceId: WorkspaceUuid
  data: ResponseValue<T>
}
