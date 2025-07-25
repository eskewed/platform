import type { NodeData, NodeDiscovery, WorkspaceDiscovery } from '../api/discovery'
import type { AccountUuid, NodeUuid, WorkspaceUuid } from '../api/types'

/**
 * Returns a hash code for a string.
 * (Compatible to Java's String.hashCode())
 *
 * The hash code for a string object is computed as
 *     s[0]*31^(n-1) + s[1]*31^(n-2) + ... + s[n-1]
 * using number arithmetic, where s[i] is the i th character
 * of the given string, n is the length of the string,
 * and ^ indicates exponentiation.
 * (The hash value of the empty string is zero.)
 *
 */
function hashName (name: string): number {
  return [...name].reduce((hash, c) => (Math.imul(31, hash) + c.charCodeAt(0)) | 0, 0)
}

export class StaticNodeDiscovery<T extends NodeData = NodeData> implements NodeDiscovery<T> {
  constructor (private readonly nodes: Array<[NodeUuid, T]>) {}
  async byWorkspace (workspace: WorkspaceUuid): Promise<NodeUuid> {
    const hcode = hashName(workspace)
    const node = this.nodes[Math.abs(hcode) % this.nodes.length] // This is a simple hash-based selection
    return await Promise.resolve(node[0])
  }

  async byAccount (account: AccountUuid): Promise<NodeUuid> {
    const hcode = hashName(account)
    const node = this.nodes[Math.abs(hcode) % this.nodes.length] // This is a simple hash-based selection
    return await Promise.resolve(node[0])
  }

  list (): Iterable<NodeUuid> {
    return this.nodes.map(([id]) => id)
  }

  async stats (node: NodeUuid): Promise<T> {
    const found = this.nodes.find(([id]) => id === node)
    if (found == null) {
      throw new Error(`Node ${node} not found`)
    }
    return found[1]
  }
}

export class StaticWorkspaceDiscovery implements WorkspaceDiscovery {
  constructor (private readonly workspaces: Record<WorkspaceUuid | AccountUuid, WorkspaceUuid[]>) {}

  async byAccount (account: AccountUuid): Promise<WorkspaceUuid[]> {
    return this.workspaces[account] ?? []
  }

  async byWorkspace (workspace: WorkspaceUuid): Promise<WorkspaceUuid[]> {
    return this.workspaces[workspace] ?? []
  }
}
