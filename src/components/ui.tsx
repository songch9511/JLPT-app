// Small app-level compositions of Astryx components, so every screen picks the same control for the same job.
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { ToggleButton } from '@astryxdesign/core/ToggleButton'

type Option<T> = readonly [value: T, label: string]

/** One of a few fixed choices (2–5, short labels): a segmented control, read as a radio group. */
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
  return (
    <SegmentedControl
      label={label}
      layout="fill"
      value={String(value)}
      onChange={(v) => {
        const hit = options.find(([o]) => String(o) === v)
        if (hit) onChange(hit[0])
      }}
    >
      {options.map(([v, l]) => (
        <SegmentedControlItem key={String(v)} value={String(v)} label={l} />
      ))}
    </SegmentedControl>
  )
}

/**
 * A row of pill toggles: filters, exam dates, quiet days. Wraps (or scrolls with `scroll`) instead of clipping labels.
 * Single choice by default; each chip says whether it is on (aria-pressed).
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
    <div className={`chips ${scroll ? 'scroll' : ''}`} role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <ToggleButton key={String(v)} label={l} size="sm" isPressed={value === v} onPressedChange={() => onChange(v)} />
      ))}
    </div>
  )
}

/** A short message with one way out: what the browser's alert() used to show. */
export function MessageDialog({ title, message, onClose }: { title: string; message: string | null; onClose: () => void }) {
  return (
    <Dialog isOpen={message !== null} onOpenChange={(open) => !open && onClose()} width={360}>
      <DialogHeader title={title} hasDivider={false} />
      <div className="dialog-body">
        <p>{message}</p>
        <Button label="확인" variant="primary" width="100%" onClick={onClose} />
      </div>
    </Dialog>
  )
}

/** Nothing to show here yet: what it is and how it fills. Quiet, no illustration. */
export function Empty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="empty">
      <EmptyState title={title} description={description} isCompact headingLevel={2} />
    </div>
  )
}
