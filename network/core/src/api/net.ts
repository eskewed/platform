export type ContainerUuid = string & { _containerUuid: true }
export type ContainerKind = string & { _containerKind: true }
export type AgentUuid = string & { _networkAgentUuid: true }
export type ContainerEndpointRef = string & { _containerEndpointRef: true }

export type ContainerState = | 'active' | 'stopped' | 'error'

export interface ContainerRecord {
  agentId: AgentUuid
  uuid: ContainerUuid
  state: ContainerState
  kind: ContainerKind
  endpoint: ContainerEndpointRef
  lastVisit: number // Last time when container was visited
}

export interface AgentRecord {
  agentId: AgentUuid
  // A change to containers
  containers: ContainerRecord[]
}

export interface StartRequest {
  kind: ContainerKind
  extra?: Record<string, any> // Extra parameters for container start
}

export type RequestData = string | ArrayBufferLike

export interface ConnectionManager {
  connect: (endpoint: ContainerEndpointRef) => Promise<ContainerConnection>
}

/**
 * Interface to Huly network.
 */
export interface Network {
  /*
  * Registe or reregister agent in network.
  * On every network restart agent should reconnect to network.
  */
  register: (uuid: AgentUuid, agent: NetworkAgent, containers: ContainerRecord[]) => Promise<ContainerUuid[]>

  agents: () => AgentRecord[]

  // A full uniq set of supported container kinds.
  kinds: () => ContainerKind[]

  // Establish a recoverable connection to endpoint.
  connect: (uuid: ContainerUuid) => Promise<ContainerConnection>

  /*
  * Get/Start of required container kind on agent
  * Will start a required container on agent, if not already started.
  */
  get: (uuid: ContainerUuid, request: StartRequest) => Promise<ContainerEndpointRef>

  list: (kind: ContainerKind) => ContainerRecord[]

  // Send some data to container, using proxy connection.
  send: (target: ContainerUuid, data: RequestData) => Promise<void>

  // ask for immediate termination for container
  terminate: (uuid: ContainerUuid) => Promise<void>
}

export interface ContainerEvent {
  added: ContainerRecord[]
  deleted: ContainerRecord[]
  updated: ContainerRecord[]
}

export interface NetworkAgent {
  uuid: AgentUuid

  // A supported set of container kinds supported to be managed by the agent
  kinds: ContainerKind[]

  // Inform agent about other container events
  onContainer: (event: ContainerEvent) => Promise<void>

  // event handled from agent to network events.
  onUpdate?: (event: ContainerEvent) => Promise<void>

  // Agent will inform this callback when it is still alive.
  onAlive?: () => void

  // Get/Start of required container kind on agent
  get: (uuid: ContainerUuid, request: StartRequest) => Promise<ContainerEndpointRef>

  list: (kind: ContainerKind) => Promise<ContainerRecord[]>

  // Send some data to container
  send: (target: ContainerUuid, data: RequestData) => Promise<void>

  // ask for immediate termination for container
  terminate: (uuid: ContainerUuid) => Promise<void>

  // ping container for being still used.
  ping: (uuid: ContainerUuid) => Promise<void>
}

// A request/reponse interface to container.
export interface ContainerConnection {
  send: (data: RequestData) => Promise<RequestData>

  // broadcast events.
  on?: (data: RequestData) => Promise<void>
}
