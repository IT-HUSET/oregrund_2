import { describe, expect, it } from 'vitest'
import { decodeIfcString } from './decodeIfcString.ts'

// S03: STEP-escaped Swedish names are decoded
describe('decodeIfcString', () => {
  it.each([
    ['16mm R\\X\\F6rutlopp', '16mm Rörutlopp'],
    ['B\\X\\C4RLINA', 'BÄRLINA'],
    ['\\X2\\00F6\\X0\\', 'ö'],
    ['Dosa h\\X2\\00F600E5\\X0\\g', 'Dosa höåg'],
    ['\\X4\\0001F600\\X0\\', '😀'],
    ['\\S\\V', 'Ö'],
    ['a\\\\b', 'a\\b'],
  ])('decodes %s', (input, expected) => {
    expect(decodeIfcString(input)).toBe(expected)
  })

  it('returns plain and already-decoded text unchanged', () => {
    expect(decodeIfcString('FD5 Opening header beam 45x182 C24')).toBe('FD5 Opening header beam 45x182 C24')
    expect(decodeIfcString('16mm Rörutlopp')).toBe('16mm Rörutlopp')
  })
})
