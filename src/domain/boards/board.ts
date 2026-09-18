import { isLine, scalar, text, type RawLine } from '../ifc/elementInfo.ts'

// A board is a piece of linear sawn or glued timber, bought in standard lengths:
// framing (IFCBEAM / IFCCOLUMN) or siding (IFCCOVERING).
export type BoardKind = 'framing' | 'siding'

// 'unparsed': profile and grade could not be read from the name.
// 'no-length': the element has no usable `Length` quantity.
export type BoardIssue = 'unparsed' | 'no-length'

export interface BoardProfile {
  // Nominal cross-section in mm, as written in the name (decimals allowed).
  thickness: number
  width: number
  // e.g. '_S' or '_sta_Z'; empty when there is none.
  suffix: string
  // The profile exactly as written in the name, e.g. '45x220_S' or '9.762523x95'.
  label: string
}

export interface Board {
  expressId: number
  globalId: string
  // Upper-case IFC entity name, e.g. 'IFCBEAM'.
  ifcType: string
  kind: BoardKind
  // Vertex object ID (IFC Tag), the join key to components.xml.
  oid: string
  // Full decoded IFC name, including a trailing variant `*`.
  name: string
  // Leading token of the name, e.g. 'FD5'. Empty for unparsed names.
  pieceCode: string
  // Name minus piece code, profile and grade (e.g. 'Opening header beam'). The full name for
  // unparsed names.
  role: string
  profile: BoardProfile | null
  // e.g. 'C24' or 'GL'. Empty for unparsed names.
  grade: string
  // Raw `Length` quantity in model length units (mm): the required cut length.
  length: number | null
  // Name of the nearest enclosing IFCELEMENTASSEMBLY (prefab element), e.g. 'GOLV-131*'.
  element: string
  issues: BoardIssue[]
}

export interface RawBoardData {
  expressId: number
  // IFC entity name in any case, e.g. 'IFCBEAM' or 'IfcBeam'.
  ifcTypeName: string
  // The product line (Name, Tag, GlobalId).
  attributes: RawLine
  // Quantity lines from the element's IFCELEMENTQUANTITY sets.
  quantities: RawLine[]
  // The nearest ancestor IFCELEMENTASSEMBLY line, if any.
  assembly: RawLine | null
}

export interface ParsedBoardName {
  pieceCode: string
  role: string
  profile: BoardProfile
  grade: string
}

const BOARD_KINDS: Record<string, BoardKind> = {
  IFCBEAM: 'framing',
  IFCCOLUMN: 'framing',
  IFCCOVERING: 'siding',
}

// Vertex BD names end in `<T>x<W>[suffix] <grade>`, e.g. `100 Sill plate 45x220_S C24`.
// Everything before the profile is `<piece code> <role>`.
const NAME_PATTERN = /^(.*?)(?:^|\s)((\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(_\S+)?)\s+([A-Za-z][A-Za-z0-9]*)$/

// Parses a Vertex BD board name. Returns null when there is no `<T>x<W> <grade>` part.
// A trailing variant `*` is ignored.
export function parseBoardName(name: string): ParsedBoardName | null {
  const match = NAME_PATTERN.exec(name.trim().replace(/\*+$/, '').trimEnd())
  if (!match) return null
  const [, head, label, thickness, width, suffix = '', grade] = match
  const [pieceCode = '', ...role] = head.trim().split(/\s+/)
  return {
    pieceCode,
    role: role.join(' '),
    profile: { thickness: Number(thickness), width: Number(width), suffix, label },
    grade,
  }
}

export function toBoard(raw: RawBoardData): Board {
  const ifcType = raw.ifcTypeName.toUpperCase()
  const name = text(raw.attributes.Name) // text() decodes STEP escapes (decodeIfcString)
  const parsed = parseBoardName(name)
  const length = lengthOf(raw.quantities)
  const issues: BoardIssue[] = []
  if (!parsed) issues.push('unparsed')
  if (length === null) issues.push('no-length')

  return {
    expressId: raw.expressId,
    globalId: text(raw.attributes.GlobalId),
    ifcType,
    kind: BOARD_KINDS[ifcType] ?? 'framing',
    oid: text(raw.attributes.Tag),
    name,
    pieceCode: parsed?.pieceCode ?? '',
    role: parsed ? parsed.role : name.trim(),
    profile: parsed?.profile ?? null,
    grade: parsed?.grade ?? '',
    length,
    element: raw.assembly ? text(raw.assembly.Name) : '',
    issues,
  }
}

function lengthOf(quantities: RawLine[]): number | null {
  for (const q of quantities.filter(isLine)) {
    if (text(q.Name) !== 'Length') continue
    const value = scalar(q.LengthValue)
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}
