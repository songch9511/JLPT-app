// The app's controls: small hand-rolled components styled in styles.css from the ruma theme's tokens, so every screen
// picks the same control for the same job. Their props follow Astryx's names (label, variant, isDisabled …).
// Only the overlays (dialogs, bottom sheet) are Astryx, loaded on first use from ./overlays (docs/design-system.md §3).
import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { Icon } from './Icon'
import type { ConfirmProps, SheetProps } from './overlays'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type Option<T> = readonly [value: T, label: string]

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost'

type ButtonProps = {
  /** the accessible name; also the visible text unless `children` draw it */
  label: string
  children?: ReactNode
  /** one primary per group; secondary for the rest; destructive (soft vermilion) for what deletes; ghost for quiet */
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  width?: '100%'
  /** aria-disabled: still focusable and announced, does nothing */
  isDisabled?: boolean
  onClick?: (e: MouseEvent<HTMLElement>) => void
  /** a link that looks like a button */
  href?: string
  icon?: ReactNode
  endContent?: ReactNode
  className?: string
  'aria-haspopup'?: 'dialog'
  /** a toggle, or the chosen one of a few (the grade given to a card answered earlier) */
  'aria-pressed'?: boolean
}

/** A flat face on a shallow edge that sinks when pressed (styles.css `.btn`). */
export function Button({ label, children, variant = 'secondary', size = 'md', width, isDisabled, onClick, href, icon, endContent, className, ...aria }: ButtonProps) {
  const props = {
    className: cx('btn', width && 'full', className),
    'data-variant': variant,
    'data-size': size,
    'aria-label': children ? label : undefined,
    'aria-disabled': isDisabled || undefined,
    onClick: isDisabled ? undefined : onClick,
    ...aria,
  }
  const content = (
    <>
      {icon}
      {children ?? label}
      {endContent}
    </>
  )
  return href ? (
    <a href={href} {...props}>
      {content}
    </a>
  ) : (
    <button type="button" {...props}>
      {content}
    </button>
  )
}

/** An icon-only button: 44px, quiet ink; `label` is its name. */
export function IconButton({
  label,
  icon,
  href,
  isDisabled,
  onClick,
  className,
  'aria-pressed': pressed,
}: {
  label: string
  icon: ReactNode
  href?: string
  isDisabled?: boolean
  onClick?: (e: MouseEvent<HTMLElement>) => void
  className?: string
  'aria-pressed'?: boolean
}) {
  const props = { className: cx('btn icon-btn', className), 'data-variant': 'ghost', 'aria-label': label, title: label }
  return href ? (
    <a href={href} {...props}>
      {icon}
    </a>
  ) : (
    <button type="button" {...props} aria-pressed={pressed} aria-disabled={isDisabled || undefined} onClick={isDisabled ? undefined : onClick}>
      {icon}
    </button>
  )
}

/** A static group: 1px line, no shadow. `padding={3}` for small tiles. */
export function Card({ padding, className, ...rest }: ComponentProps<'div'> & { padding?: 3 }) {
  return <div className={cx('card', padding === 3 && 'pad-3', className)} {...rest} />
}

/**
 * A plain row that goes somewhere: label, chevron, 48px, a hairline below (styles.css `.row-link`). `newWindow` for a
 * page outside the app (the browser opens it beside the app).
 */
export function RowLink({ label, href, newWindow, className }: { label: string; href: string; newWindow?: boolean; className?: string }) {
  return (
    <a href={href} className={cx('row-link', className)} {...(newWindow ? { target: '_blank', rel: 'noreferrer' } : {})}>
      <span className="grow">{label}</span>
      <Icon name="chevron" size={18} />
    </a>
  )
}

