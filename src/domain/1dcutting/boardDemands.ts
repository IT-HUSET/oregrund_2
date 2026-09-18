import type { Board } from '../boards/board.ts'
import { normaliseProfile, type CutDemand } from './cutting.ts'

export type SkipReason = 'unparsed' | 'no-length'

export interface SkippedBoard {
  board: Board
  reason: SkipReason
}

export interface BoardDemands {
  // One per usable board, in input order.
  demands: CutDemand[]
  // Boards that can't become a demand.
  skipped: SkippedBoard[]
}

// Turns the Boards tab's board list into cut demands. The profile suffix (`_S`, `_sta_Z`) is
// ignored for matching stock; the nominal thickness × width is used.
export function boardsToDemands(boards: readonly Board[]): BoardDemands {
  const demands: CutDemand[] = []
  const skipped: SkippedBoard[] = []
  for (const board of boards) {
    if (!board.profile || board.issues.includes('unparsed')) {
      skipped.push({ board, reason: 'unparsed' })
    } else if (board.length === null) {
      skipped.push({ board, reason: 'no-length' })
    } else {
      demands.push({
        ifcTag: board.oid,
        profile: normaliseProfile(board.profile.thickness, board.profile.width),
        grade: board.grade,
        lengthMm: board.length,
      })
    }
  }
  return { demands, skipped }
}
