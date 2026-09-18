import { useMemo, useState } from 'react'
import type { Board } from '../../domain/boards/board.ts'
import { boardGroupKey, compareProfiles, summarizeBoards, UNPARSED_GROUP } from '../../domain/boards/boardSummary.ts'
import './BoardsPanel.css'

interface BoardsPanelProps {
  // null while the board list is being built.
  boards: readonly Board[] | null
  error?: boolean
}

type SortColumn = 'oid' | 'role' | 'element' | 'profile' | 'grade' | 'length'
type SortDirection = 'ascending' | 'descending'

interface Sort {
  column: SortColumn
  direction: SortDirection
}

interface Column {
  key: SortColumn
  label: string
  numeric?: boolean
  isEmpty(board: Board): boolean
  compare(a: Board, b: Board): number
}

// Profile ascending, with grade and length as tie-breakers.
const DEFAULT_SORT: Sort = { column: 'profile', direction: 'ascending' }

const COLUMNS: Column[] = [
  { key: 'oid', label: 'OID', isEmpty: (b) => !b.oid, compare: (a, b) => compareText(a.oid, b.oid) },
  { key: 'role', label: 'Role / description', isEmpty: (b) => !b.role, compare: (a, b) => compareText(a.role, b.role) },
  { key: 'element', label: 'Element', isEmpty: (b) => !b.element, compare: (a, b) => compareText(a.element, b.element) },
  { key: 'profile', label: 'Profile', isEmpty: (b) => !b.profile, compare: (a, b) => compareProfiles(a.profile, b.profile) },
  { key: 'grade', label: 'Grade', isEmpty: (b) => !b.grade, compare: (a, b) => compareText(a.grade, b.grade) },
  {
    key: 'length',
    label: 'Length (mm)',
    numeric: true,
    isEmpty: (b) => b.length === null,
    compare: (a, b) => (a.length ?? 0) - (b.length ?? 0),
  },
]

export function BoardsPanel({ boards, error = false }: BoardsPanelProps) {
  if (error) return <p className="board-list__message">The board list could not be built from this model.</p>
  if (!boards)
    return (
      <p className="board-list__message" role="status">
        Reading boards…
      </p>
    )
  if (boards.length === 0) return <p className="board-list__message">No boards found in this model.</p>
  return <BoardList boards={boards} />
}

function BoardList({ boards }: { boards: readonly Board[] }) {
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [filter, setFilter] = useState<string | null>(null)
  const summary = useMemo(() => summarizeBoards(boards), [boards])
  const rows = useMemo(() => {
    const shown = filter === null ? boards : boards.filter((b) => boardGroupKey(b) === filter)
    return sortBoards(shown, sort)
  }, [boards, filter, sort])

  function toggleSort(column: SortColumn) {
    setSort((current) =>
      current.column === column
        ? { column, direction: current.direction === 'ascending' ? 'descending' : 'ascending' }
        : { column, direction: 'ascending' },
    )
  }

  return (
    <div className="board-list">
      <section className="board-list__section" aria-labelledby="board-summary-heading">
        <div className="board-list__heading">
          <h2 id="board-summary-heading">Summary</h2>
          <span className="board-list__totals">
            {formatCount(summary.count)} {summary.count === 1 ? 'board' : 'boards'} · {formatMetres(summary.totalLength)} total
          </span>
        </div>
        {summary.flaggedCount > 0 && (
          <p className="board-list__warning">
            {formatCount(summary.flaggedCount)} {summary.flaggedCount === 1 ? 'board' : 'boards'} could not be fully read
          </p>
        )}
        <table className="board-list__table board-list__summary" aria-labelledby="board-summary-heading">
          <thead>
            <tr>
              <th scope="col">Profile</th>
              <th scope="col">Grade</th>
              <th scope="col" className="board-list__num">
                Count
              </th>
              <th scope="col" className="board-list__num">
                Total length
              </th>
            </tr>
          </thead>
          <tbody>
            {summary.groups.map((group) => {
              const active = group.key === filter
              return (
                <tr key={group.key} className={active ? 'board-list__row--active' : undefined}>
                  <td>
                    <button
                      type="button"
                      className="board-list__group"
                      aria-label={group.key}
                      aria-pressed={active}
                      onClick={() => setFilter(active ? null : group.key)}
                    >
                      {group.key === UNPARSED_GROUP ? UNPARSED_GROUP : group.profile}
                    </button>
                  </td>
                  <td>{group.grade}</td>
                  <td className="board-list__num">{formatCount(group.count)}</td>
                  <td className="board-list__num">{formatMetres(group.totalLength)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="board-list__section" aria-labelledby="board-pieces-heading">
        <div className="board-list__heading">
          <h2 id="board-pieces-heading">Pieces</h2>
          {filter !== null && (
            <span className="board-list__filter">
              filtered: {filter}
              <button type="button" onClick={() => setFilter(null)}>
                Clear filter
              </button>
            </span>
          )}
        </div>
        <table className="board-list__table board-list__pieces" aria-labelledby="board-pieces-heading">
          <thead>
            <tr>
              {COLUMNS.map((column) => {
                const active = sort.column === column.key
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={column.numeric ? 'board-list__num' : undefined}
                    aria-sort={active ? sort.direction : undefined}
                  >
                    <button type="button" className="board-list__sort" onClick={() => toggleSort(column.key)}>
                      {column.label}
                      <span className="board-list__sort-icon" aria-hidden="true">
                        {active ? (sort.direction === 'ascending' ? '▲' : '▼') : ''}
                      </span>
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((board) => (
              <tr key={board.expressId}>
                <td>{board.oid}</td>
                <td>
                  {board.role}
                  {board.issues.includes('unparsed') && <span className="board-list__flag">unparsed</span>}
                </td>
                <td>{board.element}</td>
                <td>{board.profile?.label}</td>
                <td>{board.grade}</td>
                <td className="board-list__num">
                  {board.length === null ? (
                    <span className="board-list__flag">no length</span>
                  ) : (
                    formatCount(Math.round(board.length))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

// Empty cells sort last in both directions; ties fall back to the default order.
function sortBoards(boards: readonly Board[], sort: Sort): Board[] {
  const column = COLUMNS.find((c) => c.key === sort.column)!
  const direction = sort.direction === 'ascending' ? 1 : -1
  return [...boards].sort((a, b) => {
    const aEmpty = column.isEmpty(a)
    const bEmpty = column.isEmpty(b)
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1
    return (aEmpty ? 0 : direction * column.compare(a, b)) || defaultOrder(a, b)
  })
}

function defaultOrder(a: Board, b: Board): number {
  return (
    compareProfiles(a.profile, b.profile) ||
    compareText(a.grade, b.grade) ||
    (a.length ?? Infinity) - (b.length ?? Infinity) ||
    compareText(a.oid, b.oid)
  )
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true })
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US')
}

// Summary totals are shown in metres with one decimal, e.g. 2408 mm → "2.4 m".
function formatMetres(mm: number): string {
  return `${(mm / 1000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`
}
