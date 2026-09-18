import { describe, expect, it } from 'vitest'
import { entryLabel, setLabel, valueLabel } from './ifcLabels.ts'

describe('ifcLabels', () => {
  it('translates set, property and value names to Swedish', () => {
    expect(setLabel('Pset_CoveringCommon')).toBe('Gemensamma egenskaper – beklädnad')
    expect(entryLabel('Pset_CoveringCommon', 'FireRating')).toBe('Brandklass')
    expect(entryLabel('Pset_CoveringCommon', 'IsExternal')).toBe('Utvändig')
    expect(entryLabel('Pset_CoveringCommon', 'Reference')).toBe('Beteckning')
    expect(valueLabel('UNSET')).toBe('Ej angiven')
    expect(valueLabel('No')).toBe('Nej')
    expect(valueLabel('Yes')).toBe('Ja')
  })

  it('names Finish after what Vertex stores in it, only for coverings', () => {
    expect(entryLabel('Pset_CoveringCommon', 'Finish')).toBe('Hållfasthetsklass')
    expect(entryLabel('Pset_WallCommon', 'Finish')).toBe('Ytbehandling')
  })

  it('keeps unknown names and values as they are', () => {
    expect(setLabel('Pset_Custom')).toBe('Pset_Custom')
    expect(entryLabel('Pset_Custom', 'Colour')).toBe('Colour')
    expect(valueLabel('C16')).toBe('C16')
    expect(valueLabel('')).toBe('')
  })
})
