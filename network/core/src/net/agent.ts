import type { AgentUuid, ContainerEndpointRef, ContainerEvent, ContainerKind, ContainerRecord, ContainerUuid, NetworkAgent, RequestData, StartRequest } from '../api/net'
import type { Container } from './types'

export class AgentImpl implements NetworkAgent {
  // Own, managed containers
  _containers = new Map<ContainerUuid, Container | Promise<Container>>()

  // A global container registry info
  _globalContainers = new Map<ContainerUuid, ContainerRecord>()

  constructor (readonly uuid: AgentUuid, readonly factory: Record<ContainerKind, () => Promise<Container>>) {
  }

  async onContainer (event: ContainerEvent): Promise<void> {
    event.added.forEach((it) => {
      this._globalContainers.set(it.uuid, it)
    })
    event.deleted.forEach((it) => {
      this._globalContainers.delete(it.uuid)
    })
    event.updated.forEach((it) => {
      this._globalContainers.set(it.uuid, it)
    })
  }

  async list (kind: ContainerKind): Promise<ContainerRecord[]> {
    return Array.from(this._containers.values())
      .filter((it) => !(it instanceof Promise) && it.kind === kind)
      .map((it) => ({
        agentId: this.uuid,
        uuid: (it as Container).uuid,
        state: (it as Container).state,
        endpoint: (it as Container).endpoint,
        kind: (it as Container).kind,
        lastVisit: (it as Container).lastVisit
      }))
  }

  get kinds (): ContainerKind[] {
    return Object.keys(this.factory) as ContainerKind[]
  }

  async getContainer (uuid: ContainerUuid): Promise<Container | undefined> {
    let current = this._containers.get(uuid)
    if (current instanceof Promise) {
      current = await current
      this._containers.set(uuid, current)
    }
    return current
  }

  async get (uuid: ContainerUuid, request: StartRequest): Promise<ContainerEndpointRef> {
    const current = await this.getContainer(uuid)
    if (current !== undefined) {
      return current.endpoint
    }

    let container: Container | Promise<Container> = this.factory[request.kind]()
    this._containers.set(uuid, container)
    container = await container
    this._containers.set(uuid, container)

    return container.endpoint
  }

  async terminate (uuid: ContainerUuid): Promise<void> {
    const current = await this.getContainer(uuid)
    this._containers.delete(uuid)
    this._globalContainers.delete(uuid)
    await current?.terminate()
  }

  async send (target: ContainerUuid, data: RequestData): Promise<void> {
    await (await this.getContainer(target))?.send(data)
  }

  async ping (uuid: ContainerUuid): Promise<void> {
    const container = await this.getContainer(uuid)
    if (container === undefined || container.state === 'stopped' || container.state === 'error') {
      throw new Error(`Container ${uuid} is not active`)
    }
    await container.ping()
  }
}
