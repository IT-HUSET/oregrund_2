export function formatCount(value: number): string {
  return value.toLocaleString('en-US')
}

// Whole mm, e.g. 254.99999 → "255".
export function formatMm(mm: number): string {
  return formatCount(Math.round(mm))
}

// Totals are shown in metres with one decimal, e.g. 2408 mm → "2.4 m".
export function formatMetres(mm: number): string {
  return `${(mm / 1000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`
}
