import { useEffect, useMemo, useRef, useState } from 'react'
import { formatCount, formatMetres, formatMm } from '../../components/format.ts'
import { LumberyardPicker } from '../../components/LumberyardPicker.tsx'
import type { SkippedBoard } from '../../domain/1dcutting/boardDemands.ts'
import { buildCutReport } from '../../domain/1dcutting/cutReport.ts'
import { profileLabel, type BoardPlan, type CuttingPlan, type OrderLine } from '../../domain/1dcutting/cutting.ts'
import type { Lumberyard } from '../../domain/1dcutting/lumberyards/lumberyards.ts'
import { groupBoards, notPlannedText, type PlanResult } from '../../domain/1dcutting/traceability.ts'
import type { Board } from '../../domain/boards/board.ts'
import { CutReport } from './CutReport.tsx'
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
  // The plan of `boards` against `lumberyard` (computeCuttingPlan); null while the board list is
  // being built.
  plan: PlanResult | null
  error?: boolean
  // The yards to choose from, the chosen one, and how to choose another.
  lumberyards: readonly Lumberyard[]
  lumberyard: Lumberyard
  onSelectLumberyard(id: string): void
  // Enables the "Show in 3D" actions.
  onShowInModel?(trace: ModelTrace): void
  cutTarget?: CutTarget | null
}

type ShowInModel = CuttingPanelProps['onShowInModel']

// The "Not planned" list starts collapsed above this many rows.
const COLLAPSE_ABOVE = 20

const MISSING_ELEMENT = 'Element not found in the model'

export function CuttingPanel({
  boards,
  plan,
  error = false,
  lumberyards,
  lumberyard,
  onSelectLumberyard,
  onShowInModel,
  cutTarget = null,
}: CuttingPanelProps) {
  let body
  if (error) body = <p className="cutting__message">The board list could not be built from this model.</p>
  else if ('error' in lumberyard)
    body = <p className="cutting__message">The stock list for {lumberyard.name} could not be read.</p>
  else if (!boards || !plan) body = <p className="cutting__message">Planning cuts…</p>
  else if (boards.length === 0) body = <p className="cutting__message">No boards found in this model.</p>
  else
    body = (
      <CuttingPlanView
        boards={boards}
        result={plan}
        yardName={lumberyard.name}
        onShowInModel={onShowInModel}
        cutTarget={cutTarget}
      />
    )
  return (
    <div className="cutting-panel">
      <LumberyardPicker lumberyards={lumberyards} value={lumberyard.id} onChange={onSelectLumberyard} />
      {body}
    </div>
  )
}

interface CuttingPlanViewProps {
  boards: readonly Board[]
  result: PlanResult
  // The chosen lumberyard, for the report header and out-of-stock reasons.
  yardName: string
  onShowInModel: ShowInModel
  cutTarget: CutTarget | null
}

