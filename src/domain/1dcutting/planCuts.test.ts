// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { CutDemand, CuttingPlan, StockArticle } from './cutting.ts'
import { planCuts } from './planCuts.ts'
import { SVENSKT_TRA_SORTIMENT } from './stock.ts'

function demand(ifcTag: string, profile: string, grade: string, lengthMm: number): CutDemand {
  const [thicknessMm, widthMm] = profile.split('x').map(Number)
  return { ifcTag, profile: { thicknessMm, widthMm }, grade, lengthMm }
}

function stock(profile: string, grade: string, lengths: number[]): StockArticle[] {
  const [thicknessMm, widthMm] = profile.split('x').map(Number)
  return lengths.map((lengthMm) => ({
    id: `${profile}-${grade}-${lengthMm}`,
    finish: 'hyvlat',
    profile: { thicknessMm, widthMm },
    grade,
    lengthMm,
  }))
}

const summary = (plan: CuttingPlan) =>
  plan.boards.map((b) => `${b.article.id}: ${b.cuts.map((c) => `${c.ifcTag}@${c.offsetMm}`).join(' ')}`)
const unplaced = (plan: CuttingPlan) => plan.unplaced.map((u) => `${u.demand.ifcTag} ${u.reason}`)

const S01 = [
  demand('A', '45x95', 'C24', 2000),
  demand('B', '45x95', 'C24', 2000),
  demand('C', '45x95', 'C24', 1500),
  demand('D', '45x95', 'C24', 1000),
]

