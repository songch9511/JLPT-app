// What Astryx's <Theme> provider did at the root, without its runtime (docs/design-system.md §1): the ruma tokens are
// plain CSS custom properties (src/themes/ruma/ruma.css under <html data-astryx-theme="ruma">, set in index.html), so
// all that is left to do in script is the theme mode and the reader's text size.
import { useLayoutEffect } from 'react'

/** System / light / dark from settings: `data-theme` on <html> (absent = follow the OS), read by ruma.css. */
export function useThemeMode(mode: 'system' | 'light' | 'dark') {
  useLayoutEffect(() => {
    const html = document.documentElement
    if (mode === 'system') html.removeAttribute('data-theme')
    else html.setAttribute('data-theme', mode)
  }, [mode])
}

// iOS Dynamic Type: the body size of each text-size category (xs … ax5) and the size of each type style the theme's
// font-size steps follow (Apple's HIG tables, the same as Astryx's uikitTypography). Column 3 ("Large") is the default.
const BODY = [14, 15, 16, 17, 19, 21, 23, 28, 33, 40, 47, 53]
const STYLES: Record<string, number[]> = {
  'large-title': [31, 32, 33, 34, 36, 38, 40, 44, 48, 52, 56, 60],
  title1: [25, 26, 27, 28, 30, 32, 34, 38, 43, 48, 53, 58],
  title2: [19, 20, 21, 22, 24, 26, 28, 34, 39, 44, 50, 56],
  title3: [17, 18, 19, 20, 22, 24, 26, 31, 37, 43, 49, 55],
  body: BODY,
  footnote: [12, 12, 12, 13, 15, 17, 19, 23, 27, 33, 38, 44],
  caption1: [11, 11, 11, 12, 14, 16, 18, 22, 26, 32, 37, 43],
}
const LARGE = 3
/** The first of the accessibility sizes (AX1, body 28). */
const AX1 = 7

/**
 * Follows the reader's text size on Apple platforms: a hidden probe in `font: -apple-system-body` tells the Dynamic
 * Type category, and each `--_dynamic-type-<style>` scale (read by the theme's `--font-size-*`) is set to match.
 * Elsewhere the scales stay at 1 (or `env(preferred-text-scale)`, styles.css). Returns a stop function.
 */
export function syncTextSize(doc = document): () => void {
  const view = doc.defaultView
  if (!view?.CSS?.supports?.('font', '-apple-system-body') || typeof ResizeObserver === 'undefined') return () => {}
  const probe = doc.createElement('span')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = 'position:fixed;inset:0 auto auto 0;inline-size:1em;block-size:1em;visibility:hidden;pointer-events:none;font:-apple-system-body'
  doc.body.append(probe)
  const root = doc.documentElement.style
  const read = () => {
    const px = parseFloat(view.getComputedStyle(probe).fontSize)
    const col = BODY.findIndex((s) => Math.abs(s - px) < 0.5)
    // the accessibility sizes (AX1 and up): layouts that stack or fold for very large text read <html data-text-size>
    if (col >= AX1) doc.documentElement.dataset.textSize = 'large'
    else delete doc.documentElement.dataset.textSize
    for (const [name, row] of Object.entries(STYLES)) {
      if (col < 0 || col === LARGE) root.removeProperty(`--_dynamic-type-${name}`)
      else root.setProperty(`--_dynamic-type-${name}`, String(Number((row[col] / row[LARGE]).toFixed(4))))
    }
  }
  read()
  const ro = new ResizeObserver(read)
  ro.observe(probe)
  return () => {
    ro.disconnect()
    probe.remove()
  }
}
