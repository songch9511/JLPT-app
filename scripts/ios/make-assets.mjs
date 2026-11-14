// Generates the iOS app icon from public/icon.svg (the PWA's icon, Ruma as is) and the launch image from the web
// launch screen in index.html (#launch: Ruma alone on the ground colour, the wordmark near the bottom), so the app
// opens on the same screen the web app paints before its script runs.
// Runs on Linux: the SVG is rasterised by Playwright's Chromium (already a dev dependency for the e2e tests),
// which renders its gradients, patterns and filters exactly as browsers show the PWA icon.
//
//   npm run ios:assets            (set PW_CHROMIUM=/path/to/chrome if Playwright's own browser is not installed)
//
// Writes:
//   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png   1024×1024, opaque (App Store requirement)
//   ios/App/App/Assets.xcassets/Splash.imageset/splash-light.png       2732×2732, light ground
//   ios/App/App/Assets.xcassets/Splash.imageset/splash-dark.png        2732×2732, dark ground
//   ios/App/App/Assets.xcassets/LaunchBackground.colorset              the two ground colours (the storyboard's background)
// and the Contents.json files. The launch screen (LaunchScreen.storyboard) shows the Splash image aspect-filled: on a
// portrait iPhone the square's height is the screen's height, so sizes below are given in points of an 844 pt tall
// screen (2732 / 844 px per pt) and the wordmark keeps to the middle third, which every iPhone shows.
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const assets = join(root, 'ios/App/App/Assets.xcassets')
const svg = readFileSync(join(root, 'public/icon.svg'), 'utf8')
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

const LIGHT_BG = '#fbfaf5' // 生成り kinari, the theme's --color-background-body
const DARK_BG = '#1b1a18' // its dark value
const LIGHT = { bg: LIGHT_BG, ink: '#2d2a26', accent: '#165e83' }
const DARK = { bg: DARK_BG, ink: '#ece7db', accent: '#86aecf' }
// the launch screen's Ruma and wordmark, exactly as index.html draws them
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8')
const launchSvg = indexHtml.match(/<div id="launch"[^>]*>\s*(<svg[\s\S]*?<\/svg>)/)?.[1]
const wordmark = indexHtml.match(/<div id="launch"[\s\S]*?<p>([\s\S]*?)<\/p>/)?.[1]
if (!launchSvg || !wordmark) throw new Error('index.html has no #launch screen to copy')

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
const PT = 2732 / 844
const splash = ({ bg, ink, accent }) =>
  `<div style="position:relative;width:2732px;height:2732px;background:${bg};display:flex;align-items:center;justify-content:center">` +
  launchSvg.replace('<svg ', `<svg width="${112 * PT}" height="${112 * PT}" style="display:block;margin-top:${-24 * PT}px" `) +
  `<p style="position:absolute;left:0;right:0;bottom:${(56 + 34) * PT}px;margin:0;text-align:center;font:700 ${20 * PT}px/1 -apple-system,'Apple SD Gothic Neo',Pretendard,'Noto Sans KR',sans-serif;letter-spacing:.02em;color:${ink}">` +
  wordmark.replace('<span>', `<span style="color:${accent}">`) +
  '</p></div>'
// an inline SVG has no image to wait for
const shotHtml = async (size, html, out) => {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<!doctype html><html><body style="margin:0">${html}</body></html>`)
  writeFileSync(out, await page.screenshot({ type: 'png', omitBackground: false }))
  console.log('wrote', out.replace(root + '/', ''))
}
await shotHtml(2732, splash(LIGHT), join(splashDir, 'splash-light.png'))
await shotHtml(2732, splash(DARK), join(splashDir, 'splash-dark.png'))
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
// the storyboard's own background, under the image (seen on screens whose shape the square does not cover)
const rgb = (hex) => [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3))
const color = (hex) => {
  const [red, green, blue] = rgb(hex)
  return { 'color-space': 'srgb', components: { red, green, blue, alpha: '1.000' } }
}
const colorDir = join(assets, 'LaunchBackground.colorset')
mkdirSync(colorDir, { recursive: true })
writeFileSync(
  join(colorDir, 'Contents.json'),
  JSON.stringify(
    {
      colors: [
        { idiom: 'universal', color: color(LIGHT_BG) },
        { idiom: 'universal', appearances: [{ appearance: 'luminosity', value: 'dark' }], color: color(DARK_BG) },
      ],
      info: { author: 'xcode', version: 1 },
    },
    null,
    2,
  ) + '\n',
)
console.log('wrote', join(colorDir, 'Contents.json').replace(root + '/', ''))
await browser.close()
