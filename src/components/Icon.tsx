const PATHS = {
  home: 'M4 11.5 12 4l8 7.5M6.5 10v9.5h11V10',
  book: 'M5 4.5h11a2.5 2.5 0 0 1 2.5 2.5v12.5H7.5A2.5 2.5 0 0 1 5 17V4.5Zm0 12.5a2.5 2.5 0 0 1 2.5-2.5h11',
  gear: 'M5 7h8m4 0h2M5 17h2m4 0h8M15 4.5v5M9 14.5v5',
  back: 'M14.5 5 7.5 12l7 7',
  close: 'M6 6l12 12M18 6 6 18',
  speaker: 'M4.5 9.500v5h3.500l4.5 3.500v-12L8 9.500H4.500Zm11 -.5a4.2 4.2 0 0 1 0 6m2.3-8.500a7.5 7.5 0 0 1 0 11',
  mark: 'M7 4.500h10v15.500l-5-3.7-5 3.700V4.500Z',
  undo: 'M8.5 8.500H15a4.5 4.5 0 0 1 0 9H9M8.5 8.500l3.5-3.500M8.5 8.5 12 12',
  spark: 'M12 3.500l1.7 5.3 5.3 1.7-5.3 1.700L12 17.500l-1.7-5.300L5 10.500l5.3-1.700L12 3.500Zm6.5 12 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.300Z',
  check: 'M5 12.500l4.5 4.500L19 7.5',
  chevron: 'M9.5 5.5 16 12l-6.5 6.5',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm4.7-1.800L20 20',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9h-13v-9Z',
  flame: 'M12 3.500c.500 3.5 5 5.5 5 10.500a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.300 1.5 1 2.3 2 2.5-.500-3 0-6 1-8.500Z',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 22, fill = false }: { name: IconName; size?: number; fill?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