/** One of a few fixed choices (2–5, short labels): a segmented control, read as a radio group (arrow keys move). */
export function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly Option<T>[]
  onChange: (v: T) => void
}) {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : step ? (i + step + options.length) % options.length : -1
    if (to < 0) return
    e.preventDefault()
    onChange(options[to][0])
    ;(e.currentTarget.parentElement?.children[to] as HTMLElement | undefined)?.focus()
  }
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, l], i) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={v === value}
          tabIndex={v === value ? 0 : -1}
          onClick={() => onChange(v)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

/**
 * A row of pill toggles: filters. Wraps (or scrolls with `scroll`) instead of clipping labels.
 * Single choice; each chip says whether it is on (aria-pressed).
 */
export function ChipGroup<T extends string | number>({
  label,
  value,
  options,
  onChange,
  scroll = false,
}: {
  label: string
  value: T
  options: readonly Option<T>[]
  onChange: (v: T) => void
  scroll?: boolean
}) {
  return (
    <div className={cx('chips', scroll && 'scroll')} role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" className="chip" aria-pressed={value === v} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  )
}

/** On/off: a checkbox announced as a switch; the whole row is the target. */
export function Switch({ label, description, value, onChange }: { label: string; description?: string; value: boolean; onChange: (v: boolean) => void }) {
  const id = useId()
  return (
    <label className="switch-field">
      <span className="grow">
        <span id={`${id}l`} className="switch-label">
          {label}
        </span>
        {description && (
          <span id={`${id}d`} className="switch-desc">
            {description}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch-input"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        aria-labelledby={`${id}l`}
        aria-describedby={description ? `${id}d` : undefined}
      />
    </label>
  )
}

/** The word search: a search field with a clear button. */
export function SearchField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="search-field">
      <Icon name="search" size={16} />
      <input
        ref={input}
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
      />
      {value && (
        <button
          type="button"
          className="search-clear"
          aria-label={`${label} 지우기`}
          onClick={() => {
            onChange('')
            input.current?.focus()
          }}
        >
          <Icon name="close" size={18} />
        </button>
      )}
    </div>
  )
}

/** A plain bar (no highlight stripe). `valueText` is what a screen reader hears. */
export function ProgressBar({ label, value, max, valueText, className }: { label: string; value: number; max: number; valueText: string; className?: string }) {
  const pct = (v: number) => `${Math.min(100, Math.max(0, max > 0 ? (v / max) * 100 : 0))}%`
  return (
    <div
      className={cx('progress', className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
    >
      <i style={{ width: pct(value) }} />
    </div>
  )
}

/** A small static label (new word, again, reading, level, target). */
export function Badge({ label, variant = 'neutral' }: { label: string; variant?: 'neutral' | 'blue' | 'red' }) {
  return (
    <span className="badge" data-variant={variant}>
      {label}
    </span>
  )
}

/** A lasting notice: error (save failed) or success (import done), with an optional action and close button. */
export function Banner({
  status,
  title,
  description,
  action,
  onDismiss,
  dismissLabel = '닫기',
  className,
}: {
  status: 'error' | 'success'
  title: string
  description?: string
  action?: ReactNode
  onDismiss?: () => void
  dismissLabel?: string
  className?: string
}) {
  return (
    <div className={cx('banner', className)} data-status={status}>
      <div className="banner-head">
        <Icon name={status === 'error' ? 'error' : 'success'} size={20} />
        <div className="grow">
          <p className="banner-title">{title}</p>
          {description && <p className="banner-desc">{description}</p>}
        </div>
        {onDismiss && <IconButton label={dismissLabel} icon={<Icon name="close" size={20} />} onClick={onDismiss} />}
      </div>
      {action && <div className="banner-actions">{action}</div>}
    </div>
  )
}

/** Nothing to show here yet: what it is and how it fills. Quiet, no illustration; announced when it appears. */
export function Empty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="empty" role="status">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  )
}

/**
 * Says `text` once, politely, to screen readers: text that is already on screen when a live region appears is not
 * read, so this region starts empty and is filled a moment later, then emptied (it is not read twice when browsing).
 */
export function Announce({ text }: { text: string }) {
  const [said, setSaid] = useState('')
  useEffect(() => {
    const a = setTimeout(() => setSaid(text), 250)
    const b = setTimeout(() => setSaid(''), 8000)
    return () => {
      clearTimeout(a)
      clearTimeout(b)
    }
  }, [text])
  return (
    <span className="sr-only" role="status">
      {said}
    </span>
  )
}

/** A placeholder block while something loads. */
export function Skeleton({ width, height }: { width: number; height: number }) {
  return <span className="skeleton-block" style={{ width, height }} aria-hidden="true" />
}

// ── overlays: Astryx, in their own chunk ──

const overlays = () => import('./overlays')
const LazySheet = lazy(() => overlays().then((m) => ({ default: m.Sheet })))
const LazyConfirm = lazy(() => overlays().then((m) => ({ default: m.Confirm })))
const LazyMessage = lazy(() => overlays().then((m) => ({ default: m.Message })))

// Whether the overlays chunk has loaded: from then on every overlay is mounted (closed), so opening one is only
// a state change. Until then an overlay mounts on its first open.
let loaded = false
const listeners = new Set<() => void>()
const subscribe = (f: () => void) => (listeners.add(f), () => void listeners.delete(f))

/**
 * Loads the overlays chunk (src/main.tsx calls this once the app is idle; the service worker has the file). Mounting
 * the Astryx sheet costs about 300 ms at 4× CPU throttle the first time, so it is better spent then than on a tap.
 */
export const preloadOverlays = () =>
  void overlays().then(
    () => {
      loaded = true
      listeners.forEach((f) => f())
    },
    () => {},
  )

/** Mounts a lazily loaded overlay once the chunk is in or it is first opened; then it stays mounted (closed) so it
 * can animate out and hand focus back. */
function useMountOnOpen(isOpen: boolean) {
  const ready = useSyncExternalStore(subscribe, () => loaded)
  const [opened, setOpened] = useState(isOpen)
  useEffect(() => {
    if (isOpen) setOpened(true)
  }, [isOpen])
  return ready || opened || isOpen
}

/** A bottom sheet (word details, "이 숫자는 무엇인가요?"). */
export function Sheet(props: SheetProps) {
  if (!useMountOnOpen(props.isOpen)) return null
  return (
    <Suspense fallback={null}>
      <LazySheet {...props} />
    </Suspense>
  )
}

/** Asks before acting: replaces the browser's confirm(). */
export function ConfirmDialog(props: ConfirmProps) {
  if (!useMountOnOpen(props.isOpen)) return null
  return (
    <Suspense fallback={null}>
      <LazyConfirm {...props} />
    </Suspense>
  )
}

/** A short message with one way out: replaces the browser's alert(). `message={null}` closes it. */
export function MessageDialog({ title, message, onClose }: { title: string; message: string | null; onClose: () => void }) {
  const last = useRef('')
  if (message !== null) last.current = message
  if (!useMountOnOpen(message !== null)) return null
  return (
    <Suspense fallback={null}>
      <LazyMessage title={title} message={last.current} isOpen={message !== null} onClose={onClose} />
    </Suspense>
  )
}

