import { describe, expect, it } from 'vitest'
import { makeBoard } from './__fixtures__/boards.ts'
import { boardGroupKey, summarizeBoards, UNPARSED_GROUP } from './boardSummary.ts'

// S03: grouping by profile (incl. suffix) + grade
describe('summarizeBoards', () => {
  it('groups by profile label and grade with counts and total lengths', () => {
    const summary = summarizeBoards([
      makeBoard('1 Stud 45x220 C24', 2408),
      makeBoard('2 Stud 45x220 C24', 1200),
      makeBoard('3 Sill plate 45x220_S C24', 3000),
      makeBoard('4 Stud 45x220 C16', 900),
    ])

    expect(summary.groups).toEqual([
      { key: '45x220 C16', profile: '45x220', grade: 'C16', count: 1, totalLength: 900 },
      { key: '45x220 C24', profile: '45x220', grade: 'C24', count: 2, totalLength: 3608 },
      { key: '45x220_S C24', profile: '45x220_S', grade: 'C24', count: 1, totalLength: 3000 },
    ])
    expect(summary).toMatchObject({ count: 4, totalLength: 7508, flaggedCount: 0 })
  })

  it('orders groups by nominal thickness, width and suffix, then grade', () => {
    const keys = summarizeBoards([
      makeBoard('1 X 45x95 C24', 1),
      makeBoard('2 X 9.762523x95 C14', 1),
      makeBoard('3 X 45x220 C24', 1),
      makeBoard('4 X 45x95 C16', 1),
      makeBoard('5 X 22x145_sta_Z C16', 1),
    ]).groups.map((g) => g.key)
    expect(keys).toEqual(['9.762523x95 C14', '22x145_sta_Z C16', '45x95 C16', '45x95 C24', '45x220 C24'])
  })

  // S06: unparsed and length-less boards are counted, never dropped
  it('puts unparsed boards in a last Unparsed group and counts flagged boards', () => {
    const summary = summarizeBoards([
      makeBoard('Mystery piece', 500),
      makeBoard('1 Stud 45x70 C24', 2400),
      makeBoard('2 Stud 45x70 C24', null),
    ])

    expect(summary.groups).toEqual([
      { key: '45x70 C24', profile: '45x70', grade: 'C24', count: 2, totalLength: 2400 },
      { key: UNPARSED_GROUP, profile: '', grade: '', count: 1, totalLength: 500 },
    ])
    expect(summary).toMatchObject({ count: 3, totalLength: 2900, flaggedCount: 2 })
    expect(summary.groups.reduce((sum, g) => sum + g.count, 0)).toBe(summary.count)
    expect(summary.groups.reduce((sum, g) => sum + g.totalLength, 0)).toBe(summary.totalLength)
  })

  it('summarizes an empty list', () => {
    expect(summarizeBoards([])).toEqual({ groups: [], count: 0, totalLength: 0, flaggedCount: 0 })
  })
})

describe('boardGroupKey', () => {
  it('is the profile label and grade, or Unparsed', () => {
    expect(boardGroupKey(makeBoard('100 Sill plate 45x220_S C24', 1))).toBe('45x220_S C24')
    expect(boardGroupKey(makeBoard('Mystery piece', 1))).toBe('Unparsed')
  })
})
