import { formatCount, formatMm } from '../../components/format.ts'
import { NOT_PLANNED_REASONS, type TraceStatus } from '../../domain/1dcutting/traceability.ts'
import type { ElementInfo, PropertyEntry } from '../../domain/ifc/elementInfo.ts'
import { entryLabel, setLabel, valueLabel } from './ifcLabels.ts'
import './ElementInfoPanel.css'

// The selected element's place in the cutting plan, or why it can't be shown yet.
export type CuttingTrace = TraceStatus | { kind: 'pending' } | { kind: 'error' }

// A traced set of elements with no single primary (a purchased board or an order line).
export interface HighlightedSet {
  label: string
  count: number
}

interface ElementInfoPanelProps {
  info: ElementInfo | null
  loading?: boolean
  // Omitted for elements that aren't boards.
  trace?: CuttingTrace
  highlighted?: HighlightedSet | null
  onSelectPiece?(oid: string): void
  onShowInCuttingList?(oid: string): void
}

export function ElementInfoPanel({
  info,
  loading = false,
  trace,
  highlighted = null,
  onSelectPiece,
  onShowInCuttingList,
}: ElementInfoPanelProps) {
  return (
    <aside className="info-panel" aria-label="Element details">
      {!info && !loading && highlighted ? (
        <>
          <h2 className="info-panel__title">
            {formatCount(highlighted.count)} {highlighted.count === 1 ? 'piece' : 'pieces'} highlighted
          </h2>
          <p>{highlighted.label}</p>
        </>
      ) : info ? (
        <>
          <h2 className="info-panel__title">{info.name || '(unnamed)'}</h2>
          <dl className="info-panel__identity">
            <dt>Type</dt>
            <dd>{info.ifcType}</dd>
            <dt>Tag/OID</dt>
            <dd>{info.tag || '–'}</dd>
            <dt>GlobalId</dt>
            <dd className="info-panel__mono">{info.globalId}</dd>
          </dl>

          <h3>Properties</h3>
          {info.propertySets.length === 0 ? (
            <p className="info-panel__empty">No properties</p>
          ) : (
            info.propertySets.map((set) => <EntryTable key={set.name} setName={set.name} entries={set.properties} />)
          )}

          <h3>Quantities</h3>
          {info.quantitySets.length === 0 ? (
            <p className="info-panel__empty">No quantities</p>
          ) : (
            info.quantitySets.map((set) => <EntryTable key={set.name} setName={set.name} entries={set.quantities} />)
          )}

          {trace && trace.kind !== 'not-a-board' && (
            <CuttingSection trace={trace} onSelectPiece={onSelectPiece} onShowInCuttingList={onShowInCuttingList} />
          )}
        </>
      ) : (
        <p className="info-panel__empty">{loading ? 'Loading details…' : 'Click a part of the model to see its details.'}</p>
      )}
    </aside>
  )
}

interface CuttingSectionProps {
  trace: Exclude<CuttingTrace, { kind: 'not-a-board' }>
  onSelectPiece?(oid: string): void
  onShowInCuttingList?(oid: string): void
}

function CuttingSection({ trace, onSelectPiece, onShowInCuttingList }: CuttingSectionProps) {
  let body
  if (trace.kind === 'pending') body = <p className="info-panel__empty">Planning cuts…</p>
  else if (trace.kind === 'error')
    body = <p className="info-panel__empty">The cutting plan could not be computed for this model.</p>
  else if (trace.kind === 'not-planned') body = <p>Not planned: {NOT_PLANNED_REASONS[trace.reason]}</p>
  else {
    const loc = trace.location
    body = (
      <>
        <p className="info-panel__cut-lines">
          <span>
            {loc.groupLabel} · {formatMm(loc.article.lengthMm)} mm · board {loc.boardNumber}
          </span>
          <span>
            Cut {loc.cutIndex + 1} of {loc.cutCount} · offset {formatMm(loc.offsetMm)} mm · {formatMm(loc.lengthMm)} mm
          </span>
          <span>Waste on this board: {formatMm(loc.wasteMm)} mm</span>
        </p>
        {loc.siblings.length > 0 && (
          <p className="info-panel__siblings">
            Same board:{' '}
            {loc.siblings.map((oid) => (
              <button
                key={oid}
                type="button"
                className="info-panel__piece"
                aria-label={`Select OID ${oid} in 3D`}
                onClick={() => onSelectPiece?.(oid)}
              >
                {oid}
              </button>
            ))}
          </p>
        )}
        {onShowInCuttingList && (
          <button type="button" onClick={() => onShowInCuttingList(loc.oid)}>
            Show in cutting list
          </button>
        )}
      </>
    )
  }
  return (
    <section aria-labelledby="info-panel-cutting">
      <h3 id="info-panel-cutting">Cutting</h3>
      {body}
    </section>
  )
}

// Names are shown in Swedish, with the IFC name as a tooltip.
function EntryTable({ setName, entries }: { setName: string; entries: PropertyEntry[] }) {
  return (
    <table className="info-panel__table">
      <caption title={setName}>{setLabel(setName)}</caption>
      <tbody>
        {entries.map((e, i) => (
          <tr key={`${e.name}-${i}`}>
            <th scope="row" title={e.name}>
              {entryLabel(setName, e.name)}
            </th>
            <td>
              {valueLabel(e.value) || '–'}
              {e.unit && ` ${e.unit}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
