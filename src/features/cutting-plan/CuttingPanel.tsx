import { useEffect, useMemo, useState } from 'react'
import { formatCount, formatMetres, formatMm } from '../../components/format.ts'
import { boardsToDemands, type SkipReason, type SkippedBoard } from '../../domain/1dcutting/boardDemands.ts'
import { profileLabel, type BoardPlan, type CuttingPlan, type UnplacedReason } from '../../domain/1dcutting/cutting.ts'
import { planCuts } from '../../domain/1dcutting/planCuts.ts'
import { SVENSKT_TRA_SORTIMENT } from '../../domain/1dcutting/stock.ts'
import type { Board } from '../../domain/boards/board.ts'
import './CuttingPanel.css'

interface CuttingPanelProps {
  // null while the board list is being built.
  boards: readonly Board[] | null
  error?: boolean
}

type PlanResult = { plan: CuttingPlan; skipped: SkippedBoard[] } | { error: unknown }

const REASONS: Record<UnplacedReason | SkipReason, string> = {
  'no-matching-stock': 'No matching stock article',
  'too-long': 'Longer than the longest stock length',
  'invalid-length': 'Invalid length',
  unparsed: 'Name could not be read',
  'no-length': 'Missing length',
}

// The "Not planned" list starts collapsed above this many rows.
const COLLAPSE_ABOVE = 20

export function CuttingPanel({ boards, error = false }: CuttingPanelProps) {
  if (error) return <p className="cutting__message">The board list could not be built from this model.</p>
  if (!boards) return <p className="cutting__message">Planning cuts…</p>
  if (boards.length === 0) return <p className="cutting__message">No boards found in this model.</p>
  return <CuttingPlanView boards={boards} />
}

