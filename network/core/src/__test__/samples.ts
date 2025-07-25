import type { AccountUuid, NodeUuid, WorkspaceUuid } from '../api/types'
import { StaticNodeDiscovery, StaticWorkspaceDiscovery } from '../discovery/static'

export const workspaces = {
  ws1: 'ws1' as WorkspaceUuid,
  ws2: 'ws2' as WorkspaceUuid,
  ws3: 'ws3' as WorkspaceUuid,
  ws4: 'ws4' as WorkspaceUuid,
  ws5: 'ws5' as WorkspaceUuid,
  ws6: 'ws6' as WorkspaceUuid,
  ws7: 'ws7' as WorkspaceUuid,
  ws8: 'ws8' as WorkspaceUuid,
  ws9: 'ws9' as WorkspaceUuid,
  ws10: 'ws10' as WorkspaceUuid
}

export const users = {
  user1: 'user1' as AccountUuid,
  user2: 'user2' as AccountUuid
}

export const nodes = {
  node1: 'node1' as NodeUuid,
  node2: 'node2' as NodeUuid,
  node3: 'node3' as NodeUuid,
  node4: 'node4' as NodeUuid,
  node5: 'node5' as NodeUuid
}

export const simpleDiscovery = new StaticNodeDiscovery([
  [nodes.node1, {}],
  [nodes.node2, {}],
  [nodes.node3, {}],
  [nodes.node4, {}],
  [nodes.node5, {}]
])

export const wsDiscovery = new StaticWorkspaceDiscovery({
  [users.user1]: [workspaces.ws1, workspaces.ws2, workspaces.ws3],
  [users.user2]: [workspaces.ws4, workspaces.ws5, workspaces.ws6],
  [workspaces.ws1]: [workspaces.ws7, workspaces.ws8],
  [workspaces.ws8]: [workspaces.ws9, workspaces.ws10]
})
