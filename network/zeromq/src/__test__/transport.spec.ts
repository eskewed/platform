import { StaticNodeDiscovery, type AccountUuid, type NodeUuid } from '@hcengineering/network'
import { ZMQClientPublisher, ZMQClientTransport, ZMQServerTransport } from '../transport'
import type { ZMQNodeData } from '../types'

import { nodes } from './samples'

describe('test zeromq transport', () => {
  const host = 'localhost'
  const port = [3555, 3556]
  const publisherPort = [3557]

  const node1 = nodes.node1
  const node2 = nodes.node2

  let node1Transport: ZMQServerTransport
  let node1Publisher: ZMQClientPublisher
  let node2Transport: ZMQServerTransport
  let clientTransport: ZMQClientTransport

  const discovery = new StaticNodeDiscovery<ZMQNodeData>([
    [node1, { host, port: port[0] }],
    [node2, { host, port: port[1] }]
  ])

  beforeAll(async () => {
    node1Publisher = new ZMQClientPublisher(host, publisherPort[0])
    node1Transport = new ZMQServerTransport(
      'node1' as NodeUuid,
      discovery,
      async (sendResponse, clientId, reqId, body) => {
        await sendResponse(body)
      },
      (client, req, body) => node1Publisher.send(client, req, body),
      { host, port: port[0] }
    )
    node2Transport = new ZMQServerTransport(
      'node2' as NodeUuid,
      discovery,
      async (sendResponse, clientId, reqId, body) => {
        await sendResponse(body)
      },
      undefined,
      { host, port: port[1] }
    )

    await node1Transport.start()
    await node1Publisher.start()
    await node2Transport.start()

    clientTransport = new ZMQClientTransport(host, port[0], publisherPort[0], async (clientId, reqId, body) => {
      // Handle incoming responses
      console.log(`Received response for ${clientId} with reqId ${reqId}:`, body)
    })
  })

  afterAll(async () => {
    await node1Transport?.close()
    await node1Publisher?.close()
    await node2Transport?.close()
    await clientTransport?.close()
  })

  it('should send and receive messages', async () => {
    const clientId = 'test-client' as AccountUuid
    const body = { message: 'Hello, ZeroMQ!' }

    const s = performance.now()
    const count = 1000
    for (let i = 0; i < count; i++) {
      // Send a request from the client
      const response = await clientTransport.request(clientId, body)
      expect(JSON.stringify(response)).toBe(JSON.stringify(body))
    }
    const e = performance.now()
    console.log(`Time taken for ${count} requests: ${Math.round(((e - s) * 100) / count) / 100} ms`)
  })

  it('should send and receive node messages', async () => {
    const body = { message: 'Hello, ZeroMQ!' }

    const s = performance.now()
    const count = 1000
    for (let i = 0; i < count; i++) {
      // Send a request from the client
      const response = await node1Transport.request(node2, body)
      expect(JSON.stringify(response)).toBe(JSON.stringify(body))
    }
    const e = performance.now()
    console.log(`Time taken for ${count} requests: ${Math.round(((e - s) * 100) / count) / 100} ms`)
  })
})