function CuttingPlanView({ boards }: { boards: readonly Board[] }) {
  const result = useMemo<PlanResult>(() => {
    try {
      const { demands, skipped } = boardsToDemands(boards)
      return { plan: planCuts(demands, SVENSKT_TRA_SORTIMENT), skipped }
    } catch (error) {
      return { error }
    }
  }, [boards])
  const boardByOid = useMemo(() => new Map(boards.map((b) => [b.oid, b])), [boards])

  useEffect(() => {
    if ('error' in result) console.error('Failed to compute the cutting plan', result.error)
  }, [result])

  if ('error' in result) {
    return <p className="cutting__message">The cutting plan could not be computed for this model.</p>
  }
  const { plan, skipped } = result
  const { totals } = plan
  const notPlanned = skipped.length + plan.unplaced.length

  return (
    <div className="cutting">
      <section className="cutting__section" aria-labelledby="cutting-report-heading">
        <h2 id="cutting-report-heading">Waste report</h2>
        <dl className="cutting__totals">
          <Stat label="Pieces placed" value={formatCount(totals.placedPieces)} />
          <Stat label="Not planned" value={formatCount(notPlanned)} />
          <Stat label="Boards to buy" value={formatCount(plan.boards.length)} />
          <Stat label="Purchased" value={formatMetres(totals.purchasedMm)} />
          <Stat label="Required" value={formatMetres(totals.requiredMm)} />
          <Stat
            label="Waste"
            value={`${formatMetres(totals.wasteMm)} (${totals.wastePct.toLocaleString('en-US', { maximumFractionDigits: 1 })} %)`}
          />
        </dl>
      </section>

      {plan.boards.length > 0 && (
        <section className="cutting__section" aria-labelledby="cutting-order-heading">
          <h2 id="cutting-order-heading">Order list</h2>
          <table className="cutting__table" aria-labelledby="cutting-order-heading">
            <thead>
              <tr>
                <th scope="col">Profile</th>
                <th scope="col">Grade</th>
                <th scope="col">Finish</th>
                <th scope="col" className="cutting__num">
                  Length (mm)
                </th>
                <th scope="col" className="cutting__num">
                  Qty
                </th>
                <th scope="col" className="cutting__num">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {plan.orderLines.map(({ article, quantity }) => (
                <tr key={article.id}>
                  <td>{profileLabel(article.profile)}</td>
                  <td>{article.grade}</td>
                  <td>{article.finish}</td>
                  <td className="cutting__num">{formatMm(article.lengthMm)}</td>
                  <td className="cutting__num">{formatCount(quantity)}</td>
                  <td className="cutting__num">{formatMetres(article.lengthMm * quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {plan.boards.length > 0 && <CutBoards boards={plan.boards} boardByOid={boardByOid} />}

      {notPlanned > 0 && <NotPlanned plan={plan} skipped={skipped} boardByOid={boardByOid} />}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="cutting__stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

interface CutBoardsProps {
  boards: readonly BoardPlan[]
  boardByOid: ReadonlyMap<string, Board>
}

// One bar per purchased board, grouped by profile + grade (boards arrive sorted, so each group
// is contiguous). All bars share one scale: 100 % = the longest purchased article.
function CutBoards({ boards, boardByOid }: CutBoardsProps) {
  const scaleMm = Math.max(...boards.map((b) => b.article.lengthMm))
  const groups: { label: string; boards: BoardPlan[] }[] = []
  for (const board of boards) {
    const label = `${profileLabel(board.article.profile)} ${board.article.grade}`
    const last = groups[groups.length - 1]
    if (last?.label === label) last.boards.push(board)
    else groups.push({ label, boards: [board] })
  }

  return (
    <section className="cutting__section" aria-labelledby="cutting-boards-heading">
      <h2 id="cutting-boards-heading">Cutting list</h2>
      {groups.map((group, g) => (
        <div key={group.label} className="cutting__group">
          <div className="cutting__heading">
            <h3 id={`cutting-group-${g}`}>{group.label}</h3>
            <span className="cutting__muted">
              {formatCount(group.boards.length)} {group.boards.length === 1 ? 'board' : 'boards'}
            </span>
          </div>
          <div className="cutting__boards">
            {group.boards.map((board, i) => (
              <CutBoard
                key={board.cuts[0].ifcTag}
                board={board}
                label={`${group.label} board ${i + 1}: ${formatMm(board.article.lengthMm)} mm`}
                scaleMm={scaleMm}
                boardByOid={boardByOid}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

interface CutBoardProps {
  board: BoardPlan
  label: string
  scaleMm: number
  boardByOid: ReadonlyMap<string, Board>
}

function CutBoard({ board, label, scaleMm, boardByOid }: CutBoardProps) {
  const { article, cuts } = board
  const waste = Math.round(board.wasteMm)
  const wasteLabel = `Waste ${formatMm(board.wasteMm)} mm`
  return (
    <div className="cutting__board">
      <span className="cutting__board-length">{formatMm(article.lengthMm)}</span>
      <div className="cutting__track">
        <ol className="cutting__bar" aria-label={label} style={{ width: percent(article.lengthMm, scaleMm) }}>
          {cuts.map((cut, i) => {
            const source = boardByOid.get(cut.ifcTag)
            const cutLabel = [
              `OID ${cut.ifcTag}`,
              source?.role,
              source?.element,
              `${formatMm(cut.lengthMm)} mm`,
              `offset ${formatMm(cut.offsetMm)}`,
            ]
              .filter(Boolean)
              .join(' · ')
            return (
              <li
                key={cut.ifcTag}
                className={`cutting__cut cutting__cut--${i % 2 === 0 ? 'a' : 'b'}`}
                style={{ width: percent(cut.lengthMm, article.lengthMm) }}
                tabIndex={0}
                aria-label={cutLabel}
                title={cutLabel}
              >
                <span className="cutting__cut-label" aria-hidden="true">
                  {cut.ifcTag}
                </span>
              </li>
            )
          })}
          {waste > 0 && (
            <li
              className="cutting__cut cutting__waste"
              style={{ width: percent(board.wasteMm, article.lengthMm) }}
              aria-label={wasteLabel}
              title={wasteLabel}
            >
              <span className="cutting__cut-label" aria-hidden="true">
                waste
              </span>
            </li>
          )}
        </ol>
      </div>
      <span className="cutting__board-waste">{waste > 0 ? `waste ${formatMm(board.wasteMm)}` : ''}</span>
    </div>
  )
}

interface NotPlannedProps {
  plan: CuttingPlan
  skipped: readonly SkippedBoard[]
  boardByOid: ReadonlyMap<string, Board>
}

interface NotPlannedRow {
  oid: string
  board: Board | undefined
  reason: string
}

function NotPlanned({ plan, skipped, boardByOid }: NotPlannedProps) {
  const rows: NotPlannedRow[] = [
    ...plan.unplaced.map((u) => ({ oid: u.demand.ifcTag, board: boardByOid.get(u.demand.ifcTag), reason: REASONS[u.reason] })),
    ...skipped.map((s) => ({ oid: s.board.oid, board: s.board, reason: REASONS[s.reason] })),
  ].sort((a, b) => a.oid.localeCompare(b.oid, 'en', { numeric: true }))
  const [expanded, setExpanded] = useState(rows.length <= COLLAPSE_ABOVE)

  return (
    <section className="cutting__section" aria-labelledby="cutting-unplaced-heading">
      <div className="cutting__heading">
        <h2 id="cutting-unplaced-heading">Not planned ({formatCount(rows.length)})</h2>
        <button type="button" aria-expanded={expanded} aria-controls="cutting-unplaced-table" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Hide' : 'Show'}
        </button>
      </div>
      {expanded && (
        <table id="cutting-unplaced-table" className="cutting__table" aria-labelledby="cutting-unplaced-heading">
          <thead>
            <tr>
              <th scope="col">OID</th>
              <th scope="col">Name</th>
              <th scope="col">Profile</th>
              <th scope="col" className="cutting__num">
                Length (mm)
              </th>
              <th scope="col">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ oid, board, reason }, i) => (
              <tr key={`${oid}-${i}`}>
                <td>{oid}</td>
                <td>{board?.name}</td>
                <td>{board?.profile ? `${board.profile.label} ${board.grade}` : ''}</td>
                <td className="cutting__num">{board?.length != null ? formatMm(board.length) : ''}</td>
                <td>{reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function percent(part: number, whole: number): string {
  return `${(part / whole) * 100}%`
}
