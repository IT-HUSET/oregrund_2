import { describe, expect, it } from 'vitest'
import { makeBoard } from '../boards/__fixtures__/boards.ts'
import { buildCutReport } from './cutReport.ts'
import { computeCuttingPlan } from './traceability.ts'

const BOARDS = [
  makeBoard('1 Stud 45x95 C24', 2000, { oid: 'A', element: 'VÄGG-999' }),
  makeBoard('2 Stud 45x95 C24', 2000, { oid: 'B' }),
  makeBoard('3 Nogging 45x95 C24', 1500, { oid: 'C' }),
  makeBoard('4 Nogging 45x95 C24', 1000, { oid: 'D' }),
  makeBoard('FD5 Opening header beam 45x145 C24', 1180, { oid: 'E' }),
  makeBoard('9 Stud 45x95 C24', null, { oid: 'F' }),
]

function reportOf(boards = BOARDS) {
  const result = computeCuttingPlan(boards)
  if ('error' in result) throw result.error
  return buildCutReport(result.plan, result.skipped, boards)
}

describe('buildCutReport', () => {
  it('lists every purchased board with its cuts in saw order and their mark positions', () => {
    const report = reportOf()

    expect(report.groups.map((g) => g.label)).toEqual(['45x95 C24', '45x145 C24'])
    const [studs] = report.groups
    expect(studs.boards.map((b) => [b.number, b.article.lengthMm, b.wasteMm])).toEqual([
      [1, 3600, 100],
      [2, 3000, 0],
    ])
    expect(studs.boards[0].cuts).toEqual([
      { seq: 1, oid: 'A', pieceCode: '1', role: 'Stud', element: 'VÄGG-999', lengthMm: 2000, fromMm: 0, toMm: 2000 },
      { seq: 2, oid: 'C', pieceCode: '3', role: 'Nogging', element: 'GOLV-999', lengthMm: 1500, fromMm: 2000, toMm: 3500 },
    ])
    expect(studs.boards[1].cuts.map((c) => [c.seq, c.oid, c.fromMm, c.toMm])).toEqual([
      [1, 'B', 0, 2000],
      [2, 'D', 2000, 3000],
    ])
  })

  it('totals boards and cuts and counts pieces left out of the plan', () => {
    expect(reportOf().totals).toEqual({ boards: 3, cuts: 5, notPlanned: 1 })
  })

  it('leaves piece details empty for a cut whose element is not in the board list', () => {
    const boards = [makeBoard('1 Stud 45x95 C24', 1000, { oid: 'A' })]
    const result = computeCuttingPlan(boards)
    if ('error' in result) throw result.error
    const [cut] = buildCutReport(result.plan, result.skipped, []).groups[0].boards[0].cuts
    expect(cut).toEqual({ seq: 1, oid: 'A', pieceCode: '', role: '', element: '', lengthMm: 1000, fromMm: 0, toMm: 1000 })
  })

  it('is empty when nothing is planned', () => {
    const report = reportOf([makeBoard('Mystery piece', 900, { oid: 'X' })])
    expect(report.groups).toEqual([])
    expect(report.totals).toEqual({ boards: 0, cuts: 0, notPlanned: 1 })
  })
})