function CuttingPlanView({ boards, result, yardName, onShowInModel, cutTarget }: CuttingPlanViewProps) {
  const boardByOid = useMemo(() => new Map(boards.map((b) => [b.oid, b])), [boards])
  const rootRef = useRef<HTMLDivElement>(null)
  const reportButtonRef = useRef<HTMLButtonElement>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [seenTarget, setSeenTarget] = useState(cutTarget)
  const returnFocus = useRef(false)
  // A new cut target (from 3D) closes the report, so the scroll effect below finds the cut.
  if (cutTarget !== seenTarget) {
    setSeenTarget(cutTarget)
    if (cutTarget) setReportOpen(false)
  }

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

  // Closing the report puts focus back on the button that opened it.
  useEffect(() => {
    if (reportOpen || !returnFocus.current) return
    returnFocus.current = false
    reportButtonRef.current?.focus()
  }, [reportOpen])

  if ('error' in result) {
    return <p className="cutting__message">The cutting plan could not be computed for this model.</p>
  }
  const { plan, skipped } = result
  const { totals } = plan
  const notPlanned = skipped.length + plan.unplaced.length
  const outOfStock = plan.unplaced.filter((u) => u.reason === 'out-of-stock').length

  if (reportOpen) {
    return (
      <CutReport
        report={buildCutReport(plan, skipped, boards)}
        lumberyardName={yardName}
        onClose={() => {
          returnFocus.current = true
          setReportOpen(false)
        }}
      />
    )
  }

  return (
    <div className="cutting" ref={rootRef}>
      <section className="cutting__section" aria-labelledby="cutting-report-heading">
        <div className="cutting__heading cutting__heading--split">
          <h2 id="cutting-report-heading">Waste report</h2>
          {plan.boards.length > 0 && (
            <button type="button" ref={reportButtonRef} onClick={() => setReportOpen(true)}>
              Cutting report
            </button>
          )}
        </div>
        <dl className="cutting__totals">
          <Stat label="Pieces placed" value={formatCount(totals.placedPieces)} />
          <Stat label="Not planned" value={formatCount(notPlanned)} />
          <Stat label="Out of stock" value={formatCount(outOfStock)} />
          <Stat label="Boards to buy" value={formatCount(plan.boards.length)} />
          <Stat label="Purchased" value={formatMetres(totals.purchasedMm)} />
          <Stat label="Required" value={formatMetres(totals.requiredMm)} />
          <Stat
            label="Waste"
            value={`${formatMetres(totals.wasteMm)} (${totals.wastePct.toLocaleString('en-US', { maximumFractionDigits: 1 })} %)`}
          />
          <Stat
            label="Saw kerf"
            value={`incl. ${formatKerf(totals.kerfMm)} (${plan.kerfPerCutMm.toLocaleString('en-US')} mm per cut)`}
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
                <th scope="col" className="cutting__num">
                  In stock
                </th>
                <th scope="col" className="cutting__num">
                  Left after order
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
          kerfMm={plan.kerfPerCutMm}
          boardByOid={boardByOid}
          onShowInModel={onShowInModel}
          targetOid={cutTarget?.oid ?? null}
        />
      )}

      {/* Keyed by yard so the list's collapsed state is judged afresh for each yard's plan. */}
      {notPlanned > 0 && (
        <NotPlanned key={yardName} plan={plan} skipped={skipped} boardByOid={boardByOid} yardName={yardName} />
      )}
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
  const left = article.quantity === undefined ? undefined : article.quantity - quantity
  return (
    <tr>
      <td>{profileLabel(article.profile)}</td>
      <td>{article.grade}</td>
      <td>{article.finish}</td>
      <td className="cutting__num">{formatMm(article.lengthMm)}</td>
      <td className="cutting__num">{formatCount(quantity)}</td>
      <td className="cutting__num">{formatMetres(article.lengthMm * quantity)}</td>
      {/* Unlimited stock (no quantity) shows a dash. */}
      <td className="cutting__num">{article.quantity === undefined ? '—' : formatCount(article.quantity)}</td>
      <td className="cutting__num">
        {left === undefined ? '—' : formatCount(left)}
        {left === 0 && <span className="cutting__sold-out"> sold out</span>}
      </td>
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
  // Kerf per saw cut.
  kerfMm: number
  boardByOid: ReadonlyMap<string, Board>
  onShowInModel: ShowInModel
  targetOid: string | null
}

// One bar per purchased board, grouped by profile + grade. All bars share one scale:
// 100 % = the longest purchased article.
function CutBoards({ boards, kerfMm, boardByOid, onShowInModel, targetOid }: CutBoardsProps) {
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
                kerfMm={kerfMm}
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
  kerfMm: number
  label: string
  scaleMm: number
  boardByOid: ReadonlyMap<string, Board>
  onShowInModel: ShowInModel
  targetOid: string | null
}

function CutBoard({ board, kerfMm, label, scaleMm, boardByOid, onShowInModel, targetOid }: CutBoardProps) {
  const { article, cuts } = board
  const waste = Math.round(board.wasteMm)
  const offcut = Math.round(board.offcutMm)
  const offcutDetail = `offcut ${formatMm(board.offcutMm)} mm · kerf ${formatMm(board.kerfMm)} mm`
  const wasteLabel = `Waste ${formatMm(board.wasteMm)} mm: ${offcutDetail}`
  // The saw cut that frees the last piece from the offcut; it can be thinner than a full kerf.
  const lastKerfMm = board.kerfMm - (cuts.length - 1) * kerfMm
  const kerfGap = (key: string, mm: number) =>
    mm > 0 && (
      <li
        key={key}
        className="cutting__kerf"
        style={{ width: percent(mm, article.lengthMm) }}
        aria-hidden="true"
      />
    )
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
            return [
              i > 0 && kerfGap(`kerf-${cut.ifcTag}`, kerfMm),
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
              </li>,
            ]
          })}
          {kerfGap('kerf-last', lastKerfMm > 1e-6 ? lastKerfMm : 0)}
          {offcut > 0 && (
            <li
              className="cutting__cut cutting__waste"
              style={{ width: percent(board.offcutMm, article.lengthMm) }}
              aria-label={wasteLabel}
              title={offcutDetail}
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
  yardName: string
}

interface NotPlannedRow {
  oid: string
  board: Board | undefined
  reason: string
}

function NotPlanned({ plan, skipped, boardByOid, yardName }: NotPlannedProps) {
  const rows: NotPlannedRow[] = [
    ...plan.unplaced.map((u) => ({
      oid: u.demand.ifcTag,
      board: boardByOid.get(u.demand.ifcTag),
      reason: notPlannedText(u.reason, yardName),
    })),
    ...skipped.map((s) => ({ oid: s.board.oid, board: s.board, reason: notPlannedText(s.reason, yardName) })),
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

// Whole mm under 1 m, metres with one decimal from 1 m up.
function formatKerf(mm: number): string {
  return mm < 1000 ? `${formatMm(mm)} mm` : formatMetres(mm)
}

function percent(part: number, whole: number): string {
  return `${(part / whole) * 100}%`
}
