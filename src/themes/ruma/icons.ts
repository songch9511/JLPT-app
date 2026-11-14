// Astryx's semantic icon names, drawn with Lucide (the app's icon set). Components with their own icon slot
// (dialog close, banner status, search field) take these; the app's own icons stay in src/components/Icon.tsx.
import { createElement, type ComponentType } from 'react'
import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, CircleX, Info, Search, TriangleAlert, X } from 'lucide-react'

const icon = (C: ComponentType<{ size: string; 'aria-hidden': boolean }>) => createElement(C, { size: '1em', 'aria-hidden': true })

export const rumaIcons = {
  close: icon(X),
  chevronDown: icon(ChevronDown),
  chevronLeft: icon(ChevronLeft),
  chevronRight: icon(ChevronRight),
  check: icon(Check),
  success: icon(CircleCheck),
  error: icon(CircleX),
  warning: icon(TriangleAlert),
  info: icon(Info),
  calendar: icon(Calendar),
  search: icon(Search),
}
