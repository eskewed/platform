import type {
  AgentRecord,
  AgentUuid,
  ConnectionManager,
  ContainerConnection,
  ContainerEndpointRef,
  ContainerEvent,
  ContainerKind,
  ContainerRecord,
  ContainerUuid,
  Network,
  NetworkAgent,
  RequestData,
  StartRequest
} from '../api/net'
import type { ContainerRecordImpl } from './types'

interface AgentRecordImpl {
  api: NetworkAgent
  containers: Map<ContainerUuid, ContainerRecordImpl>

  lastSeen: number // Last time when agent was seen
}

export class NetworkImpl implements Network {
  idx: number = 0

  _agents = new Map<AgentUuid, AgentRecordImpl>()

  _containers = new Map<ContainerUuid, AgentUuid>()

  constructor (readonly cntMgr: ConnectionManager) {}

  agents (): AgentRecord[] {
    return Array.from(
      this._agents.values().map(({ api, containers }) => ({
        agentId: api.uuid,
        containers: Object.values(containers).map(({ record }) => record)
      }))
    )
  }

  kinds (): ContainerKind[] {
    return Array.from(
      this._agents
        .values()
        .map((it) => it.api.kinds)
        .flatMap((it) => it)
    )
  }

  list (kind: ContainerKind): ContainerRecord[] {
    return Array.from(this._agents.values())
      .flatMap((it) => Array.from(it.containers.values()))
      .filter((it) => it.record.kind === kind)
      .map((it) => it.record)
  }

  async send (target: ContainerUuid, data: RequestData): Promise<void> {
    const agentId = this._containers.get(target)
    if (agentId === undefined) {
      throw new Error(`Container ${target} not found`)
    }
    const agent = this._agents.get(agentId)
    if (agent === undefined) {
      throw new Error(`Agent ${agentId} not found for container ${target}`)
    }
    const container = agent.containers.get(target)
    if (container === undefined) {
      throw new Error(`Container ${target} not registered on agent ${agentId}`)
    }
    await agent.api.send(target, data)
  }

  async register (uuid: AgentUuid, agent: NetworkAgent, containers: ContainerRecord[]): Promise<ContainerUuid[]> {
    const newContainers = new Map<ContainerUuid, ContainerRecordImpl>(
      containers.map((record) => [
        record.uuid,
        {
          record,
          endpoint: record.endpoint
        }
      ])
    )

    const containerEvent: ContainerEvent = {
      added: [],
      deleted: [],
      updated: []
    }

    // Register agent record
    const oldAgent = this._agents.get(uuid)
    if (oldAgent !== undefined) {
      oldAgent.api = agent // Just update API, in case of reconnect.
      oldAgent.lastSeen = Date.now()
      // Check if some of container changed endpoints.
      for (const rec of containers) {
        const oldRec = oldAgent.containers.get(rec.uuid)
        if (oldRec !== undefined) {
          if (oldRec.record.endpoint !== rec.endpoint) {
            oldRec.endpoint = rec.endpoint // Update endpoint
            containerEvent.updated.push(rec)
          }
        }
      }
      // Handle remove of containers
      for (const oldC of oldAgent.containers.values()) {
        if (newContainers.get(oldC.record.uuid) === undefined) {
          containerEvent.deleted.push(oldC.record)
          this._containers.delete(oldC.record.uuid) // Remove from active container registry
        }
      }
    }

    const containersToShutdown: ContainerUuid[] = []

    // Update active container registry.
    for (const rec of containers) {
      const oldAgentId = this._containers.get(rec.uuid)
      if (oldAgentId === undefined) {
        containerEvent.added.push(rec)
        this._containers.set(rec.uuid, uuid)
      }
      if (oldAgentId !== uuid) {
        containersToShutdown.push(rec.uuid)
      }
    }

    // update agent record

    this._agents.set(uuid, {
      api: agent,
      containers: newContainers,
      lastSeen: Date.now()
    })

    void this.sendEvent(containerEvent)

    // Send notification to all agents about containers update.
    return containersToShutdown
  }

  async sendEvent (event: ContainerEvent): Promise<void> {
    for (const agent of Object.values(this._agents)) {
      if (agent.api.onContainer !== undefined) {
        try {
          await agent.api.onContainer(event)
        } catch (err: any) {
          console.error(`Error in agent ${agent.api.uuid} onContainer callback:`, err)
        }
      }
    }
  }

  async get (uuid: ContainerUuid, request: StartRequest): Promise<ContainerEndpointRef> {
    const existing = this._containers.get(uuid)
    if (existing !== undefined) {
      const containerImpl = this._agents.get(existing)?.containers?.get(uuid)
      if (containerImpl !== undefined) {
        if (containerImpl.endpoint instanceof Promise) {
          return await containerImpl.endpoint
        }
        return containerImpl.endpoint
      }
    }
    // Select agent using round/robin and register it in agent
    const agent = Array.from(this._agents.values())[++this.idx % this._agents.size]

    const record: ContainerRecordImpl = {
      record: {
        uuid,
        agentId: agent.api.uuid,
        state: 'stopped',
        kind: request.kind,
        lastVisit: Date.now(),
        endpoint: '' as ContainerEndpointRef // Placeholder, will be updated later
      },
      endpoint: agent.api.get(uuid, request)
    }
    agent.containers.set(uuid, record)
    this._containers.set(uuid, agent.api.uuid)

    // Wait for endpoint to be established
    try {
      const endpointRef = await record.endpoint
      record.endpoint = endpointRef
      record.record.state = 'active'
      await this.sendEvent({
        added: [record.record],
        deleted: [],
        updated: []
      })
      return endpointRef
    } catch (err: any) {
      record.record.state = 'error'
      this._containers.delete(uuid) // Remove from active container registry
      throw new Error(`Failed to get endpoint for container ${uuid}: ${err.message}`)
    }
  }

  async terminate (uuid: ContainerUuid): Promise<void> {
    const containerAgent = this._containers.get(uuid)
    if (containerAgent == null) {
      return
    }

    const agent = this._agents.get(containerAgent)
    if (agent == null) {
      return
    }

    const container = agent.containers.get(uuid)
    if (container == null) {
      return
    }
    this._containers.delete(uuid) // Remove from active container registry
    container.record.state = 'stopped'
    await Promise.all([
      agent.api.terminate(uuid),
      this.sendEvent({
        added: [],
        deleted: [container.record],
        updated: []
      })
    ])
    agent.containers.delete(uuid)
  }

  async connect (uuid: ContainerUuid): Promise<ContainerConnection> {
    const containerAgent = this._containers.get(uuid)
    if (containerAgent == null) {
      throw new Error(`Container ${uuid} not found in active registry`)
    }

    const agent = this._agents.get(containerAgent)
    if (agent == null) {
      throw new Error(`Agent for container ${uuid} not found`)
    }

    const container = agent.containers.get(uuid)
    if (container == null) {
      throw new Error(`Container ${uuid} not found in agent ${containerAgent}`)
    }
    if (container.endpoint instanceof Promise) {
      container.endpoint = await container.endpoint
    }
    return await this.cntMgr.connect(container.endpoint)
  }
}
