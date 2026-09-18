import { useEffect, useRef } from 'react'
import { formatCount, formatMm } from '../../components/format.ts'
import type { CutReport as CutReportData, CutReportBoard } from '../../domain/1dcutting/cutReport.ts'
import './CutReport.css'

interface CutReportProps {
  report: CutReportData
  // The yard the boards are bought from.
  lumberyardName: string
  onClose(): void
}

const COLUMNS = 8

// The factory cut list: one table per profile + grade, one row group per purchased board.
export function CutReport({ report, lumberyardName, onClose }: CutReportProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const { totals } = report

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <section className="cut-report" aria-labelledby="cut-report-heading">
      <div className="cut-report__header">
        <div>
          <h2 id="cut-report-heading" ref={headingRef} tabIndex={-1}>
            Cutting report
          </h2>
          <p className="cut-report__yard">Lumberyard: {lumberyardName}</p>
        </div>
        <div className="cut-report__actions">
          <button type="button" onClick={onClose}>
            Back to cutting plan
          </button>
          <button type="button" className="cut-report__print" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>
      <p className="cut-report__summary">
        {plural(totals.boards, 'board')} · {plural(totals.cuts, 'cut')}
      </p>
      {totals.notPlanned > 0 && (
        <p className="cut-report__note">
          {plural(totals.notPlanned, 'piece')} {totals.notPlanned === 1 ? 'is' : 'are'} not planned and{' '}
          {totals.notPlanned === 1 ? 'is' : 'are'} not in this report. See “Not planned” in the cutting plan.
        </p>
      )}
      {report.groups.map((group, g) => (
        <div key={group.label} className="cut-report__group">
          <h3 id={`cut-report-group-${g}`}>{group.label}</h3>
          <table className="cut-report__table" aria-labelledby={`cut-report-group-${g}`}>
            <thead>
              <tr>
                <th scope="col" className="cut-report__num">
                  Cut
                </th>
                <th scope="col">OID</th>
                <th scope="col">Piece</th>
                <th scope="col">Role</th>
                <th scope="col">Element</th>
                <th scope="col" className="cut-report__num">
                  Length (mm)
                </th>
                <th scope="col" className="cut-report__num">
                  From (mm)
                </th>
                <th scope="col" className="cut-report__num">
                  To (mm)
                </th>
              </tr>
            </thead>
            {group.boards.map((board) => (
              <BoardRows key={board.cuts[0].oid} board={board} />
            ))}
          </table>
        </div>
      ))}
    </section>
  )
}

function BoardRows({ board }: { board: CutReportBoard }) {
  const { article, cuts } = board
  const waste = Math.round(board.wasteMm) > 0 ? ` · waste ${formatMm(board.wasteMm)} mm` : ''
  return (
    <tbody className="cut-report__board">
      <tr>
        <th scope="rowgroup" colSpan={COLUMNS} className="cut-report__board-heading">
          Board {board.number} · {formatMm(article.lengthMm)} mm {article.finish} · {plural(cuts.length, 'cut')}
          {waste}
        </th>
      </tr>
      {cuts.map((cut) => (
        <tr key={cut.oid}>
          <td className="cut-report__num">{cut.seq}</td>
          <td>{cut.oid}</td>
          <td>{cut.pieceCode}</td>
          <td>{cut.role}</td>
          <td>{cut.element}</td>
          <td className="cut-report__num">{formatMm(cut.lengthMm)}</td>
          <td className="cut-report__num">{formatMm(cut.fromMm)}</td>
          <td className="cut-report__num">{formatMm(cut.toMm)}</td>
        </tr>
      ))}
    </tbody>
  )
}

function plural(count: number, noun: string): string {
  return `${formatCount(count)} ${noun}${count === 1 ? '' : 's'}`
}
