// Generates the iOS app icon and launch image from public/icon.svg (the PWA's icon, Ruma as is).
// Runs on Linux: the SVG is rasterised by Playwright's Chromium (already a dev dependency for the e2e tests),
// which renders its gradients, patterns and filters exactly as browsers show the PWA icon.
//
//   npm run ios:assets            (set PW_CHROMIUM=/path/to/chrome if Playwright's own browser is not installed)
//
// Writes:
//   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png   1024×1024, opaque (App Store requirement)
//   ios/App/App/Assets.xcassets/Splash.imageset/splash-light.png       2732×2732, light ground (styles.css --bg)
//   ios/App/App/Assets.xcassets/Splash.imageset/splash-dark.png        2732×2732, dark ground
// and the two Contents.json files. The launch screen (LaunchScreen.storyboard) shows the Splash image
// aspect-filled, so Ruma sits in the middle fifth where every iPhone shows it.
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const assets = join(root, 'ios/App/App/Assets.xcassets')
const svg = readFileSync(join(root, 'public/icon.svg'), 'utf8')
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

const LIGHT_BG = '#fbfaf5' // 生成り kinari, styles.css :root --bg
const DARK_BG = '#1b1a18' // styles.css dark --bg

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
const page = await browser.newPage({ deviceScaleFactor: 1 })

async function shot(size, html, out) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<!doctype html><html><body style="margin:0">${html}</body></html>`)
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0))
  writeFileSync(out, await page.screenshot({ type: 'png', omitBackground: false }))
  console.log('wrote', out.replace(root + '/', ''))
}

// app icon: the SVG fills the square (it has its own indigo ground); iOS applies the rounded mask itself
const iconDir = join(assets, 'AppIcon.appiconset')
for (const f of readdirSync(iconDir)) if (f.endsWith('.png')) rmSync(join(iconDir, f))
await shot(1024, `<img src="${dataUrl}" width="1024" height="1024" style="display:block">`, join(iconDir, 'AppIcon-1024.png'))
writeFileSync(
  join(iconDir, 'Contents.json'),
  JSON.stringify({ images: [{ filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { author: 'xcode', version: 1 } }, null, 2) + '\n',
)

// launch image: Ruma's icon, rounded like on the home screen, centred on the app's ground colour
const splashDir = join(assets, 'Splash.imageset')
mkdirSync(splashDir, { recursive: true })
for (const f of readdirSync(splashDir)) if (f.endsWith('.png')) rmSync(join(splashDir, f))
const splash = (bg) =>
  `<div style="width:2732px;height:2732px;background:${bg};display:flex;align-items:center;justify-content:center">` +
  `<img src="${dataUrl}" width="520" height="520" style="border-radius:116px"></div>`
await shot(2732, splash(LIGHT_BG), join(splashDir, 'splash-light.png'))
await shot(2732, splash(DARK_BG), join(splashDir, 'splash-dark.png'))
writeFileSync(
  join(splashDir, 'Contents.json'),
  JSON.stringify(
    {
      images: [
        { idiom: 'universal', filename: 'splash-light.png' },
        { idiom: 'universal', filename: 'splash-dark.png', appearances: [{ appearance: 'luminosity', value: 'dark' }] },
      ],
      info: { version: 1, author: 'xcode' },
    },
    null,
    2,
  ) + '\n',
)
await browser.close()
