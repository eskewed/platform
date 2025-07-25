import type { TickHandler, TickManager } from './api/utils'

export function groupByArray<T, K> (array: T[], keyProvider: (item: T) => K): Map<K, T[]> {
  const result = new Map<K, T[]>()

  array.forEach((item) => {
    const key = keyProvider(item)

    if (!result.has(key)) {
      result.set(key, [item])
    } else {
      result.get(key)?.push(item)
    }
  })

  return result
}

/**
 * Handles a time unification and inform about ticks.
 */
export class TickManagerImpl implements TickManager {
  handlers: TickHandler[] = []

  hashCounter: number = 0

  _tick: number = 0

  constructor (readonly tps: number) {}

  now (): number {
    return performance.now()
  }

  nextHash (): number {
    return ++this.hashCounter % this.tps
  }

  register (handler: TickHandler): void {
    this.handlers.push(handler)
  }

  unregister (handler: TickHandler): void {
    this.handlers = this.handlers.filter((h) => h !== handler)
  }

  async tick (): Promise<void> {
    this._tick++
    await Promise.all(this.handlers.map((h) => h(this._tick, this.tps)))
  }
}
