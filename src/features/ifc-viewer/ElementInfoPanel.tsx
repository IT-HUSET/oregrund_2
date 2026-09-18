import type { ElementInfo, PropertyEntry } from '../../domain/ifc/elementInfo.ts'
import { entryLabel, setLabel, valueLabel } from './ifcLabels.ts'
import './ElementInfoPanel.css'

interface ElementInfoPanelProps {
  info: ElementInfo | null
  loading?: boolean
}

export function ElementInfoPanel({ info, loading = false }: ElementInfoPanelProps) {
  return (
    <aside className="info-panel" aria-label="Element details">
      {info ? (
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
        </>
      ) : (
        <p className="info-panel__empty">{loading ? 'Loading details…' : 'Click a part of the model to see its details.'}</p>
      )}
    </aside>
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
