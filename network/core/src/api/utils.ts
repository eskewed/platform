export type TickHandler = (tick: number, tps: number) => void | Promise<void>

export interface TickManager {
  now: () => number
  register: (handler: TickHandler) => void
  unregister: (handler: TickHandler) => void
  tick: () => void
  tps: number
  nextHash: () => number
}
