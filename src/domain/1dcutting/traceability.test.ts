import { describe, expect, it } from 'vitest'
import { makeBoard } from '../boards/__fixtures__/boards.ts'
import { buildTraceIndex, computeCuttingPlan, groupBoards, type PlanResult } from './traceability.ts'

const boards = [
  makeBoard('1 Stud 45x95 C24', 2000, { oid: 'A' }),
  makeBoard('2 Stud 45x95 C24', 2000, { oid: 'B' }),
  makeBoard('3 Nogging 45x95 C24', 1500, { oid: 'C' }),
  makeBoard('4 Nogging 45x95 C24', 1000, { oid: 'D' }),
  makeBoard('5 Header 45x190 C24', 1200, { oid: 'E' }),
  makeBoard('Mystery piece', 900, { oid: 'F' }),
]

function planned(result: PlanResult) {
  if ('error' in result) throw result.error
  return result
}

describe('computeCuttingPlan', () => {
  it('plans the boards and keeps the skipped ones', () => {
    const { plan, skipped } = planned(computeCuttingPlan(boards))
    expect(plan.boards.map((b) => b.cuts.map((c) => c.ifcTag))).toEqual([['A', 'C'], ['B', 'D']])
    expect(skipped.map((s) => s.board.oid)).toEqual(['F'])
  })

  it('returns a planning error instead of throwing', () => {
    const result = computeCuttingPlan([makeBoard('1 Stud 45x95 C24', 1000, { oid: 'X' }), makeBoard('2 Stud 45x95 C24', 900, { oid: 'X' })])
    expect(result).toEqual({ error: expect.any(Error) })
  })
})

describe('buildTraceIndex', () => {
  // S01
  it('locates every placed cut and explains the rest', () => {
    const { plan, skipped } = planned(computeCuttingPlan(boards))
    const index = buildTraceIndex(plan, skipped)

    expect(index.byOid('C')).toEqual({
      kind: 'placed',
      location: {
        oid: 'C',
        boardIndex: 0,
        groupLabel: '45x95 C24',
        boardNumber: 1,
        article: expect.objectContaining({ id: '45x95-C24-3600' }),
        cutIndex: 1,
        cutCount: 2,
        offsetMm: 2000,
        lengthMm: 1500,
        wasteMm: 100,
        siblings: ['A'],
      },
    })
    expect(index.byOid('E')).toEqual({ kind: 'not-planned', reason: 'no-matching-stock' })
    expect(index.byOid('F')).toEqual({ kind: 'not-planned', reason: 'unparsed' })
    expect(index.byOid('nope')).toEqual({ kind: 'not-a-board' })
    expect(index.boardOids(1)).toEqual(['B', 'D'])
    expect(index.boardOids(7)).toEqual([])
    expect(index.articleOids('45x95-C24-3600')).toEqual(['A', 'C'])
  })

  // S02 (domain half): numbering restarts per group, in board order
  it('numbers boards within their profile + grade group', () => {
    const many = [
      ...[5000, 5000, 5000].map((l, i) => makeBoard(`${i} Stud 45x95 C24`, l, { oid: `a${i}` })),
      ...[5000, 5000, 5000].map((l, i) => makeBoard(`${i} Stud 45x70 C24`, l, { oid: `b${i}` })),
    ]
    const { plan, skipped } = planned(computeCuttingPlan(many))
    const groups = groupBoards(plan.boards)
    expect(groups.map((g) => [g.label, g.boards.length])).toEqual([
      ['45x70 C24', 3],
      ['45x95 C24', 3],
    ])
    const index = buildTraceIndex(plan, skipped)
    groups.forEach((group) =>
      group.boards.forEach(({ plan: board }, i) => {
        const status = index.byOid(board.cuts[0].ifcTag)
        expect(status.kind === 'placed' && [status.location.groupLabel, status.location.boardNumber]).toEqual([group.label, i + 1])
      }),
    )
  })
})
