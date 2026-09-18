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
  // Boards the yard has on hand; absent means unlimited.
  quantity?: number
}

export interface PlannedCut {
  ifcTag: string
  lengthMm: number
  offsetMm: number
}

export interface BoardPlan {
  article: StockArticle
  // In cutting order; offset = previous offset + previous length + kerf.
  cuts: PlannedCut[]
  // Sum of cut lengths (pieces only, no kerf).
  usedMm: number
  // Material lost to saw cuts on this board (see the spec's Kerf Model).
  kerfMm: number
  // What is left after the last saw cut.
  offcutMm: number
  // kerfMm + offcutMm = article.lengthMm - usedMm
  wasteMm: number
}

// 'out-of-stock': the stock carries the profile and grade in a length long enough for the piece,
// but every such board is already used.
export type UnplacedReason = 'no-matching-stock' | 'too-long' | 'invalid-length' | 'out-of-stock'

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
  kerfMm: number
  offcutMm: number
  // kerfMm + offcutMm = purchasedMm - requiredMm
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
  // The kerf the plan was made with, for display.
  kerfPerCutMm: number
}

// Material removed by one saw cut (saw blade width).
export const DEFAULT_KERF_MM = 4.5

export interface PlanOptions {
  // Defaults to DEFAULT_KERF_MM; must be finite and >= 0.
  kerfMm?: number
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
