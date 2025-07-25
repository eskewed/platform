import {
  SessionManagerImpl,
  StaticNodeDiscovery,
  type Node,
  type NodeImpl,
  type WorkspaceFactory
} from '@hcengineering/network'
import type { ZMQNodeData } from '../types'

import { TickManagerImpl } from '@hcengineering/network'
import type { SessionManager } from '@hcengineering/network/types/api/client'
import { createZMQNode } from '../node'
import { DummyWorkspace } from './dummy'
import { nodes, users, workspaces, wsDiscovery } from './samples'

describe('test zeromq nodes', () => {
  const host = 'localhost'
  const port = [3561, 3562, 3563, 3564, 3565]

  const zmqSimpleDiscovery = new StaticNodeDiscovery<ZMQNodeData>([
    [nodes.node1, { host: '0.0.0.0', port: port[0] }],
    [nodes.node2, { host: '0.0.0.0', port: port[1] }],
    [nodes.node3, { host: '0.0.0.0', port: port[2] }],
    [nodes.node4, { host: '0.0.0.0', port: port[3] }],
    [nodes.node5, { host: '0.0.0.0', port: port[4] }]
  ])

  const _nodes: Node[] = []
  const tickManager = new TickManagerImpl(20)

  const wsFactory: WorkspaceFactory = async (workspaceId) => new DummyWorkspace(workspaceId)
  let sessionManager: SessionManager

  beforeAll(async () => {
    _nodes.push(
      await createZMQNode(nodes.node1, host, port[0], zmqSimpleDiscovery, wsDiscovery, wsFactory, tickManager)
    )
    _nodes.push(
      await createZMQNode(nodes.node2, host, port[1], zmqSimpleDiscovery, wsDiscovery, wsFactory, tickManager)
    )
    _nodes.push(
      await createZMQNode(nodes.node3, host, port[2], zmqSimpleDiscovery, wsDiscovery, wsFactory, tickManager)
    )
    _nodes.push(
      await createZMQNode(nodes.node4, host, port[3], zmqSimpleDiscovery, wsDiscovery, wsFactory, tickManager)
    )
    _nodes.push(
      await createZMQNode(nodes.node5, host, port[4], zmqSimpleDiscovery, wsDiscovery, wsFactory, tickManager)
    )
    sessionManager = new SessionManagerImpl(_nodes[1] as NodeImpl, tickManager, wsDiscovery, zmqSimpleDiscovery)
  })

  afterAll(async () => {
    for (const node of _nodes) {
      await node.close()
    }
    sessionManager?.close()
  })

  it('test node client', async () => {
    const client1 = await sessionManager.register(users.user1, 's1')
    const helloResp = await client1.ask('hello')

    expect(helloResp.value.map((it) => it)).toEqual([
      'hello from ws1',
      'hello from ws10',
      'hello from ws2',
      'hello from ws3',
      'hello from ws7',
      'hello from ws8',
      'hello from ws9'
    ])
  })
  it('check ask for selected ws and all childs', async () => {
    const client1 = await sessionManager.register(users.user1, 's1')

    const helloResp = await client1.ask('hello', { workspace: [workspaces.ws1] })

    expect(helloResp.value.map((it) => it)).toEqual([
      'hello from ws1',
      'hello from ws10',
      'hello from ws7',
      'hello from ws8',
      'hello from ws9'
    ])
  })
  it('check ask for single child ws of ws', async () => {
    const client1 = await sessionManager.register(users.user1, 's1')

    const helloResp = await client1.ask('hello', { workspace: [workspaces.ws7] })

    expect(helloResp.value.map((it) => it)).toEqual(['hello from ws7'])
  })
  it('check ask for childs of child workspaces', async () => {
    const client1 = await sessionManager.register(users.user1, 's1')

    const helloResp = await client1.ask('hello', { workspace: [workspaces.ws8] })

    expect(helloResp.value.map((it) => it)).toEqual(['hello from ws10', 'hello from ws8', 'hello from ws9'])
  })

  it('check broadcast', async () => {
    const client1 = await sessionManager.register(users.user1, 's1')

    client1.onBroadcast = (response) => {
      expect(response.data.value[0]).toBe('broadcasted1')
    }

    const node5 = _nodes[4]

    await node5.broadcast([
      {
        account: users.user1,
        data: { value: ['broadcasted1'], total: 1 },
        _id: undefined,
        nodeId: nodes.node5,
        workspaceId: workspaces.ws1
      }
    ])
  })
})
