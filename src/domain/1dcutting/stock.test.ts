// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseStockCsv, parseYardCsv, SVENSKT_TRA_SORTIMENT } from './stock.ts'

const HEADER = 'typ;utförande;tjocklek_mm;bredd_mm;hållfasthetsklass;sorteringsklass;längd_mm;källa'

describe('SVENSKT_TRA_SORTIMENT', () => {
  // S10
  it('is complete and well-formed', () => {
    const stock = SVENSKT_TRA_SORTIMENT
    expect(stock).toHaveLength(4536)
    expect(new Set(stock.map((a) => a.id)).size).toBe(4536)
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
    expect(stock.some((a) => a.profile.thicknessMm === 45 && a.profile.widthMm === 190)).toBe(false)
    // Profiles and grade added for the Vertex model (siding 22x145 C16, header 45x182).
    expect(lengths('hyvlat', 45, 182)).toEqual(expected)
    expect(stock.filter((a) => a.id.startsWith('22x145-C16-')).map((a) => a.lengthMm)).toEqual(expected)
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

  it('gives articles without a quantity (unlimited stock)', () => {
    expect(SVENSKT_TRA_SORTIMENT.every((a) => a.quantity === undefined)).toBe(true)
  })
})

const YARD_HEADER = 'typ;utförande;tjocklek_mm;bredd_mm;hållfasthetsklass;sorteringsklass;längd_mm;antal;källa'

// Lumberyards S01
describe('parseYardCsv', () => {
  it('parses one article per row, with its quantity', () => {
    const csv = [YARD_HEADER, 'artikel;hyvlat;95;45;C24;T2;4800;12;x', 'artikel;hyvlat;22;145;C16;;3000;0;x', ''].join('\n')
    expect(parseYardCsv(csv)).toEqual([
      { id: '45x95-C24-4800', finish: 'hyvlat', profile: { thicknessMm: 45, widthMm: 95 }, grade: 'C24', lengthMm: 4800, quantity: 12 },
      { id: '22x145-C16-3000', finish: 'hyvlat', profile: { thicknessMm: 22, widthMm: 145 }, grade: 'C16', lengthMm: 3000, quantity: 0 },
    ])
  })

  it('rejects a wrong header', () => {
    expect(() => parseYardCsv(`${HEADER}\nartikel;hyvlat;95;45;C24;T2;4800;12;x`)).toThrow(/line 1/)
    expect(() => parseYardCsv(`${YARD_HEADER};extra\nartikel;hyvlat;95;45;C24;T2;4800;12;x`)).toThrow(/line 1/)
  })

  it.each([
    ['a negative antal', 'artikel;hyvlat;95;45;C24;T2;4800;-1;x', /line 3: antal/],
    ['a non-integer antal', 'artikel;hyvlat;95;45;C24;T2;4800;1.5;x', /line 3: antal/],
    ['a missing antal', 'artikel;hyvlat;95;45;C24;T2;4800;;x', /line 3: antal/],
    ['a non-C grade', 'artikel;hyvlat;95;45;GL30c;;4800;3;x', /line 3: invalid hållfasthetsklass 'GL30c'/],
    ['a sorteringsklass that is not the grade’s T alias', 'artikel;hyvlat;95;45;C24;T3;4800;3;x', /line 3: sorteringsklass 'T3'/],
    ['a typ other than artikel', 'längd;;;;;;4800;3;x', /line 3: unknown typ 'längd'/],
    ['a second row for the same profile, grade and length', 'artikel;sågat;45;95;C24;;3000;1;x', /line 3: duplicate article 45x95-C24-3000/],
  ])('rejects %s, naming the line', (_, row, message) => {
    const csv = [YARD_HEADER, 'artikel;hyvlat;95;45;C24;T2;3000;12;x', row].join('\n')
    expect(() => parseYardCsv(csv)).toThrow(message)
  })
})
