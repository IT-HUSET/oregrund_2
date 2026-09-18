// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { StockArticle } from '../cutting.ts'
import { summarizeStock } from './stockSummary.ts'

function article(thickness: number, width: number, grade: string, lengthMm: number, quantity?: number): StockArticle {
  return {
    id: `${thickness}x${width}-${grade}-${lengthMm}`,
    finish: 'hyvlat',
    profile: { thicknessMm: thickness, widthMm: width },
    grade,
    lengthMm,
    quantity,
  }
}

describe('summarizeStock', () => {
  it('groups articles by profile and grade, sorted by profile, grade and length', () => {
    const summary = summarizeStock([
      article(45, 195, 'C24', 3000, 4),
      article(45, 95, 'C24', 4200, 2),
      article(45, 95, 'C24', 3600, 0),
      article(45, 95, 'C16', 3000, 5),
      article(22, 95, 'C24', 3000, 1),
    ])

    expect(summary.groups.map((g) => [g.profile, g.grade, g.articles.map((a) => a.lengthMm)])).toEqual([
      ['22x95', 'C24', [3000]],
      ['45x95', 'C16', [3000]],
      ['45x95', 'C24', [3600, 4200]],
      ['45x195', 'C24', [3000]],
    ])
  })

  it('totals articles, boards and length, per group and overall', () => {
    const summary = summarizeStock([article(45, 95, 'C24', 3600, 3), article(45, 95, 'C24', 4200, 2), article(45, 195, 'C24', 3000, 0)])

    expect(summary.groups.map((g) => [g.boards, g.lengthMm])).toEqual([
      [5, 3 * 3600 + 2 * 4200],
      [0, 0],
    ])
    expect(summary).toMatchObject({ articles: 3, boards: 5, lengthMm: 3 * 3600 + 2 * 4200 })
  })

  it('sorts grades numerically (C14 before C24 before C30)', () => {
    const summary = summarizeStock([article(45, 95, 'C30', 3000, 1), article(45, 95, 'C14', 3000, 1), article(45, 95, 'C24', 3000, 1)])
    expect(summary.groups.map((g) => g.grade)).toEqual(['C14', 'C24', 'C30'])
  })

  it('leaves unlimited articles (no quantity) out of the board and length totals', () => {
    const summary = summarizeStock([article(45, 95, 'C24', 3600), article(45, 95, 'C24', 4200, 2)])
    expect(summary).toMatchObject({ articles: 2, boards: 2, lengthMm: 8400 })
  })

  it('summarises empty stock', () => {
    expect(summarizeStock([])).toEqual({ groups: [], articles: 0, boards: 0, lengthMm: 0 })
  })
})
