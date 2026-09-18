// A lumberyard's stock grouped for display: one group per profile and grade.
import { profileLabel, type StockArticle } from '../cutting.ts'

export interface StockGroup {
  // e.g. '45x95'
  profile: string
  grade: string
  // Sorted by length.
  articles: StockArticle[]
  // Boards on hand and their total length. Unlimited articles (no quantity) are not counted.
  boards: number
  lengthMm: number
}

export interface StockSummary {
  // Sorted by thickness, width and grade.
  groups: StockGroup[]
  articles: number
  boards: number
  lengthMm: number
}

export function summarizeStock(stock: readonly StockArticle[]): StockSummary {
  const sorted = [...stock].sort(
    (a, b) =>
      a.profile.thicknessMm - b.profile.thicknessMm ||
      a.profile.widthMm - b.profile.widthMm ||
      a.grade.localeCompare(b.grade, 'en', { numeric: true }) ||
      a.lengthMm - b.lengthMm,
  )
  const groups: StockGroup[] = []
  for (const article of sorted) {
    const profile = profileLabel(article.profile)
    let group = groups.at(-1)
    if (!group || group.profile !== profile || group.grade !== article.grade) {
      group = { profile, grade: article.grade, articles: [], boards: 0, lengthMm: 0 }
      groups.push(group)
    }
    group.articles.push(article)
    group.boards += article.quantity ?? 0
    group.lengthMm += (article.quantity ?? 0) * article.lengthMm
  }
  return {
    groups,
    articles: stock.length,
    boards: groups.reduce((sum, g) => sum + g.boards, 0),
    lengthMm: groups.reduce((sum, g) => sum + g.lengthMm, 0),
  }
}
