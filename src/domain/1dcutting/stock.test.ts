// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseStockCsv, SVENSKT_TRA_SORTIMENT } from './stock.ts'

const HEADER = 'typ;utförande;tjocklek_mm;bredd_mm;hållfasthetsklass;sorteringsklass;längd_mm;källa'

describe('SVENSKT_TRA_SORTIMENT', () => {
  // S10
  it('is complete and well-formed', () => {
    const stock = SVENSKT_TRA_SORTIMENT
    expect(stock).toHaveLength(3510)
    expect(new Set(stock.map((a) => a.id)).size).toBe(3510)
    for (const a of stock) {
      expect(a.profile.thicknessMm).toBeLessThanOrEqual(a.profile.widthMm)
      expect(Number.isInteger(a.lengthMm) && a.lengthMm > 0).toBe(true)
    }
    const lengths = (finish: string, t: number, w: number) =>
      stock
        .filter((a) => a.finish === finish && a.profile.thicknessMm === t && a.profile.widthMm === w && a.grade === 'C24')
        .map((a) => a.lengthMm)
    const expected = [3000, 3300, 3600, 3900, 4200, 4500, 4800, 5100, 5400]
    expect(lengths('hyvlat', 45, 95)).toEqual(expected)
    expect(lengths('sågat', 47, 100)).toEqual(expected)
    expect(stock.some((a) => a.profile.thicknessMm === 45 && a.profile.widthMm === 182)).toBe(false)
  })
})

describe('parseStockCsv', () => {
  it('builds the cross product of cross-sections, grades and lengths', () => {
    const csv = [
      HEADER,
      'tvärsnitt;hyvlat;95;45;;;;x',
      'hållfasthetsklass;;;;C24;T2;;x',
      'längd;;;;;;3000;x',
      'längd;;;;;;3600;x',
      '',
    ].join('\n')
    expect(parseStockCsv(csv)).toEqual([
      { id: '45x95-C24-3000', finish: 'hyvlat', profile: { thicknessMm: 45, widthMm: 95 }, grade: 'C24', lengthMm: 3000 },
      { id: '45x95-C24-3600', finish: 'hyvlat', profile: { thicknessMm: 45, widthMm: 95 }, grade: 'C24', lengthMm: 3600 },
    ])
  })

  // S12
  it.each([
    ['an unknown typ', 'bräda;hyvlat;45;95;;;;x', /line 3: unknown typ 'bräda'/],
    ['a non-numeric tjocklek_mm', 'tvärsnitt;hyvlat;abc;95;;;;x', /line 3: tjocklek_mm/],
    ['a längd row without längd_mm', 'längd;;;;;;;x', /line 3: längd_mm/],
  ])('rejects %s, naming the line', (_, row, message) => {
    const csv = [HEADER, 'hållfasthetsklass;;;;C24;T2;;x', row].join('\n')
    expect(() => parseStockCsv(csv)).toThrow(message)
  })

  it('rejects a missing header', () => {
    expect(() => parseStockCsv('längd;;;;;;3000;x')).toThrow(/line 1/)
  })
})
