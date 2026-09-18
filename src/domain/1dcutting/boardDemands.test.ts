// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { makeBoard } from '../boards/__fixtures__/boards.ts'
import { boardsToDemands } from './boardDemands.ts'

describe('boardsToDemands', () => {
  // S13
  it('turns boards into demands and skips unusable boards with a reason', () => {
    const boards = [
      makeBoard('1 Stud 45x95 C24', 2000, { oid: '1' }),
      makeBoard('2 Sill plate 45x220_S C24', 1200, { oid: '2' }),
      makeBoard('Mystery piece', 900, { oid: '3' }),
      makeBoard('4 Stud 45x95 C24', null, { oid: '4' }),
    ]
    const { demands, skipped } = boardsToDemands(boards)
    expect(demands).toEqual([
      { ifcTag: '1', profile: { thicknessMm: 45, widthMm: 95 }, grade: 'C24', lengthMm: 2000 },
      { ifcTag: '2', profile: { thicknessMm: 45, widthMm: 220 }, grade: 'C24', lengthMm: 1200 },
    ])
    expect(skipped.map((s) => [s.board.oid, s.reason])).toEqual([
      ['3', 'unparsed'],
      ['4', 'no-length'],
    ])
    expect(demands.length + skipped.length).toBe(boards.length)
  })
})
