import type { WordType } from '../data'
import { ChipGroup } from './ui'

/** Word-type filter groups: the two that change how a word is studied, then the rest. */
export type TypeGroup = 'all' | 'S' | 'F' | 'J' | 'N' | 'other'
export const TYPE_GROUPS: [TypeGroup, string][] = [
  ['all', '모든 유형'],
  ['S', '뜻 같은 한자어'],
  ['F', '뜻 다른 한자어'],
  ['J', '일본 한자어'],
  ['N', '고유어'],
  ['other', '그 밖'],
]

export const inGroup = (k: WordType, g: TypeGroup) =>
  g === 'all' || (g === 'other' ? !['S', 'F', 'J', 'N'].includes(k) : k === g)

export function TypeFilter({ value, onChange, counts }: { value: TypeGroup; onChange: (g: TypeGroup) => void; counts?: Record<TypeGroup, number> }) {
  return (
    <ChipGroup
      label="단어 유형"
      scroll
      value={value}
      onChange={onChange}
      options={TYPE_GROUPS.map(([g, label]) => [g, counts && g !== 'all' ? `${label} ${counts[g].toLocaleString()}` : label])}
    />
  )
}
