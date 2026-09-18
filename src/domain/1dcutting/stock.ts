import { normaliseProfile, profileLabel, type Finish, type Profile, type StockArticle } from './cutting.ts'
import sortimentCsv from './svenskt_tra_virkessortiment.csv?raw'

const COLUMNS = ['typ', 'utförande', 'tjocklek_mm', 'bredd_mm', 'hållfasthetsklass', 'sorteringsklass', 'längd_mm', 'källa']
const FINISHES: readonly string[] = ['hyvlat', 'sågat'] satisfies Finish[]

// Parses the stock table: `tvärsnitt`, `hållfasthetsklass` and `längd` rows, whose cross product
// is the list of articles. Throws on the first malformed row, naming its 1-based line number.
export function parseStockCsv(csv: string): StockArticle[] {
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/)
  const header = lines[0]?.split(';').map((c) => c.trim())
  if (!header || COLUMNS.some((c, i) => header[i] !== c)) {
    throw new Error(`Stock CSV line 1: expected the header ${COLUMNS.join(';')}`)
  }

  const sections: { finish: Finish; profile: Profile }[] = []
  const grades: string[] = []
  const lengths: number[] = []

  lines.slice(1).forEach((line, index) => {
    if (line.trim() === '') return
    const lineNo = index + 2
    const fail = (message: string): never => {
      throw new Error(`Stock CSV line ${lineNo}: ${message}`)
    }
    const [typ, finish, thickness, width, grade, , length] = line.split(';').map((c) => c.trim())
    switch (typ) {
      case 'tvärsnitt':
        if (!FINISHES.includes(finish)) fail(`unknown utförande '${finish}'`)
        sections.push({
          finish: finish as Finish,
          profile: normaliseProfile(positive(thickness, 'tjocklek_mm', fail), positive(width, 'bredd_mm', fail)),
        })
        break
      case 'hållfasthetsklass':
        if (!/^C\d+$/.test(grade ?? '')) fail(`invalid hållfasthetsklass '${grade ?? ''}'`)
        grades.push(grade)
        break
      case 'längd':
        lengths.push(positive(length, 'längd_mm', fail))
        break
      default:
        fail(`unknown typ '${typ}'`)
    }
  })

  return sections.flatMap(({ finish, profile }) =>
    grades.flatMap((grade) =>
      lengths.map((lengthMm) => ({
        id: `${profileLabel(profile)}-${grade}-${lengthMm}`,
        finish,
        profile,
        grade,
        lengthMm,
      })),
    ),
  )
}

function positive(value: string | undefined, column: string, fail: (message: string) => never): number {
  const n = value ? Number(value) : NaN
  if (!Number.isFinite(n) || n <= 0) fail(`${column} must be a positive number, got '${value ?? ''}'`)
  return n
}

// The Svenskt Trä timber assortment bundled with the app.
export const SVENSKT_TRA_SORTIMENT: readonly StockArticle[] = parseStockCsv(sortimentCsv)
