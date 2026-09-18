import { normaliseGrade, normaliseProfile, profileLabel, type Finish, type Profile, type StockArticle } from './cutting.ts'
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

const YARD_COLUMNS = ['typ', 'utförande', 'tjocklek_mm', 'bredd_mm', 'hållfasthetsklass', 'sorteringsklass', 'längd_mm', 'antal', 'källa']

// Parses a lumberyard's stock list: one `artikel` row per article, with the quantity on hand in
// `antal`. Throws on the first malformed row, naming its 1-based line number.
export function parseYardCsv(csv: string): StockArticle[] {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/)
  const header = lines[0]?.split(';').map((c) => c.trim())
  if (!header || header.length !== YARD_COLUMNS.length || YARD_COLUMNS.some((c, i) => header[i] !== c)) {
    throw new Error(`Stock CSV line 1: expected the header ${YARD_COLUMNS.join(';')}`)
  }

  const articles: StockArticle[] = []
  const seen = new Set<string>()
  lines.slice(1).forEach((line, index) => {
    if (line.trim() === '') return
    const lineNo = index + 2
    const fail = (message: string): never => {
      throw new Error(`Stock CSV line ${lineNo}: ${message}`)
    }
    const [typ, finish, thickness, width, grade = '', sorting = '', length, antal = ''] = line.split(';').map((c) => c.trim())
    if (typ !== 'artikel') fail(`unknown typ '${typ}'`)
    if (!FINISHES.includes(finish)) fail(`unknown utförande '${finish}'`)
    const profile = normaliseProfile(positive(thickness, 'tjocklek_mm', fail), positive(width, 'bredd_mm', fail))
    if (!/^C\d+$/.test(grade)) fail(`invalid hållfasthetsklass '${grade}'`)
    if (sorting !== '' && !(/^T\d+$/.test(sorting) && normaliseGrade(sorting) === grade)) {
      fail(`sorteringsklass '${sorting}' does not match hållfasthetsklass '${grade}'`)
    }
    const lengthMm = positive(length, 'längd_mm', fail)
    if (!/^\d+$/.test(antal)) fail(`antal must be a whole number >= 0, got '${antal}'`)

    const id = `${profileLabel(profile)}-${grade}-${lengthMm}`
    if (seen.has(id)) fail(`duplicate article ${id}`)
    seen.add(id)
    articles.push({ id, finish: finish as Finish, profile, grade, lengthMm, quantity: Number(antal) })
  })
  return articles
}

function positive(value: string | undefined, column: string, fail: (message: string) => never): number {
  const n = value ? Number(value) : NaN
  if (!Number.isFinite(n) || n <= 0) fail(`${column} must be a positive number, got '${value ?? ''}'`)
  return n
}

// The Svenskt Trä timber assortment: the reference the lumberyards' stock lists are checked
// against (no longer planner input). Pure, so a build that doesn't use it drops it.
export const SVENSKT_TRA_SORTIMENT: readonly StockArticle[] = /* @__PURE__ */ parseStockCsv(sortimentCsv)
