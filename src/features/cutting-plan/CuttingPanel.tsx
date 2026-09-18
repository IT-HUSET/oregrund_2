import { useEffect, useMemo, useRef, useState } from 'react'
import { formatCount, formatMetres, formatMm } from '../../components/format.ts'
import type { SkippedBoard } from '../../domain/1dcutting/boardDemands.ts'
import { profileLabel, type BoardPlan, type CuttingPlan, type OrderLine } from '../../domain/1dcutting/cutting.ts'
import { groupBoards, NOT_PLANNED_REASONS, type PlanResult } from '../../domain/1dcutting/traceability.ts'
import type { Board } from '../../domain/boards/board.ts'
import './CuttingPanel.css'

// A request to show pieces in 3D: one primary piece, or a set with a label.
export interface ModelTrace {
  oids: string[]
  primary?: string
  label?: string
}

// The cut to scroll to and focus; seq makes a repeated request for the same OID count again.
export interface CutTarget {
  oid: string
  seq: number
}

interface CuttingPanelProps {
  // null while the board list is being built.
  boards: readonly Board[] | null
  // The plan of `boards` (computeCuttingPlan); null while the board list is being built.
  plan: PlanResult | null
  error?: boolean
  // Enables the "Show in 3D" actions.
  onShowInModel?(trace: ModelTrace): void
  cutTarget?: CutTarget | null
}

type ShowInModel = CuttingPanelProps['onShowInModel']

// The "Not planned" list starts collapsed above this many rows.
const COLLAPSE_ABOVE = 20

const MISSING_ELEMENT = 'Element not found in the model'

export function CuttingPanel({ boards, plan, error = false, onShowInModel, cutTarget = null }: CuttingPanelProps) {
  if (error) return <p className="cutting__message">The board list could not be built from this model.</p>
  if (!boards || !plan) return <p className="cutting__message">Planning cuts…</p>
  if (boards.length === 0) return <p className="cutting__message">No boards found in this model.</p>
  return <CuttingPlanView boards={boards} result={plan} onShowInModel={onShowInModel} cutTarget={cutTarget} />
}

interface CuttingPlanViewProps {
  boards: readonly Board[]
  result: PlanResult
  onShowInModel: ShowInModel
  cutTarget: CutTarget | null
}

