import {
  DEFAULT_KERF_MM,
  normaliseGrade,
  normaliseProfile,
  type BoardPlan,
  type CutDemand,
  type CuttingPlan,
  type OrderLine,
  type PlanOptions,
  type StockArticle,
  type UnplacedDemand,
} from './cutting.ts'

// Float tolerance for "fits": lengths from IFC may be non-integer, and sums must not reject exact fits.
const EPS = 1e-6

interface OpenBoard {
  // The article this board is cut from; reserved while the board is open.
  article: StockArticle
  used: number
  pieces: CutDemand[]
}

interface Candidate {
  boards: OpenBoard[]
  // Pieces left over because every long enough article is used up.
  outOfStock: CutDemand[]
  // Sum of the placed pieces' lengths.
  placed: number
  waste: number
  openingLength: number
}

// Boards left of each article of one group while one candidate is built. Unlimited articles
// (no quantity) never run out.
type Remaining = Map<StockArticle, number>

// Plans which stock boards to buy and how to cut them: per (profile, grade) group, First Fit
// Decreasing for every in-stock length as the opening length, each board downsized to the shortest
// article that fits and is still in stock, keeping the candidate that places the most length, then
// has the least waste. An article is never used more times than its `quantity` (absent means
// unlimited); the longest pieces claim scarce stock first. Every saw cut removes `kerfMm` (see the
// spec's Kerf Model). Deterministic; does not mutate its inputs. Throws when two demands share an
// ifcTag or the kerf is not a finite number >= 0.
export function planCuts(
  demands: readonly CutDemand[],
  stock: readonly StockArticle[],
  options: PlanOptions = {},
): CuttingPlan {
  const kerf = options.kerfMm ?? DEFAULT_KERF_MM
  if (!(Number.isFinite(kerf) && kerf >= 0)) throw new Error(`Invalid kerf ${kerf} mm: must be a finite number >= 0`)

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
    for (const opening of articles) {
      if (opening.quantity === 0) continue
      const candidate = firstFitDecreasing(fitting, articles, opening, kerf)
      if (!best || isBetter(candidate, best)) best = candidate
    }
    for (const board of best?.boards ?? []) boards.push(toBoardPlan(board.article, board.pieces, board.used, kerf))
    for (const demand of best?.outOfStock ?? fitting) unplaced.push({ demand, reason: 'out-of-stock' })
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
  const kerfMm = sum(boards.map((b) => b.kerfMm))
  const offcutMm = sum(boards.map((b) => b.offcutMm))
  const wasteMm = kerfMm + offcutMm
  return {
    boards,
    orderLines,
    unplaced,
    totals: {
      placedPieces: sum(boards.map((b) => b.cuts.length)),
      unplacedPieces: unplaced.length,
      requiredMm,
      purchasedMm,
      kerfMm,
      offcutMm,
      wasteMm,
      wastePct: purchasedMm > 0 ? (wasteMm / purchasedMm) * 100 : 0,
    },
    kerfPerCutMm: kerf,
  }
}

// `pieces` is sorted by length descending. A piece that fits no open board opens a board of the
// opening article, or of the shortest in-stock article that fits it when the opening article is
// too short or used up. When no article long enough is left, the piece is out of stock: every such
// article is held by a board of longer pieces. Adding a piece to a board adds one kerf before it.
function firstFitDecreasing(
  pieces: readonly CutDemand[],
  articles: readonly StockArticle[],
  opening: StockArticle,
  kerf: number,
): Candidate {
  const remaining: Remaining = new Map(articles.map((a) => [a, a.quantity ?? Infinity]))
  const open: OpenBoard[] = []
  const outOfStock: CutDemand[] = []
  for (const piece of pieces) {
    const board = open.find((b) => b.used + piece.lengthMm + b.pieces.length * kerf <= b.article.lengthMm + EPS)
    if (board) {
      board.used += piece.lengthMm
      board.pieces.push(piece)
      continue
    }
    const article =
      piece.lengthMm <= opening.lengthMm + EPS && remaining.get(opening)! > 0
        ? opening
        : shortestInStock(articles, remaining, piece.lengthMm)
    if (!article) {
      outOfStock.push(piece)
      continue
    }
    remaining.set(article, remaining.get(article)! - 1)
    open.push({ article, used: piece.lengthMm, pieces: [piece] })
  }

  // Downsize each board, in opening order, to the shortest in-stock article that fits its pieces
  // plus the kerf between them. Its own article is released first, so one always fits.
  for (const board of open) {
    remaining.set(board.article, remaining.get(board.article)! + 1)
    board.article = shortestInStock(articles, remaining, board.used + (board.pieces.length - 1) * kerf)!
    remaining.set(board.article, remaining.get(board.article)! - 1)
  }

  return {
    boards: open,
    outOfStock,
    placed: sum(open.map((b) => b.used)),
    waste: sum(open.map((b) => b.article.lengthMm - b.used)),
    openingLength: opening.lengthMm,
  }
}

// `neededMm` is the pieces plus the kerf between them. `articles` is ascending by length.
function shortestInStock(articles: readonly StockArticle[], remaining: Remaining, neededMm: number): StockArticle | undefined {
  return articles.find((a) => neededMm <= a.lengthMm + EPS && remaining.get(a)! > 0)
}

// Most placed length, then least waste, then fewest boards, then the smallest opening length.
function isBetter(a: Candidate, b: Candidate): boolean {
  if (Math.abs(a.placed - b.placed) > EPS) return a.placed > b.placed
  if (Math.abs(a.waste - b.waste) > EPS) return a.waste < b.waste
  if (a.boards.length !== b.boards.length) return a.boards.length < b.boards.length
  return a.openingLength < b.openingLength
}

// One saw cut between neighbouring pieces, plus a last cut that frees the last piece from the
// offcut when anything is left; that cut removes at most what is left.
function toBoardPlan(article: StockArticle, pieces: readonly CutDemand[], used: number, kerf: number): BoardPlan {
  let offsetMm = 0
  const cuts = pieces.map((piece) => {
    const cut = { ifcTag: piece.ifcTag, lengthMm: piece.lengthMm, offsetMm }
    offsetMm += piece.lengthMm + kerf
    return cut
  })
  const between = (pieces.length - 1) * kerf
  const rest = Math.max(0, article.lengthMm - used - between)
  const lastCut = Math.min(kerf, rest)
  return { article, cuts, usedMm: used, kerfMm: between + lastCut, offcutMm: rest - lastCut, wasteMm: between + rest }
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
