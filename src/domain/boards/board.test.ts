import { describe, expect, it } from 'vitest'
import { parseBoardName, toBoard, type RawBoardData } from './board.ts'

// Raw shapes as returned by web-ifc GetLine (see src/domain/ifc/__fixtures__/web-ifc-raw.json).
const label = (value: string) => ({ value, type: 1, name: 'IFCLABEL' })
const lengthQuantity = (value: number) => ({
  Name: label('Length'),
  LengthValue: { type: 4, _representationValue: value, name: 'IFCLENGTHMEASURE' },
})

function raw(overrides: Partial<RawBoardData> & { name?: string } = {}): RawBoardData {
  const { name = 'FD5 Opening header beam 45x182 C24', ...rest } = overrides
  return {
    expressId: 1554,
    ifcTypeName: 'IFCBEAM',
    attributes: { GlobalId: label('0GO7ParmT1Tv4$2Iz4gRMP'), Name: label(name), Tag: label('589830') },
    quantities: [lengthQuantity(254.99999999906868)],
    assembly: { Name: label('GOLV-131*') },
    ...rest,
  }
}

// S01: Vertex BD names → piece code, role, profile and grade
describe('parseBoardName', () => {
  it.each([
    ['FD5 Opening header beam 45x182 C24', 'FD5', 'Opening header beam', 45, 182, '', '45x182', 'C24'],
    ['75 Stud 45x70 C24', '75', 'Stud', 45, 70, '', '45x70', 'C24'],
    ['36 Siding board 22x145_sta_Z C16', '36', 'Siding board', 22, 145, '_sta_Z', '22x145_sta_Z', 'C16'],
    ['100 Sill plate 45x220_S C24', '100', 'Sill plate', 45, 220, '_S', '45x220_S', 'C24'],
    ['155 Stud GL 90x220 GL', '155', 'Stud GL', 90, 220, '', '90x220', 'GL'],
    ['185  GL 42x270 GL', '185', 'GL', 42, 270, '', '42x270', 'GL'],
    ['92  PAR 9.762523x95 C14', '92', 'PAR', 9.762523, 95, '', '9.762523x95', 'C14'],
    ['210 Vertical batten 28x70 C24*', '210', 'Vertical batten', 28, 70, '', '28x70', 'C24'],
  ])('parses %j', (name, pieceCode, role, thickness, width, suffix, profileLabel, grade) => {
    expect(parseBoardName(name)).toEqual({
      pieceCode,
      role,
      profile: { thickness, width, suffix, label: profileLabel },
      grade,
    })
  })

  it('allows an empty role', () => {
    expect(parseBoardName('12 45x45 C24')).toMatchObject({ pieceCode: '12', role: '', grade: 'C24' })
  })

  // S06
  it.each(['Mystery piece', '', 'Stud 45x70', 'I8 WOOL-95'])('returns null for %j', (name) => {
    expect(parseBoardName(name)).toBeNull()
  })
})

describe('toBoard', () => {
  it('maps identity, parsed name, raw length and prefab element', () => {
    expect(toBoard(raw())).toEqual({
      expressId: 1554,
      globalId: '0GO7ParmT1Tv4$2Iz4gRMP',
      ifcType: 'IFCBEAM',
      kind: 'framing',
      oid: '589830',
      name: 'FD5 Opening header beam 45x182 C24',
      pieceCode: 'FD5',
      role: 'Opening header beam',
      profile: { thickness: 45, width: 182, suffix: '', label: '45x182' },
      grade: 'C24',
      length: 254.99999999906868,
      element: 'GOLV-131*',
      issues: [],
    })
  })

  it.each([
    ['IFCBEAM', 'framing'],
    ['IfcColumn', 'framing'],
    ['IFCCOVERING', 'siding'],
  ])('maps %s to %s', (ifcTypeName, kind) => {
    expect(toBoard(raw({ ifcTypeName }))).toMatchObject({ kind, ifcType: ifcTypeName.toUpperCase() })
  })

  it('decodes STEP escapes in the name and keeps the variant star', () => {
    const board = toBoard(raw({ name: '210 R\\X\\F6rbalk 28x70 C24*' }))
    expect(board).toMatchObject({ name: '210 Rörbalk 28x70 C24*', role: 'Rörbalk', grade: 'C24' })
  })

  // S06: unparsed names are kept and flagged
  it('flags an unparsed name and keeps the full name', () => {
    expect(toBoard(raw({ name: 'Mystery piece' }))).toMatchObject({
      name: 'Mystery piece',
      pieceCode: '',
      role: 'Mystery piece',
      profile: null,
      grade: '',
      issues: ['unparsed'],
    })
  })

  // S06: a missing Length is flagged
  it.each([
    ['no quantities', []],
    ['only other quantities', [{ Name: label('GrossVolume'), VolumeValue: { _representationValue: 0.01 } }]],
    ['a non-finite length', [lengthQuantity(Number.NaN)]],
  ])('flags a board with %s as no-length', (_, quantities) => {
    expect(toBoard(raw({ quantities }))).toMatchObject({ length: null, issues: ['no-length'] })
  })

  it('leaves the element empty without a parent assembly', () => {
    expect(toBoard(raw({ assembly: null })).element).toBe('')
  })
})
