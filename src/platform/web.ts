import type { Platform } from './types'

function download(name: string, json: string): true {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  a.download = name
  a.click()
  // revoking right away can cancel the download on some browsers (iOS home-screen apps)
  const href = a.href
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
  return true
}

export const web: Platform = {
  native: false,
  haptic: () => {},
  saveFile: download,
  clearDeviceData: async () => {},
}
