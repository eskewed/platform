import type { Workspace } from '../api/node'
import type { Request, ResponseValue } from '../api/request'
import type { WorkspaceUuid } from '../api/types'

export class DummyWorkspace implements Workspace {
  _id: WorkspaceUuid

  data: any[]

  constructor (id: WorkspaceUuid) {
    this._id = id
    this.data = [`hello from ${this._id}`]
  }

  async ask<T, V>(req: Request<T>): Promise<ResponseValue<V>> {
    return { value: this.data, total: 1 }
  }

  async modify (req: Request<any>): Promise<ResponseValue<any>> {
    if (req.data.action === 'broadcast') {
      // Simulate broadcasting by adding to the workspace data
      this.data.push(`broadcasted: ${req.data.data}`)
      return { value: this.data, total: 1 }
    }
    if (req.data.action === 'add') {
      // Simulate adding data to the workspace
      this.data.push(req.data.data)
      return { value: this.data, total: 1 }
    }
    return { value: ['done', this._id], total: 0 }
  }

  async suspend (): Promise<void> {}

  async resume (): Promise<void> {}

  async close (): Promise<void> {}
}
