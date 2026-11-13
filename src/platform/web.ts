import type { Platform } from './types'

/** The browser's speech synthesis, as the web app has always used it. */
export function webSpeak(text: string) {
  if (!('speechSynthesis' in window)) return
  const u = new SpeechSynthesisUtterance(text.replace(/[～~]/g, ''))
  u.lang = 'ja-JP'
  u.rate = 0.9
  const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith('ja'))
  if (voice) u.voice = voice
  speechSynthesis.cancel()
  speechSynthesis.speak(u)
}

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
  speak: webSpeak,
  haptic: () => {},
  saveFile: download,
  clearDeviceData: async () => {},
}
