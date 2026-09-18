import type { Board, BoardProfile } from './board.ts'

export const UNPARSED_GROUP = 'Unparsed'

export interface BoardGroup {
  // Profile label + grade (e.g. '45x220_S C24'), or UNPARSED_GROUP.
  key: string
  // Empty for the Unparsed group.
  profile: string
  grade: string
  count: number
  // Sum of the lengths of the group's boards that have a length (mm).
  totalLength: number
}

export interface BoardSummary {
  // Ordered by profile, then grade. The Unparsed group, if any, comes last.
  groups: BoardGroup[]
  count: number
  totalLength: number
  // Boards with at least one issue (unparsed name or no length).
  flaggedCount: number
}

export function boardGroupKey(board: Board): string {
  return board.profile ? `${board.profile.label} ${board.grade}` : UNPARSED_GROUP
}

export function summarizeBoards(boards: readonly Board[]): BoardSummary {
  const groups = new Map<string, { group: BoardGroup; profile: BoardProfile | null }>()
  let totalLength = 0
  let flaggedCount = 0

  for (const board of boards) {
    const key = boardGroupKey(board)
    let entry = groups.get(key)
    if (!entry) {
      entry = {
        group: { key, profile: board.profile?.label ?? '', grade: board.grade, count: 0, totalLength: 0 },
        profile: board.profile,
      }
      groups.set(key, entry)
    }
    entry.group.count++
    if (board.length !== null) {
      entry.group.totalLength += board.length
      totalLength += board.length
    }
    if (board.issues.length > 0) flaggedCount++
  }

  const ordered = [...groups.values()].sort(
    (a, b) => compareProfiles(a.profile, b.profile) || compareText(a.group.grade, b.group.grade),
  )
  return { groups: ordered.map((e) => e.group), count: boards.length, totalLength, flaggedCount }
}

// Orders profiles by nominal thickness, then width, then suffix. A missing profile sorts last.
export function compareProfiles(a: BoardProfile | null, b: BoardProfile | null): number {
  if (!a || !b) return (a ? 0 : 1) - (b ? 0 : 1)
  return a.thickness - b.thickness || a.width - b.width || compareText(a.suffix, b.suffix)
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true })
}
