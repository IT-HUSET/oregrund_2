import {
  normaliseGrade,
  normaliseProfile,
  type BoardPlan,
  type CutDemand,
  type CuttingPlan,
  type OrderLine,
  type StockArticle,
  type UnplacedDemand,
} from './cutting.ts'

// Float tolerance for "fits": lengths from IFC may be non-integer, and sums must not reject exact fits.
const EPS = 1e-6

interface OpenBoard {
  capacity: number
  used: number
  pieces: CutDemand[]
}

interface Candidate {
  boards: { article: StockArticle; pieces: CutDemand[]; used: number }[]
  waste: number
  openingLength: number
}

// Plans which stock boards to buy and how to cut them: per (profile, grade) group, First Fit
// Decreasing for every stock length as the opening length, each board downsized to the shortest
// article that fits, keeping the candidate with the least waste. Deterministic; does not mutate
// its inputs. Throws when two demands share an ifcTag.
export function planCuts(demands: readonly CutDemand[], stock: readonly StockArticle[]): CuttingPlan {
  const seen = new Set<string>()
  for (const d of demands) {
    if (seen.has(d.ifcTag)) throw new Error(`Duplicate ifcTag '${d.ifcTag}' in cut demands`)
    seen.add(d.ifcTag)
  }

  // Articles per group, ascending by length (one per length).
  const articlesByGroup = new Map<string, StockArticle[]>()
  for (const article of stock) {
    const key = groupKey(article)
    const list = articlesByGroup.get(key) ?? []
    if (!list.some((a) => a.lengthMm === article.lengthMm)) list.push(article)
    articlesByGroup.set(key, list)
  }
  for (const list of articlesByGroup.values()) list.sort((a, b) => a.lengthMm - b.lengthMm)

  const unplaced: UnplacedDemand[] = []
  const groups = new Map<string, CutDemand[]>()
  for (const demand of demands) {
    if (!(Number.isFinite(demand.lengthMm) && demand.lengthMm > 0)) {
      unplaced.push({ demand, reason: 'invalid-length' })
      continue
    }
    const key = groupKey(demand)
    const list = groups.get(key) ?? []
    list.push(demand)
    groups.set(key, list)
  }

  const boards: BoardPlan[] = []
  for (const [key, members] of groups) {
    const articles = articlesByGroup.get(key)
    if (!articles) {
      for (const demand of members) unplaced.push({ demand, reason: 'no-matching-stock' })
      continue
    }
    const longest = articles[articles.length - 1].lengthMm
    const fitting: CutDemand[] = []
    for (const demand of members) {
      if (demand.lengthMm > longest + EPS) unplaced.push({ demand, reason: 'too-long' })
      else fitting.push(demand)
    }
    if (fitting.length === 0) continue

    fitting.sort((a, b) => b.lengthMm - a.lengthMm || compareTags(a.ifcTag, b.ifcTag))
    let best: Candidate | null = null
    for (const { lengthMm } of articles) {
      const candidate = firstFitDecreasing(fitting, articles, lengthMm)
      if (!best || isBetter(candidate, best)) best = candidate
    }
    for (const board of best!.boards) boards.push(toBoardPlan(board.article, board.pieces, board.used))
  }

  boards.sort(compareBoards)
  unplaced.sort((a, b) => compareTags(a.demand.ifcTag, b.demand.ifcTag))

  const orderLines: OrderLine[] = []
  const lineByArticle = new Map<string, OrderLine>()
  for (const { article } of boards) {
    const line = lineByArticle.get(article.id)
    if (line) {
      line.quantity++
    } else {
      const created = { article, quantity: 1 }
      lineByArticle.set(article.id, created)
      orderLines.push(created)
    }
  }

  const requiredMm = sum(boards.map((b) => b.usedMm))
  const purchasedMm = sum(boards.map((b) => b.article.lengthMm))
  const wasteMm = sum(boards.map((b) => b.wasteMm))
  return {
    boards,
    orderLines,
    unplaced,
    totals: {
      placedPieces: sum(boards.map((b) => b.cuts.length)),
      unplacedPieces: unplaced.length,
      requiredMm,
      purchasedMm,
      wasteMm,
      wastePct: purchasedMm > 0 ? (wasteMm / purchasedMm) * 100 : 0,
    },
  }
}

// `pieces` is sorted by length descending. A piece longer than the opening length opens a board
// of the shortest article that fits it.
function firstFitDecreasing(pieces: readonly CutDemand[], articles: readonly StockArticle[], openingLength: number): Candidate {
  const open: OpenBoard[] = []
  for (const piece of pieces) {
    const board = open.find((b) => b.used + piece.lengthMm <= b.capacity + EPS)
    if (board) {
      board.used += piece.lengthMm
      board.pieces.push(piece)
    } else {
      const capacity = piece.lengthMm <= openingLength + EPS ? openingLength : shortestFitting(articles, piece.lengthMm).lengthMm
      open.push({ capacity, used: piece.lengthMm, pieces: [piece] })
    }
  }
  const boards = open.map((b) => ({ article: shortestFitting(articles, b.used), pieces: b.pieces, used: b.used }))
  return { boards, waste: sum(boards.map((b) => b.article.lengthMm - b.used)), openingLength }
}

function shortestFitting(articles: readonly StockArticle[], usedMm: number): StockArticle {
  return articles.find((a) => usedMm <= a.lengthMm + EPS)!
}

// Least waste, then fewest boards, then the smallest opening length.
function isBetter(a: Candidate, b: Candidate): boolean {
  if (Math.abs(a.waste - b.waste) > EPS) return a.waste < b.waste
  if (a.boards.length !== b.boards.length) return a.boards.length < b.boards.length
  return a.openingLength < b.openingLength
}

function toBoardPlan(article: StockArticle, pieces: readonly CutDemand[], used: number): BoardPlan {
  let offsetMm = 0
  const cuts = pieces.map((piece) => {
    const cut = { ifcTag: piece.ifcTag, lengthMm: piece.lengthMm, offsetMm }
    offsetMm += piece.lengthMm
    return cut
  })
  return { article, cuts, usedMm: used, wasteMm: Math.max(0, article.lengthMm - used) }
}

function groupKey(item: { profile: { thicknessMm: number; widthMm: number }; grade: string }): string {
  const { thicknessMm, widthMm } = normaliseProfile(item.profile.thicknessMm, item.profile.widthMm)
  return `${thicknessMm}x${widthMm} ${normaliseGrade(item.grade)}`
}

// Thickness, width and grade ascending, then board length descending, then the first cut's tag.
function compareBoards(a: BoardPlan, b: BoardPlan): number {
  return (
    a.article.profile.thicknessMm - b.article.profile.thicknessMm ||
    a.article.profile.widthMm - b.article.profile.widthMm ||
    compareTags(a.article.grade, b.article.grade) ||
    b.article.lengthMm - a.article.lengthMm ||
    compareTags(a.cuts[0].ifcTag, b.cuts[0].ifcTag)
  )
}

// Locale-independent, so the plan is the same in every environment.
function compareTags(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function sum(values: readonly number[]): number {
  return values.reduce((total, v) => total + v, 0)
}