describe('planCuts', () => {
  // S01 + S02
  it('shares boards between pieces and picks the least-waste plan', () => {
    const plan = planCuts(S01, SVENSKT_TRA_SORTIMENT)
    expect(summary(plan)).toEqual(['45x95-C24-3600: A@0 C@2000', '45x95-C24-3000: B@0 D@2000'])
    expect(plan.boards.map((b) => b.wasteMm)).toEqual([100, 0])
    expect(plan.totals).toEqual({
      placedPieces: 4,
      unplacedPieces: 0,
      requiredMm: 6500,
      purchasedMm: 6600,
      wasteMm: 100,
      wastePct: expect.closeTo(1.515, 2),
    })
    expect(plan.orderLines.map((l) => `${l.quantity} × ${l.article.id}`)).toEqual([
      '1 × 45x95-C24-3600',
      '1 × 45x95-C24-3000',
    ])
    expect(plan.boards[0].cuts).toEqual([
      { ifcTag: 'A', lengthMm: 2000, offsetMm: 0 },
      { ifcTag: 'C', lengthMm: 1500, offsetMm: 2000 },
    ])
  })

  // S03
  it('leaves non-standard dimensions unplaced instead of rounding them up', () => {
    const plan = planCuts([demand('H', '45x182', 'C24', 1200)], SVENSKT_TRA_SORTIMENT)
    expect(plan.boards).toEqual([])
    expect(unplaced(plan)).toEqual(['H no-matching-stock'])
  })

  // S04
  it('leaves pieces longer than the longest stock unplaced and plans the rest', () => {
    const plan = planCuts(
      [demand('L', '45x95', 'C24', 6000), demand('S', '45x95', 'C24', 1000)],
      stock('45x95', 'C24', [3000, 5400]),
    )
    expect(unplaced(plan)).toEqual(['L too-long'])
    expect(summary(plan)).toEqual(['45x95-C24-3000: S@0'])
  })

  // S05
  it('never mixes grades or profiles', () => {
    const plan = planCuts(
      [demand('a', '45x95', 'C24', 1000), demand('b', '45x95', 'C14', 1000), demand('c', '45x70', 'C24', 1000)],
      [...stock('45x95', 'C24', [3000]), ...stock('45x70', 'C24', [3000])],
    )
    expect(summary(plan)).toEqual(['45x70-C24-3000: c@0', '45x95-C24-3000: a@0'])
    expect(unplaced(plan)).toEqual(['b no-matching-stock'])
  })

  // S06
  it('normalises the profile orientation', () => {
    const plan = planCuts([demand('R', '95x45', 'C24', 1000)], SVENSKT_TRA_SORTIMENT)
    expect(summary(plan)).toEqual(['45x95-C24-3000: R@0'])
  })

  // S07
  it('reports invalid lengths and rejects duplicate tags', () => {
    const plan = planCuts(
      [demand('z', '45x95', 'C24', 0), demand('n', '45x95', 'C24', -5), demand('x', '45x95', 'C24', NaN)],
      SVENSKT_TRA_SORTIMENT,
    )
    expect(unplaced(plan)).toEqual(['n invalid-length', 'x invalid-length', 'z invalid-length'])
    expect(() =>
      planCuts([demand('dup', '45x95', 'C24', 1000), demand('dup', '45x95', 'C24', 900)], SVENSKT_TRA_SORTIMENT),
    ).toThrow(/dup/)
  })

  // S08
  it('is deterministic regardless of input order', () => {
    const input = [...S01, demand('E', '45x70', 'C24', 800), demand('F', '45x182', 'C24', 800)]
    expect(planCuts([...input].reverse(), SVENSKT_TRA_SORTIMENT)).toEqual(planCuts(input, SVENSKT_TRA_SORTIMENT))
  })

  // S11
  it('accepts sorting classes as strength-class aliases', () => {
    const plan = planCuts(
      [demand('t', '45x95', 'T2', 1000), demand('c', '45x95', 'C24', 1000), demand('u', '45x95', 'X9', 1000)],
      SVENSKT_TRA_SORTIMENT,
    )
    expect(summary(plan)).toEqual(['45x95-C24-3000: c@0 t@1000'])
    expect(unplaced(plan)).toEqual(['u no-matching-stock'])
  })

  it('does not mutate its inputs', () => {
    const input = Object.freeze(S01.map((d) => Object.freeze({ ...d, profile: Object.freeze({ ...d.profile }) })))
    const before = JSON.stringify(input)
    planCuts(input, Object.freeze([...SVENSKT_TRA_SORTIMENT]))
    expect(JSON.stringify(input)).toBe(before)
  })

  // S09
  it('keeps its invariants on a large random input', () => {
    const random = mulberry32(772)
    const profiles = ['45x95', '45x120', '45x145', '45x170', '45x195', '45x220', '45x70', '22x95', '45x182']
    const grades = ['C24', 'C14', 'T2']
    const demands = Array.from({ length: 750 }, (_, i) => {
      const length = random() < 0.02 ? 5500 + random() * 1000 : 200 + random() * 5200
      return demand(`T${i}`, profiles[Math.floor(random() * profiles.length)], grades[Math.floor(random() * 3)], length)
    })

    const start = performance.now()
    const plan = planCuts(demands, SVENSKT_TRA_SORTIMENT)
    expect(performance.now() - start).toBeLessThan(1000)

    const tags = [...plan.boards.flatMap((b) => b.cuts.map((c) => c.ifcTag)), ...plan.unplaced.map((u) => u.demand.ifcTag)]
    expect(tags.sort()).toEqual(demands.map((d) => d.ifcTag).sort())
    expect(plan.unplaced.some((u) => u.reason === 'too-long')).toBe(true)
    expect(plan.unplaced.some((u) => u.reason === 'no-matching-stock')).toBe(true)

    const byTag = new Map(demands.map((d) => [d.ifcTag, d]))
    for (const board of plan.boards) {
      expect(board.usedMm).toBeLessThanOrEqual(board.article.lengthMm + 1e-6)
      for (const cut of board.cuts) {
        const d = byTag.get(cut.ifcTag)!
        expect(d.profile).toEqual(board.article.profile)
        expect(d.grade.replace('T2', 'C24')).toBe(board.article.grade)
      }
      const shorter = SVENSKT_TRA_SORTIMENT.filter(
        (a) =>
          a.profile.thicknessMm === board.article.profile.thicknessMm &&
          a.profile.widthMm === board.article.profile.widthMm &&
          a.grade === board.article.grade &&
          a.lengthMm < board.article.lengthMm,
      )
      expect(shorter.every((a) => a.lengthMm < board.usedMm)).toBe(true)
    }
    const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
    expect(plan.totals.purchasedMm).toBeCloseTo(sum(plan.boards.map((b) => b.article.lengthMm)))
    expect(plan.totals.wasteMm).toBeCloseTo(sum(plan.boards.map((b) => b.wasteMm)))
    expect(plan.totals.requiredMm).toBeCloseTo(sum(plan.boards.map((b) => b.usedMm)))
    expect(plan.totals.placedPieces + plan.totals.unplacedPieces).toBe(750)
  })
})

// Small seeded PRNG so the random test is reproducible without a dependency.
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
