// The factory cut list: what to saw from each purchased board, in saw order.
import type { Board } from '../boards/board.ts'
import type { SkippedBoard } from './boardDemands.ts'
import type { CuttingPlan, StockArticle } from './cutting.ts'
import { groupBoards } from './traceability.ts'

export interface CutReportCut {
  // 1-based position in saw order on the board.
  seq: number
  oid: string
  // From the board list; empty when the OID is not in it.
  pieceCode: string
  role: string
  element: string
  lengthMm: number
  // Mark positions from the start of the stock board (kerf 0).
  fromMm: number
  toMm: number
}

export interface CutReportBoard {
  // 1-based within its group, as the cutting list's "board N".
  number: number
  article: StockArticle
  cuts: CutReportCut[]
  wasteMm: number
}

export interface CutReportGroup {
  // e.g. '45x95 C24', as the cutting list's group heading.
  label: string
  boards: CutReportBoard[]
}

export interface CutReport {
  groups: CutReportGroup[]
  totals: {
    boards: number
    cuts: number
    // Pieces that are not on any board (unplaced or skipped).
    notPlanned: number
  }
}

export function buildCutReport(plan: CuttingPlan, skipped: readonly SkippedBoard[], boards: readonly Board[]): CutReport {
  const boardByOid = new Map(boards.map((b) => [b.oid, b]))
  const groups = groupBoards(plan.boards).map((group) => ({
    label: group.label,
    boards: group.boards.map(({ plan: board }, i) => ({
      number: i + 1,
      article: board.article,
      wasteMm: board.wasteMm,
      cuts: board.cuts.map((cut, c) => {
        const source = boardByOid.get(cut.ifcTag)
        return {
          seq: c + 1,
          oid: cut.ifcTag,
          pieceCode: source?.pieceCode ?? '',
          role: source?.role ?? '',
          element: source?.element ?? '',
          lengthMm: cut.lengthMm,
          fromMm: cut.offsetMm,
          toMm: cut.offsetMm + cut.lengthMm,
        }
      }),
    })),
  }))
  return {
    groups,
    totals: {
      boards: plan.boards.length,
      cuts: plan.totals.placedPieces,
      notPlanned: plan.unplaced.length + skipped.length,
    },
  }
}
