import { describe, expect, it } from 'vitest'
import raw from './__fixtures__/web-ifc-raw.json'
import { formatNumber, resolveProjectUnits, toElementInfo, type RawElementData } from './elementInfo.ts'

// Raw shapes captured from web-ifc for src/features/ifc-viewer/__fixtures__/beam.ifc
const units = resolveProjectUnits(raw.unitAssignment)
const beam = { ...raw['38'], units } as RawElementData
const proxy = { ...raw['47'], units } as RawElementData

describe('resolveProjectUnits', () => {
  it('resolves SI units with prefixes to symbols', () => {
    expect(units).toEqual({ length: 'mm', area: 'm²', volume: 'm³', mass: 'kg' })
  })

  it('returns no units when the assignment is missing', () => {
    expect(resolveProjectUnits(undefined)).toEqual({})
  })
})

// S02: identity, property sets and quantities of a clicked element
describe('toElementInfo', () => {
  it('maps identity attributes', () => {
    const info = toElementInfo(beam)
    expect(info).toMatchObject({
      expressId: 38,
      name: 'FX1 Rörbalk 45x182 C24',
      ifcType: 'IFCBEAM',
      globalId: '1S097T84g9UZ_RGyVyqOCC',
      tag: '900001',
    })
  })

  it('maps property sets with values and measure units', () => {
    expect(toElementInfo(beam).propertySets).toEqual([
      {
        name: 'Pset_BeamCommon',
        properties: [
          { name: 'Reference', value: '45x182' },
          { name: 'Span', value: '1200', unit: 'mm' },
        ],
      },
    ])
  })

  it('maps element quantities with project units', () => {
    expect(toElementInfo(beam).quantitySets).toEqual([
      {
        name: 'BaseQuantities',
        quantities: [
          { name: 'Length', value: '1200', unit: 'mm' },
          { name: 'GrossVolume', value: '0.01', unit: 'm³' },
          { name: 'GrossWeight', value: '4.423', unit: 'kg' },
        ],
      },
    ])
  })

  // S04: elements without property sets or quantities
  it('yields empty lists for an element without property definitions', () => {
    const info = toElementInfo(proxy)
    expect(info.name).toBe('Dosa hög')
    expect(info.propertySets).toEqual([])
    expect(info.quantitySets).toEqual([])
  })

  // S03: names that still carry STEP escapes are decoded
  it('decodes STEP escapes in names and values', () => {
    const info = toElementInfo({
      ...beam,
      attributes: { ...beam.attributes, Name: { value: '16mm R\\X\\F6rutlopp', type: 1 } },
    })
    expect(info.name).toBe('16mm Rörutlopp')
  })

  it('shows booleans and enumerations readably', () => {
    const info = toElementInfo({
      ...beam,
      propertyDefinitions: [
        {
          Name: { value: 'Pset_Test' },
          HasProperties: [
            { Name: { value: 'IsExternal' }, NominalValue: { type: 3, name: 'IFCBOOLEAN', value: false } },
            { Name: { value: 'Status' }, EnumerationValues: [{ value: 'NEW' }, { value: 'EXISTING' }] },
          ],
        },
      ],
    })
    expect(info.propertySets[0].properties).toEqual([
      { name: 'IsExternal', value: 'No' },
      { name: 'Status', value: 'NEW, EXISTING' },
    ])
  })
})

describe('formatNumber', () => {
  it('rounds to at most 3 decimals', () => {
    expect(formatNumber(254.99999999906868)).toBe('255')
    expect(formatNumber(1.148647499995805)).toBe('1.149')
    expect(formatNumber(0)).toBe('0')
  })
})
