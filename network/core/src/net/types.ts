import type { ContainerEndpointRef, ContainerKind, ContainerRecord, ContainerState, ContainerUuid, RequestData } from '../api/net'

export interface Container {
  uuid: ContainerUuid

  kind: ContainerKind

  lastVisit: number

  state: ContainerState
  endpoint: ContainerEndpointRef

  send: (data: RequestData) => Promise<RequestData>

  onState?: (state: ContainerState) => void

  terminate: () => Promise<void>

  ping: () => Promise<void>
}

export type ContainerFactory = (uuid: ContainerUuid) => Promise<Container>

export interface ContainerRecordImpl {
  record: ContainerRecord
  endpoint: ContainerEndpointRef | Promise<ContainerEndpointRef>
}
