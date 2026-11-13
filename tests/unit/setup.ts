import { afterEach, beforeEach, vi } from 'vitest'

beforeEach(() => {
  process.env.TZ = 'Asia/Seoul'
  vi.useFakeTimers({ toFake: ['Date'] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  process.env.TZ = 'Asia/Seoul'
})
