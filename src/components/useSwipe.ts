// Sideways swipes between study cards (Study.tsx): pointer events, so touch, mouse and pen behave alike.
//
// The stage element holds the cards side by side (`.card-slot`, each at `--slot` card widths); this hook only moves
// them all together through one CSS variable, `--drag` (transforms, no layout), and tells the screen when a swipe
// went far or fast enough to change card. A swipe is recognised only once it is clearly sideways, so scrolling a long
// card up and down still works (`touch-action: pan-y` hands vertical moves to the browser). It never starts on a
// control (answer, audio, bookmark, reading choices), nor at the very edge of the screen, where iOS has its own
// back-swipe. A swipe that moved is never also a tap: the click that follows it is swallowed.
import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

/** Movement before a press is read as a direction; under it a press is still a tap. */
const SLOP = 10
/** A swipe changes card past this share of the card's width… */
const DISTANCE = 0.28
/** …or when flicked faster than this (px/ms) over at least FLICK_MIN px. */
const VELOCITY = 0.45
const FLICK_MIN = 24
/** Where there is no card to go to, the card follows the finger this far at most, ever more stiffly. */
const RUBBER = 56
/** Touches starting this close to the screen's side edges are left to the system (iOS back-swipe). */
const EDGE = 20
const SETTLE_MS = 220

const IGNORE = 'button, a, input, textarea, select, label, .choice, [data-noswipe]'

export interface SwipeOptions {
  /** an earlier card exists (swipe right) */
  canPrev: boolean
  /** a later card that is already open exists (swipe left) */
  canNext: boolean
  onPrev: () => void
  onNext: () => void
}

/** A length as the stage's `--slot-gap` gives it (`2rem`, `32px`) in px. */
const toPx = (v: string) => {
  const n = parseFloat(v) || 0
  return v.trim().endsWith('rem') ? n * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) : n
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** `rubber(d)`: how far the card moves for a finger moved `d` where it cannot go. */
export const rubber = (d: number) => Math.sign(d) * RUBBER * (1 - Math.exp(-Math.abs(d) / (RUBBER * 3)))

/**
 * Returns a ref for the stage and `peek`: true while a swipe is under way, when the neighbouring cards should be
 * rendered next to the card on screen.
 */
export function useSwipe(opts: SwipeOptions) {
  const o = useRef(opts)
  o.current = opts
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [peek, setPeek] = useState(false)
  const ref = useCallback((node: HTMLElement | null) => setEl(node), [])

  useEffect(() => {
    if (!el) return
    let id: number | null = null
    let x0 = 0
    let y0 = 0
    /** 'maybe' until the press shows a direction; 'x' a swipe; 'no' a vertical scroll or a tap */
    let mode: 'maybe' | 'x' | 'no' = 'no'
    let dx = 0
    let samples: [number, number][] = []
    let swallowClick = false
    let settling: number | null = null
    let frame = 0

    const setDrag = (px: number) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => el.style.setProperty('--drag', `${px}px`))
    }
    const shown = (d: number) => {
      const can = d > 0 ? o.current.canPrev : o.current.canNext
      return can ? d : rubber(d)
    }
    const end = () => {
      id = null
      mode = 'no'
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', up)
      removeEventListener('pointercancel', cancel)
    }
    /** Move the cards to `to` px (animated unless motion is reduced), then call `done`. */
    const settle = (to: number, done?: () => void) => {
      cancelAnimationFrame(frame)
      const finish = () => {
        if (settling !== null) clearTimeout(settling)
        settling = null
        el.removeEventListener('transitionend', onEnd)
        // the new card takes the middle place in the same frame as the offset goes back to 0: no jump
        if (done) flushSync(done)
        el.classList.remove('settling', 'dragging')
        el.style.setProperty('--drag', '0px')
        setPeek(false)
      }
      const onEnd = (e: TransitionEvent) => e.target !== el && e.propertyName === 'transform' && finish()
      if (reducedMotion() || Math.abs(to - shown(dx)) < 1) return finish()
      el.classList.remove('dragging')
      el.classList.add('settling')
      el.addEventListener('transitionend', onEnd)
      settling = window.setTimeout(finish, SETTLE_MS + 80)
      el.style.setProperty('--drag', `${to}px`)
    }

    const down = (e: PointerEvent) => {
      swallowClick = false
      if (id !== null || settling !== null || !e.isPrimary || e.button !== 0) return
      if (e.target instanceof Element && e.target.closest(IGNORE)) return
      if (e.pointerType !== 'mouse' && (e.clientX < EDGE || e.clientX > innerWidth - EDGE)) return
      id = e.pointerId
      x0 = e.clientX
      y0 = e.clientY
      dx = 0
      mode = 'maybe'
      samples = [[e.timeStamp, e.clientX]]
      addEventListener('pointermove', move)
      addEventListener('pointerup', up)
      addEventListener('pointercancel', cancel)
    }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      const mx = e.clientX - x0
      const my = e.clientY - y0
      if (mode === 'maybe') {
        if (Math.abs(my) > SLOP && Math.abs(my) >= Math.abs(mx)) return end()
        if (Math.abs(mx) <= SLOP || Math.abs(mx) < Math.abs(my) * 1.2) return
        mode = 'x'
        // from here on the press is a swipe: keep its events, no text selection, and no tap at the end
        try {
          el.setPointerCapture(e.pointerId)
        } catch {
          /* already released */
        }
        getSelection()?.removeAllRanges()
        el.classList.add('dragging')
        setPeek(true)
      }
      if (mode !== 'x') return
      e.preventDefault()
      dx = mx
      samples.push([e.timeStamp, e.clientX])
      if (samples.length > 6) samples.shift()
      setDrag(shown(dx))
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      const was = mode
      end()
      if (was !== 'x') return
      swallowClick = true
      const [t0, sx] = samples[0]
      const v = (e.clientX - sx) / Math.max(1, e.timeStamp - t0)
      const width = el.clientWidth
      const far = Math.abs(dx) > width * DISTANCE || (Math.abs(v) > VELOCITY && Math.abs(dx) > FLICK_MIN && Math.sign(v) === Math.sign(dx))
      const toPrev = dx > 0
      const can = toPrev ? o.current.canPrev : o.current.canNext
      if (!far || !can) return settle(0)
      const gap = toPx(getComputedStyle(el).getPropertyValue('--slot-gap'))
      settle((toPrev ? 1 : -1) * (width + gap), toPrev ? o.current.onPrev : o.current.onNext)
    }
    const cancel = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      const was = mode
      end()
      if (was === 'x') settle(0)
    }
    const click = (e: MouseEvent) => {
      if (!swallowClick) return
      swallowClick = false
      e.preventDefault()
      e.stopPropagation()
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('click', click, true)
    return () => {
      end()
      cancelAnimationFrame(frame)
      if (settling !== null) clearTimeout(settling)
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('click', click, true)
    }
  }, [el])

  return { ref, peek }
}
