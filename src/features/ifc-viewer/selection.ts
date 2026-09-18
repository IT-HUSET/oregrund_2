// What the 3D viewport highlights. See docs/specs/cut-traceability/cut-traceability.md.
export interface ViewportSelection {
  // expressID with the strong highlight, or null.
  primary: number | null
  // expressIDs with the softer highlight; an id equal to primary is ignored.
  related: readonly number[]
  // Draw every other mesh translucent, so enclosed pieces stay visible.
  ghostOthers: boolean
  // Bump to frame the primary and related elements once; 0 = never framed.
  frameRequest: number
}

export const EMPTY_SELECTION: ViewportSelection = { primary: null, related: [], ghostOthers: false, frameRequest: 0 }
