// Replace the placeholder bundle id (and optionally the home-screen name) everywhere it is written.
//
//   npm run ios:set-id -- io.github.<owner>.jlptruma
//   npm run ios:set-id -- io.github.<owner>.jlptruma --name "JLPT 루마"
//
// Changes: capacitor.config.ts (appId, appName), the Xcode project (app and widget bundle ids, the App Group
// id `group.<bundle id>`), and the display name in both Info.plist files. Run it once, before the app is
// created in App Store Connect: a bundle id cannot change after that. `npm run ios:sync` afterwards.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const id = args.find((a) => !a.startsWith('--'))
const nameAt = args.indexOf('--name')
const name = nameAt >= 0 ? args[nameAt + 1] : undefined

if (!id || !/^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)+$/.test(id)) {
  console.error('usage: npm run ios:set-id -- <reverse-dns bundle id> [--name "<display name>"]')
  process.exit(1)
}

const files = {
  config: join(root, 'capacitor.config.ts'),
  pbx: join(root, 'ios/App/App.xcodeproj/project.pbxproj'),
  appPlist: join(root, 'ios/App/App/Info.plist'),
  widgetPlist: join(root, 'ios/App/RumaWidget/Info.plist'),
}
const read = (f) => readFileSync(f, 'utf8')

const config = read(files.config)
const current = /appId: '([^']+)'/.exec(config)?.[1]
if (!current) throw new Error('appId not found in capacitor.config.ts')

let pbx = read(files.pbx)
const before = pbx
// widget first (its id contains the app's), then the app, then the App Group
pbx = pbx
  .replaceAll(`PRODUCT_BUNDLE_IDENTIFIER = ${current}.widget;`, `PRODUCT_BUNDLE_IDENTIFIER = ${id}.widget;`)
  .replaceAll(`PRODUCT_BUNDLE_IDENTIFIER = ${current};`, `PRODUCT_BUNDLE_IDENTIFIER = ${id};`)
  .replaceAll(`RUMA_APP_GROUP = group.${current};`, `RUMA_APP_GROUP = group.${id};`)
if (pbx === before && current !== id) throw new Error(`bundle id ${current} not found in the Xcode project`)
writeFileSync(files.pbx, pbx)

let cfg = config.replace(`appId: '${current}'`, `appId: '${id}'`)
if (name) {
  cfg = cfg.replace(/appName: '[^']*'/, `appName: '${name.replace(/'/g, "\\'")}'`)
  for (const f of [files.appPlist, files.widgetPlist]) {
    const esc = name.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    writeFileSync(f, read(f).replace(/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${esc}$2`))
  }
}
writeFileSync(files.config, cfg)
console.log(`bundle id ${current} → ${id}${name ? `, name → ${name}` : ''}. App Group: group.${id}, widget: ${id}.widget`)
