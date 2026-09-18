import { decodeIfcString } from './decodeIfcString.ts'

// A line object as returned by web-ifc (GetLine / properties helpers). Attribute values are
// either null, nested lines, arrays, or wrapped values such as `{ value }` (strings, booleans,
// enums) or `{ _representationValue }` (numeric measures).
export type RawLine = Record<string, unknown>

export type UnitKind = 'length' | 'area' | 'volume' | 'mass' | 'time'

// Unit symbols for the model's project units, e.g. { length: 'mm', volume: 'm³' }.
export type ProjectUnits = Partial<Record<UnitKind, string>>

export interface PropertyEntry {
  name: string
  value: string
  unit?: string
}

export interface PropertySetInfo {
  name: string
  properties: PropertyEntry[]
}

export interface QuantitySetInfo {
  name: string
  quantities: PropertyEntry[]
}

export interface ElementInfo {
  expressId: number
  name: string
  ifcType: string
  globalId: string
  tag: string
  propertySets: PropertySetInfo[]
  quantitySets: QuantitySetInfo[]
}

export interface RawElementData {
  expressId: number
  // IFC entity name in any case, e.g. 'IfcBeam' (web-ifc) – shown upper-cased.
  ifcTypeName: string
  attributes: RawLine
  // Property definitions related to the element: property sets (HasProperties) and element
  // quantities (Quantities). Other definition kinds are ignored.
  propertyDefinitions: RawLine[]
  units: ProjectUnits
}

export function toElementInfo(raw: RawElementData): ElementInfo {
  const propertySets: PropertySetInfo[] = []
  const quantitySets: QuantitySetInfo[] = []

  for (const def of raw.propertyDefinitions) {
    const setName = text(def.Name)
    if (Array.isArray(def.HasProperties)) {
      propertySets.push({
        name: setName,
        properties: def.HasProperties.filter(isLine).map((p) => toProperty(p, raw.units)),
      })
    } else if (Array.isArray(def.Quantities)) {
      quantitySets.push({
        name: setName,
        quantities: def.Quantities.filter(isLine).map((q) => toQuantity(q, raw.units)),
      })
    }
  }

  return {
    expressId: raw.expressId,
    name: text(raw.attributes.Name),
    ifcType: raw.ifcTypeName.toUpperCase(),
    globalId: text(raw.attributes.GlobalId),
    tag: text(raw.attributes.Tag),
    propertySets,
    quantitySets,
  }
}

// Resolves unit symbols from a recursively loaded IFCUNITASSIGNMENT line.
export function resolveProjectUnits(unitAssignment: RawLine | null | undefined): ProjectUnits {
  const units: ProjectUnits = {}
  const list = unitAssignment?.Units
  if (!Array.isArray(list)) return units

  for (const unit of list.filter(isLine)) {
    const kind = UNIT_TYPES[text(unit.UnitType)]
    const base = SI_SYMBOLS[text(unit.Name)]
    if (!kind || !base) continue // conversion-based and derived units are not resolved
    units[kind] = (SI_PREFIXES[text(unit.Prefix)] ?? '') + base
  }
  return units
}

// Rounds to at most 3 decimals for display (e.g. 254.99999999906868 → "255").
export function formatNumber(value: number): string {
  return String(Number(value.toFixed(3)))
}

const UNIT_TYPES: Record<string, UnitKind> = {
  LENGTHUNIT: 'length',
  AREAUNIT: 'area',
  VOLUMEUNIT: 'volume',
  MASSUNIT: 'mass',
  TIMEUNIT: 'time',
}

const SI_SYMBOLS: Record<string, string> = {
  METRE: 'm',
  SQUARE_METRE: 'm²',
  CUBIC_METRE: 'm³',
  GRAM: 'g',
  SECOND: 's',
}

const SI_PREFIXES: Record<string, string> = {
  KILO: 'k',
  HECTO: 'h',
  DECI: 'd',
  CENTI: 'c',
  MILLI: 'm',
  MICRO: 'µ',
}

const QUANTITY_VALUE_KINDS: [string, UnitKind | null][] = [
  ['LengthValue', 'length'],
  ['AreaValue', 'area'],
  ['VolumeValue', 'volume'],
  ['WeightValue', 'mass'],
  ['TimeValue', 'time'],
  ['CountValue', null],
]

const MEASURE_KINDS: Record<string, UnitKind> = {
  IFCLENGTHMEASURE: 'length',
  IFCPOSITIVELENGTHMEASURE: 'length',
  IFCNONNEGATIVELENGTHMEASURE: 'length',
  IFCAREAMEASURE: 'area',
  IFCVOLUMEMEASURE: 'volume',
  IFCMASSMEASURE: 'mass',
  IFCTIMEMEASURE: 'time',
}

function toQuantity(q: RawLine, units: ProjectUnits): PropertyEntry {
  for (const [key, kind] of QUANTITY_VALUE_KINDS) {
    if (q[key] != null) {
      return withUnit({ name: text(q.Name), value: formatValue(q[key]) }, kind, units)
    }
  }
  return { name: text(q.Name), value: '' }
}

function toProperty(p: RawLine, units: ProjectUnits): PropertyEntry {
  const name = text(p.Name)
  if (p.NominalValue != null) {
    const kind = MEASURE_KINDS[measureName(p.NominalValue)] ?? null
    return withUnit({ name, value: formatValue(p.NominalValue) }, kind, units)
  }
  for (const key of ['EnumerationValues', 'ListValues']) {
    const values = p[key]
    if (Array.isArray(values)) return { name, value: values.map(formatValue).join(', ') }
  }
  if (p.LowerBoundValue != null || p.UpperBoundValue != null) {
    return { name, value: [p.LowerBoundValue, p.UpperBoundValue].map(formatValue).join(' – ') }
  }
  return { name, value: '' }
}

function withUnit(entry: PropertyEntry, kind: UnitKind | null, units: ProjectUnits): PropertyEntry {
  const unit = kind ? units[kind] : undefined
  return unit && entry.value !== '' ? { ...entry, unit } : entry
}

function formatValue(wrapped: unknown): string {
  const v = scalar(wrapped)
  if (typeof v === 'number') return formatNumber(v)
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return v ?? ''
}

// Unwraps a web-ifc attribute value ({ value } / { _representationValue }) to a decoded string.
export function text(wrapped: unknown): string {
  const v = scalar(wrapped)
  return v == null ? '' : String(v)
}

// Unwraps a web-ifc attribute value to a decoded string, number or boolean.
export function scalar(wrapped: unknown): string | number | boolean | undefined {
  if (wrapped == null) return undefined
  if (typeof wrapped !== 'object') return normalize(wrapped)
  const w = wrapped as Record<string, unknown>
  if ('_representationValue' in w) return normalize(w._representationValue)
  if ('value' in w) return normalize(w.value)
  return undefined
}

function normalize(v: unknown): string | number | boolean | undefined {
  if (typeof v === 'string') return decodeIfcString(v)
  if (typeof v === 'number' || typeof v === 'boolean') return v
  return undefined
}

function measureName(wrapped: unknown): string {
  const name = (wrapped as { name?: unknown } | null)?.name
  return typeof name === 'string' ? name.toUpperCase() : ''
}

export function isLine(v: unknown): v is RawLine {
  return typeof v === 'object' && v !== null
}