function CuttingPlanView({ boards, result, onShowInModel, cutTarget }: CuttingPlanViewProps) {
  const boardByOid = useMemo(() => new Map(boards.map((b) => [b.oid, b])), [boards])
  const rootRef = useRef<HTMLDivElement>(null)

  // Scroll to and focus the target cut once per request. The panel is shown in the same commit.
  useEffect(() => {
    if (!cutTarget) return
    const cut = [...(rootRef.current?.querySelectorAll<HTMLElement>('[data-oid]') ?? [])].find(
      (el) => el.dataset.oid === cutTarget.oid,
    )
    if (!cut) return
    cut.scrollIntoView?.({ block: 'center' })
    ;(cut.querySelector('button') ?? cut).focus()
  }, [cutTarget])

  if ('error' in result) {
    return <p className="cutting__message">The cutting plan could not be computed for this model.</p>
  }
  const { plan, skipped } = result
  const { totals } = plan
  const notPlanned = skipped.length + plan.unplaced.length

  return (
    <div className="cutting" ref={rootRef}>
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
                {onShowInModel && (
                  <th scope="col">
                    <span className="visually-hidden">3D</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {plan.orderLines.map((line) => (
                <OrderRow key={line.article.id} line={line} plan={plan} onShowInModel={onShowInModel} />
              ))}
            </tbody>
          </table>
        </section>
      )}

      {plan.boards.length > 0 && (
        <CutBoards
          boards={plan.boards}
          boardByOid={boardByOid}
          onShowInModel={onShowInModel}
          targetOid={cutTarget?.oid ?? null}
        />
      )}

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

interface OrderRowProps {
  line: OrderLine
  plan: CuttingPlan
  onShowInModel: ShowInModel
}

function OrderRow({ line: { article, quantity }, plan, onShowInModel }: OrderRowProps) {
  const label = `${profileLabel(article.profile)} ${article.grade} · ${formatMm(article.lengthMm)} mm`
  return (
    <tr>
      <td>{profileLabel(article.profile)}</td>
      <td>{article.grade}</td>
      <td>{article.finish}</td>
      <td className="cutting__num">{formatMm(article.lengthMm)}</td>
      <td className="cutting__num">{formatCount(quantity)}</td>
      <td className="cutting__num">{formatMetres(article.lengthMm * quantity)}</td>
      {onShowInModel && (
        <td>
          <button
            type="button"
            className="cutting__show"
            aria-label={`Show ${label} in 3D`}
            onClick={() =>
              onShowInModel({
                oids: plan.boards.filter((b) => b.article.id === article.id).flatMap((b) => b.cuts.map((c) => c.ifcTag)),
                label,
              })
            }
          >
            Show in 3D
          </button>
        </td>
      )}
    </tr>
  )
}

interface CutBoardsProps {
  boards: readonly BoardPlan[]
  boardByOid: ReadonlyMap<string, Board>
  onShowInModel: ShowInModel
  targetOid: string | null
}

// One bar per purchased board, grouped by profile + grade. All bars share one scale:
// 100 % = the longest purchased article.
function CutBoards({ boards, boardByOid, onShowInModel, targetOid }: CutBoardsProps) {
  const scaleMm = Math.max(...boards.map((b) => b.article.lengthMm))
  const groups = groupBoards(boards)

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
            {group.boards.map(({ plan: board }, i) => (
              <CutBoard
                key={board.cuts[0].ifcTag}
                board={board}
                label={`${group.label} board ${i + 1}: ${formatMm(board.article.lengthMm)} mm`}
                scaleMm={scaleMm}
                boardByOid={boardByOid}
                onShowInModel={onShowInModel}
                targetOid={targetOid}
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
  onShowInModel: ShowInModel
  targetOid: string | null
}

function CutBoard({ board, label, scaleMm, boardByOid, onShowInModel, targetOid }: CutBoardProps) {
  const { article, cuts } = board
  const waste = Math.round(board.wasteMm)
  const wasteLabel = `Waste ${formatMm(board.wasteMm)} mm`
  const oids = cuts.map((c) => c.ifcTag)
  const current = targetOid !== null && oids.includes(targetOid)
  const allInModel = oids.every((oid) => boardByOid.has(oid))
  return (
    <div className={`cutting__board${current ? ' cutting__board--current' : ''}`}>
      <span className="cutting__board-length">{formatMm(article.lengthMm)} mm</span>
      <div className="cutting__track">
        <ol className="cutting__bar" aria-label={label} style={{ width: percent(article.lengthMm, scaleMm) }}>
          {cuts.map((cut, i) => {
            const source = boardByOid.get(cut.ifcTag)
            const cutLabel = [
              `OID ${cut.ifcTag}`,
              source?.role,
              source?.element,
              `${formatMm(cut.lengthMm)} mm`,
              `offset ${formatMm(cut.offsetMm)} mm`,
            ]
              .filter(Boolean)
              .join(' · ')
            const isTarget = cut.ifcTag === targetOid
            const inModel = source !== undefined
            const text = (
              <span className="cutting__cut-label" aria-hidden="true">
                {cut.ifcTag}
              </span>
            )
            return (
              <li
                key={cut.ifcTag}
                data-oid={cut.ifcTag}
                className={`cutting__cut cutting__cut--${i % 2 === 0 ? 'a' : 'b'}${isTarget ? ' cutting__cut--current' : ''}`}
                style={{ width: percent(cut.lengthMm, article.lengthMm) }}
                tabIndex={onShowInModel ? undefined : 0}
                aria-label={cutLabel}
                aria-current={isTarget || undefined}
                title={cutLabel}
              >
                {onShowInModel ? (
                  <button
                    type="button"
                    className="cutting__cut-button"
                    aria-label={`Show OID ${cut.ifcTag} in 3D`}
                    title={inModel ? cutLabel : MISSING_ELEMENT}
                    disabled={!inModel}
                    onClick={() => onShowInModel({ oids: [cut.ifcTag], primary: cut.ifcTag })}
                  >
                    {text}
                  </button>
                ) : (
                  text
                )}
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
      <span className="cutting__board-waste">{waste > 0 ? `waste ${formatMm(board.wasteMm)} mm` : ''}</span>
      {onShowInModel && (
        <button
          type="button"
          className="cutting__show"
          aria-label={`Show ${label} in 3D`}
          title={allInModel ? `Show this board's ${cuts.length} pieces in 3D` : MISSING_ELEMENT}
          disabled={!allInModel}
          onClick={() => onShowInModel({ oids, label })}
        >
          3D
        </button>
      )}
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
    ...plan.unplaced.map((u) => ({
      oid: u.demand.ifcTag,
      board: boardByOid.get(u.demand.ifcTag),
      reason: NOT_PLANNED_REASONS[u.reason],
    })),
    ...skipped.map((s) => ({ oid: s.board.oid, board: s.board, reason: NOT_PLANNED_REASONS[s.reason] })),
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
