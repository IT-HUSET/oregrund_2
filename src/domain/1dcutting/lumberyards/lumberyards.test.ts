// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { StockArticle } from '../cutting.ts'
import referenceCsv from '../svenskt_tra_virkessortiment.csv?raw'
import { buildLumberyards, DEFAULT_LUMBERYARD_ID, LUMBERYARDS } from './lumberyards.ts'

// The reference assortment's rows, split by `källa`: Svenskt Trä rows cite svenskttra.se, the
// accepted model-specific cross-sections cite 772_H811.
const referenceRows = referenceCsv
  .split(/\r?\n/)
  .slice(1)
  .filter((line) => line.trim() !== '')
  .map((line) => line.split(';'))
const sectionKey = (finish: string, a: number, b: number) => `${finish} ${Math.min(a, b)}x${Math.max(a, b)}`
const sections = (source: RegExp) =>
  new Set(referenceRows.filter((r) => r[0] === 'tvärsnitt' && source.test(r[7])).map((r) => sectionKey(r[1], +r[2], +r[3])))
const SVENSKT_TRA_SECTIONS = sections(/^https:\/\/www\.svenskttra\.se\//)
const MODEL_SECTIONS = sections(/^772_H811/)
const REFERENCE_GRADES = new Set(referenceRows.filter((r) => r[0] === 'hållfasthetsklass').map((r) => r[4]))

const sectionOf = (a: StockArticle) => sectionKey(a.finish, a.profile.thicknessMm, a.profile.widthMm)
const groupOf = (a: StockArticle) => `${a.profile.thicknessMm}x${a.profile.widthMm} ${a.grade}`

function stockOf(name: string): readonly StockArticle[] {
  const yard = LUMBERYARDS.find((y) => y.name === name)
  if (!yard || 'error' in yard) throw new Error(`${name}: ${yard ? yard.error : 'missing'}`)
  return yard.stock
}

// Lumberyards S06
describe('LUMBERYARDS', () => {
  it('bundles three readable yards in order, with whole quantities >= 0', () => {
    expect(LUMBERYARDS.map((y) => y.name)).toEqual(['Har allt brädgård', 'Standard brädgård', 'Bara märkliga mått brädgård'])
    expect(LUMBERYARDS.find((y) => y.id === DEFAULT_LUMBERYARD_ID)?.name).toBe('Standard brädgård')
    for (const yard of LUMBERYARDS) {
      const stock = stockOf(yard.name)
      expect(stock.length).toBeGreaterThan(0)
      for (const a of stock) expect(Number.isInteger(a.quantity) && a.quantity! >= 0, a.id).toBe(true)
    }
  })

  it('Standard: Svenskt Trä cross-sections, C14/C16/C24, 3000–5400 mm in 300 mm steps', () => {
    const stock = stockOf('Standard brädgård')
    for (const a of stock) {
      expect(SVENSKT_TRA_SECTIONS.has(sectionOf(a)), a.id).toBe(true)
      expect(['C14', 'C16', 'C24'], a.id).toContain(a.grade)
      expect(a.lengthMm >= 3000 && a.lengthMm <= 5400 && a.lengthMm % 300 === 0, a.id).toBe(true)
    }
    // Quantities run short: at least one article is stocked below what a whole order might need.
    expect(stock.find((a) => a.id === '45x45-C24-5400')?.quantity).toBe(1)
  })

  it('Har allt: reference cross-sections and grades, 2400–10200 mm, and a length >= 9725 mm for everything', () => {
    const stock = stockOf('Har allt brädgård')
    const longest = new Map<string, number>()
    for (const a of stock) {
      expect(SVENSKT_TRA_SECTIONS.has(sectionOf(a)) || MODEL_SECTIONS.has(sectionOf(a)), a.id).toBe(true)
      expect(REFERENCE_GRADES.has(a.grade), a.id).toBe(true)
      expect(a.lengthMm >= 2400 && a.lengthMm <= 10200, a.id).toBe(true)
      longest.set(groupOf(a), Math.max(longest.get(groupOf(a)) ?? 0, a.lengthMm))
    }
    for (const [group, length] of longest) expect(length, group).toBeGreaterThanOrEqual(9725)
    // Every model-specific cross-section is carried.
    for (const section of MODEL_SECTIONS) expect(stock.some((a) => sectionOf(a) === section), section).toBe(true)
  })

  it('Bara märkliga mått: no length is a multiple of 300 mm, and a non-standard cross-section is offered', () => {
    const stock = stockOf('Bara märkliga mått brädgård')
    for (const a of stock) expect(a.lengthMm % 300, a.id).not.toBe(0)
    expect(stock.some((a) => !SVENSKT_TRA_SECTIONS.has(sectionOf(a)) && !MODEL_SECTIONS.has(sectionOf(a)))).toBe(true)
  })
})

// Lumberyards S10 (domain half)
describe('buildLumberyards', () => {
  it('gives a yard with a malformed stock list an error instead of throwing', () => {
    const header = 'typ;utförande;tjocklek_mm;bredd_mm;hållfasthetsklass;sorteringsklass;längd_mm;antal;källa'
    const yards = buildLumberyards([
      { id: 'ok', name: 'OK', csv: `${header}\nartikel;hyvlat;45;95;C24;T2;3000;2;x` },
      { id: 'bad', name: 'Bad', csv: `${header}\nartikel;hyvlat;45;95;C24;T2;3000;-2;x` },
    ])
    expect(yards[0]).toMatchObject({ id: 'ok', stock: [expect.objectContaining({ id: '45x95-C24-3000', quantity: 2 })] })
    expect(yards[1]).toEqual({ id: 'bad', name: 'Bad', error: expect.stringMatching(/line 2: antal/) })
  })
})
