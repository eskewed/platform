import type { WorkspaceFactory } from '../api/node'
import { type NodeImpl } from '../node/node'
import type { SessionManagerImpl } from '../node/session'
import { DummyWorkspace } from './dummy'
import { nodes, simpleDiscovery, users, workspaces, wsDiscovery } from './samples'
import { prepare } from './utils'

describe('node-ask', () => {
  const wsFactory: WorkspaceFactory = async (workspaceId) => new DummyWorkspace(workspaceId)

  it('check ask for all workspaces', async () => {
    const { sessionManager } = await prepare(wsFactory, wsDiscovery, simpleDiscovery, nodes.node2)
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
    const { sessionManager } = await prepare(wsFactory, wsDiscovery, simpleDiscovery, nodes.node2)
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
    const { sessionManager } = await prepare(wsFactory, wsDiscovery, simpleDiscovery, nodes.node2)
    const client1 = await sessionManager.register(users.user1, 's1')

    const helloResp = await client1.ask('hello', { workspace: [workspaces.ws7] })

    expect(helloResp.value.map((it) => it)).toEqual(['hello from ws7'])
  })
  it('check ask for childs of child workspaces', async () => {
    const { sessionManager } = await prepare(wsFactory, wsDiscovery, simpleDiscovery, nodes.node2)
    const client1 = await sessionManager.register(users.user1, 's1')

    const helloResp = await client1.ask('hello', { workspace: [workspaces.ws8] })

    expect(helloResp.value.map((it) => it)).toEqual(['hello from ws10', 'hello from ws8', 'hello from ws9'])
  })

  it('check modify ws1', async () => {
    const { sessionManager, manager } = await prepare(wsFactory, wsDiscovery, simpleDiscovery, nodes.node2)
    const client1 = await sessionManager.register(users.user1, 's1')

    await client1.modify(workspaces.ws1, { action: 'add', data: 'h1' })
    const node4: NodeImpl = (await manager.node(nodes.node4)) as NodeImpl
    expect(node4.workspaces[workspaces.ws1]).toBeDefined()

    expect((node4.workspaces[workspaces.ws1].workspace as DummyWorkspace).data.includes('h1')).toBeTruthy()
    const helloResp = await client1.ask('hello', { workspace: [workspaces.ws1] })
    expect(helloResp.value.map((it) => it)).toEqual([
      'hello from ws1',
      'h1',
      'hello from ws10',
      'hello from ws7',
      'hello from ws8',
      'hello from ws9'
    ])
  })
  it('check modify ws9', async () => {
    const { sessionManager } = await prepare(wsFactory, wsDiscovery, simpleDiscovery, nodes.node2)
    const client1 = await sessionManager.register(users.user1, 's1')

    await client1.modify(workspaces.ws9, { action: 'add', data: 'h9' })
    const helloResp = await client1.ask('hello', { workspace: [workspaces.ws1] })
    expect(helloResp.value.map((it) => it)).toEqual([
      'hello from ws1',
      'hello from ws10',
      'hello from ws7',
      'hello from ws8',
      'hello from ws9',
      'h9'
    ])
  })
  it('check register to wrong node', async () => {
    const { sessionManager } = await prepare(wsFactory, wsDiscovery, simpleDiscovery, nodes.node1)
    await expect(sessionManager.register(users.user1, 's1')).rejects.toThrow(
      'Invalid host node for account user1, expected node1, got node2'
    )
  })
  it('check broadcast', async () => {
    const { sessionManager, manager } = await prepare(wsFactory, wsDiscovery, simpleDiscovery, nodes.node2)
    const client1 = await sessionManager.register(users.user1, 's1')

    client1.onBroadcast = (response) => {
      expect(response.data.value[0]).toBe('broadcasted1')
    }

    const node5 = await manager.node(nodes.node5)

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

  it('check broadcast', async () => {
    const { sessionManager, manager } = await prepare(wsFactory, wsDiscovery, simpleDiscovery, nodes.node2)
    const client1 = await sessionManager.register(users.user1, 's1')

    client1.onBroadcast = (response) => {
      expect(response.data.value[0]).toBe('broadcasted1')
    }

    const node5 = await manager.node(nodes.node5)

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

  it('check warmup', async () => {
    const { sessionManager, manager } = await prepare(wsFactory, wsDiscovery, simpleDiscovery, nodes.node2)
    await sessionManager.register(users.user1, 's1')
    await (sessionManager as SessionManagerImpl).waitWarmups()
    expect(Object.keys(((await manager.node(nodes.node1)) as NodeImpl).workspaces)).toEqual(['ws3', 'ws8'])
    expect(Object.keys(((await manager.node(nodes.node2)) as NodeImpl).workspaces)).toEqual(['ws9', 'ws10'])
    expect(Object.keys(((await manager.node(nodes.node4)) as NodeImpl).workspaces)).toEqual(['ws1'])
    expect(Object.keys(((await manager.node(nodes.node5)) as NodeImpl).workspaces)).toEqual(['ws2', 'ws7'])
  })

  it('check suspend/resume', async () => {
    const { sessionManager, manager } = await prepare(wsFactory, wsDiscovery, simpleDiscovery, nodes.node2)
    await sessionManager.register(users.user1, 's1')
    await (sessionManager as SessionManagerImpl).waitWarmups()
    expect(Object.keys(((await manager.node(nodes.node1)) as NodeImpl).workspaces)).toEqual(['ws3', 'ws8'])
    expect(Object.keys(((await manager.node(nodes.node2)) as NodeImpl).workspaces)).toEqual(['ws9', 'ws10'])
    expect(Object.keys(((await manager.node(nodes.node4)) as NodeImpl).workspaces)).toEqual(['ws1'])
    expect(Object.keys(((await manager.node(nodes.node5)) as NodeImpl).workspaces)).toEqual(['ws2', 'ws7'])
  })
})
