import type { SessionManager } from '../api/client'
import type { NodeFactory, NodeManager, WorkspaceFactory } from '../api/node'
import type { NodeUuid } from '../api/types'
import type { StaticNodeDiscovery, StaticWorkspaceDiscovery } from '../discovery/static'
import { NodeImpl, NodeManagerImpl } from '../node/node'
import { SessionManagerImpl } from '../node/session'
import { TickManagerImpl } from '../utils'

export async function prepare (
  wsFactory: WorkspaceFactory,
  wsDiscovery: StaticWorkspaceDiscovery,
  simpleDiscovery: StaticNodeDiscovery,
  localNodeId: NodeUuid
): Promise<{ sessionManager: SessionManager, manager: NodeManager }> {
  const workerFactory: NodeFactory = async (nodeId) => {
    return new NodeImpl(nodeId, wsFactory, wsDiscovery, manager, new TickManagerImpl(20))
  }

  const manager = new NodeManagerImpl(workerFactory, simpleDiscovery)

  const localNode = await manager.node(localNodeId)

  const sessionManager = new SessionManagerImpl(
    localNode as NodeImpl,
    new TickManagerImpl(20),
    wsDiscovery,
    simpleDiscovery
  )

  return { sessionManager, manager }
}
