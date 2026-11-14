// The only Astryx components left in the app: the confirm/message dialogs and the bottom sheet (docs/design-system.md).
// They appear only on a user action, so this module is a separate chunk that src/components/ui.tsx loads on demand;
// with it come Astryx's shared runtime and just these components' styles (astryx-overlays.css, `npm run theme`).
import { useEffect, useState, type ReactNode } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { BottomSheet } from '@astryxdesign/core/BottomSheet'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { registerTheme } from '@astryxdesign/core/theme'
import '../themes/ruma/astryx-overlays.css'
import { rumaTheme } from '../themes/ruma/ruma'

// No <Theme> provider: Astryx components follow <html data-astryx-theme="ruma"> (index.html) and look the theme up
// by name for its icons (the close button's Lucide X).
registerTheme(rumaTheme)

/**
 * These mount on the first open (src/components/ui.tsx). Rendering them closed for one frame first makes that open the
 * same as every later one: the overlay records the opener to give focus back to, and runs its entry motion.
 */
function useOpenAfterMount(isOpen: boolean) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const f = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(f)
  }, [])
  return mounted && isOpen
}

export type SheetProps = { isOpen: boolean; onClose: () => void; label: string; children: ReactNode }

/** Grab handle, swipe down / scrim / Escape to close, focus kept inside and given back to the opener. */
export function Sheet({ isOpen, onClose, label, children }: SheetProps) {
  return (
    <BottomSheet isOpen={useOpenAfterMount(isOpen)} onOpenChange={(open) => !open && onClose()} label={label} height="hug">
      {children}
    </BottomSheet>
  )
}

export type ConfirmProps = {
  isOpen: boolean
  onClose: () => void
  title: string
  description: string
  actionLabel: string
  /** `destructive` (default) for what cannot be undone; `primary` for a change that can be */
  actionVariant?: 'destructive' | 'primary'
  onAction: () => void
}

/** Asks before acting; focus starts on 취소 (the safe choice). */
export function Confirm({ isOpen, onClose, title, description, actionLabel, actionVariant, onAction }: ConfirmProps) {
  return (
    <AlertDialog
      isOpen={useOpenAfterMount(isOpen)}
      onOpenChange={(open) => !open && onClose()}
      title={title}
      description={description}
      actionLabel={actionLabel}
      actionVariant={actionVariant}
      cancelLabel="취소"
      onAction={onAction}
    />
  )
}

export type MessageProps = { isOpen: boolean; title: string; message: string; onClose: () => void }

/** A short message with one way out: what the browser's alert() used to show. */
export function Message({ isOpen, title, message, onClose }: MessageProps) {
  return (
    <Dialog isOpen={useOpenAfterMount(isOpen)} onOpenChange={(open) => !open && onClose()} width={360}>
      <DialogHeader title={title} hasDivider={false} />
      <div className="dialog-body">
        <p>{message}</p>
        <Button label="확인" variant="primary" width="100%" onClick={onClose} />
      </div>
    </Dialog>
  )
}
