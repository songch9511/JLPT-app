// The platform layer (docs/plan/10-ios-build.md): one place where the web app and the iOS app differ.
//
// The web build never contains the native code: `import.meta.env.MODE` is replaced at build time, so in a
// web build the check below is the constant false and the dynamic import of ./native is removed with its
// branch. Code elsewhere that loads native-only screens writes the same check out in place
// (`import.meta.env.MODE === 'native'`): an imported constant would not be folded across modules.
// The iOS app is built with `--mode native` and also checks at run time that Capacitor's native bridge is
// really there (a native build opened in a desktop browser keeps the web behaviour).
import type { Platform } from './types'
import { web } from './web'

export type { Platform }

export const NATIVE_BUILD = import.meta.env.MODE === 'native'

/** Capacitor's iOS/Android runtime injects `window.Capacitor` before the page's scripts run. */
export function isNativeRuntime(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  try {
    return !!cap?.isNativePlatform?.()
  } catch {
    return false
  }
}

/** The current implementation. A live binding: it changes once, in startPlatform, before the first render. */
export let platform: Platform = web

/**
 * Before the first render. On the web this does nothing (and is not awaited by main.tsx). In the app it
 * restores the durable copy of the study state if the web view's storage lost it or holds an older one,
 * then wires reminders, haptics, speech, files, links and lifecycle. If any of that fails the app still
 * starts, with the web behaviour.
 */
export async function startPlatform(): Promise<void> {
  if (import.meta.env.MODE !== 'native' || !isNativeRuntime()) return
  try {
    const { createNativePlatform } = await import('./native')
    platform = await createNativePlatform()
  } catch (e) {
    console.error('native platform failed to start; continuing with web behaviour', e)
  }
}

/** Unit tests only: route the app through another implementation (e.g. the native one with fake plugins). */
export const _setPlatformForTests = (p: Platform) => {
  platform = p
}
