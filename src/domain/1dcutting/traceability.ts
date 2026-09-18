// Links cut pieces to their place in the cutting plan, for the Kapning ↔ 3D trace.
// See docs/specs/cut-traceability/cut-traceability.md.
import type { Board } from '../boards/board.ts'
import { boardsToDemands, type SkipReason, type SkippedBoard } from './boardDemands.ts'
import { profileLabel, type BoardPlan, type CuttingPlan, type StockArticle, type UnplacedReason } from './cutting.ts'
import { planCuts } from './planCuts.ts'
import { SVENSKT_TRA_SORTIMENT } from './stock.ts'

export type PlanResult = { plan: CuttingPlan; skipped: SkippedBoard[] } | { error: unknown }

export type NotPlannedReason = UnplacedReason | SkipReason

export const NOT_PLANNED_REASONS: Record<NotPlannedReason, string> = {
  'no-matching-stock': 'No matching stock article',
  'too-long': 'Longer than the longest stock length',
  'invalid-length': 'Invalid length',
  unparsed: 'Name could not be read',
  'no-length': 'Missing length',
}

// Where one piece sits in the cutting plan.
export interface CutLocation {
  oid: string
  // Index into CuttingPlan.boards.
  boardIndex: number
  // e.g. '45x95 C24', as the cutting list's group heading.
  groupLabel: string
  // 1-based position within its group, as in the bar label "board N".
  boardNumber: number
  article: StockArticle
  // Position in saw order on the board, 0-based.
  cutIndex: number
  cutCount: number
  offsetMm: number
  lengthMm: number
  // The board's waste.
  wasteMm: number
  // OIDs of the other cuts on the same board, in saw order.
  siblings: string[]
}

export type TraceStatus =
  | { kind: 'placed'; location: CutLocation }
  | { kind: 'not-planned'; reason: NotPlannedReason }
  | { kind: 'not-a-board' }

export interface TraceIndex {
  byOid(oid: string): TraceStatus
  // OIDs of every cut on the board.
  boardOids(boardIndex: number): string[]
  // OIDs of every cut on every board of the article (an order line).
  articleOids(articleId: string): string[]
}

export interface BoardGroup {
  label: string
  boards: { plan: BoardPlan; index: number }[]
}

// Boards → demands → plan against the bundled stock. A thrown planning error (e.g. duplicate
// OIDs) is returned, not rethrown.
export function computeCuttingPlan(boards: readonly Board[]): PlanResult {
  try {
    const { demands, skipped } = boardsToDemands(boards)
    return { plan: planCuts(demands, SVENSKT_TRA_SORTIMENT), skipped }
  } catch (error) {
    return { error }
  }
}

export function boardGroupLabel(board: BoardPlan): string {
  return `${profileLabel(board.article.profile)} ${board.article.grade}`
}

// Groups boards by profile + grade. Boards arrive sorted, so each group is contiguous; this is
// the grouping and numbering the cutting list draws.
export function groupBoards(boards: readonly BoardPlan[]): BoardGroup[] {
  const groups: BoardGroup[] = []
  boards.forEach((plan, index) => {
    const label = boardGroupLabel(plan)
    const last = groups[groups.length - 1]
    if (last?.label === label) last.boards.push({ plan, index })
    else groups.push({ label, boards: [{ plan, index }] })
  })
  return groups
}

export function buildTraceIndex(plan: CuttingPlan, skipped: readonly SkippedBoard[]): TraceIndex {
  const statuses = new Map<string, TraceStatus>()
  for (const group of groupBoards(plan.boards)) {
    group.boards.forEach(({ plan: board, index }, position) => {
      const oids = board.cuts.map((c) => c.ifcTag)
      board.cuts.forEach((cut, cutIndex) => {
        statuses.set(cut.ifcTag, {
          kind: 'placed',
          location: {
            oid: cut.ifcTag,
            boardIndex: index,
            groupLabel: group.label,
            boardNumber: position + 1,
            article: board.article,
            cutIndex,
            cutCount: board.cuts.length,
            offsetMm: cut.offsetMm,
            lengthMm: cut.lengthMm,
            wasteMm: board.wasteMm,
            siblings: oids.filter((oid) => oid !== cut.ifcTag),
          },
        })
      })
    })
  }
  for (const u of plan.unplaced) statuses.set(u.demand.ifcTag, { kind: 'not-planned', reason: u.reason })
  for (const s of skipped) statuses.set(s.board.oid, { kind: 'not-planned', reason: s.reason })

  const boardOids = (boardIndex: number) => plan.boards[boardIndex]?.cuts.map((c) => c.ifcTag) ?? []
  return {
    byOid: (oid) => statuses.get(oid) ?? { kind: 'not-a-board' },
    boardOids,
    articleOids: (articleId) =>
      plan.boards.flatMap((board, i) => (board.article.id === articleId ? boardOids(i) : [])),
  }
}
