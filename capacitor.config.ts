import type { CapacitorConfig } from '@capacitor/cli'

/**
 * iOS app shell (docs/plan/10-ios-build.md).
 *
 * OWNER DECISION — placeholders: `appId` (the bundle id, permanent once the app is on App Store Connect) and
 * `appName` (the name under the home-screen icon). Change both with `npm run ios:set-id -- <bundle id>`,
 * which also updates the Xcode project, the widget extension and the App Group id that is derived from it.
 */
const config: CapacitorConfig = {
  appId: 'com.example.jlptruma', // PLACEHOLDER, e.g. io.github.<owner>.jlptruma
  appName: 'JLPT 루마', // PLACEHOLDER display name (store name is set in App Store Connect)
  webDir: 'dist-native',
  // the light theme's ground colour behind the web view while it loads; MainViewController.swift replaces it with the
  // launch screen's light/dark ground (Assets › LaunchBackground) once the bridge is up
  backgroundColor: '#fbfaf5',
  ios: {
    // the CSS lays the page out with env(safe-area-inset-*) and viewport-fit=cover; the web view must not inset it again
    contentInset: 'never',
    // no link previews on long press: the app is not a web page
    allowsLinkPreview: false,
  },
}

export default config
