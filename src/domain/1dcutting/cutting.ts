// Types and helpers shared by the 1D cutting stock planner. See docs/specs/1d-cutting/1d-cutting.md.

// Cross-section in mm, normalised so thicknessMm <= widthMm (95x45 → 45x95).
export interface Profile {
  thicknessMm: number
  widthMm: number
}

// One physical piece that has to be cut.
export interface CutDemand {
  // IFC Tag = Vertex OID, unique within one planCuts call.
  ifcTag: string
  profile: Profile
  // Strength class ('C24') or sorting class ('T2', normalised to C24).
  grade: string
  // Required cut length.
  lengthMm: number
}

export type Finish = 'hyvlat' | 'sågat'

// One purchasable article from the stock list.
export interface StockArticle {
  // Stable id, e.g. '45x95-C24-3600'.
  id: string
  finish: Finish
  profile: Profile
  // Always a C class.
  grade: string
  lengthMm: number
}

export interface PlannedCut {
  ifcTag: string
  lengthMm: number
  offsetMm: number
}

export interface BoardPlan {
  article: StockArticle
  // In cutting order; offsets start at 0 (kerf 0).
  cuts: PlannedCut[]
  usedMm: number
  // article.lengthMm - usedMm
  wasteMm: number
}

export type UnplacedReason = 'no-matching-stock' | 'too-long' | 'invalid-length'

export interface UnplacedDemand {
  demand: CutDemand
  reason: UnplacedReason
}

export interface OrderLine {
  article: StockArticle
  quantity: number
}

export interface CuttingTotals {
  placedPieces: number
  unplacedPieces: number
  requiredMm: number
  purchasedMm: number
  wasteMm: number
  // wasteMm / purchasedMm * 100, 0 when nothing is purchased.
  wastePct: number
}

export interface CuttingPlan {
  boards: BoardPlan[]
  // Boards aggregated per article, in board order.
  orderLines: OrderLine[]
  unplaced: UnplacedDemand[]
  totals: CuttingTotals
}

export function normaliseProfile(a: number, b: number): Profile {
  return { thicknessMm: Math.min(a, b), widthMm: Math.max(a, b) }
}

// Swedish sorting classes (SS 230120) and their strength-class equivalents (SS-EN 338).
const GRADE_ALIASES: Record<string, string> = { T0: 'C14', T1: 'C18', T2: 'C24', T3: 'C30' }

export function normaliseGrade(grade: string): string {
  const upper = grade.trim().toUpperCase()
  return GRADE_ALIASES[upper] ?? upper
}

// e.g. '45x95'
export function profileLabel(profile: Profile): string {
  return `${profile.thicknessMm}x${profile.widthMm}`
}
