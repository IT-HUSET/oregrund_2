import { useMemo } from 'react'
import { formatCount, formatMetres, formatMm } from '../../components/format.ts'
import { LumberyardPicker } from '../../components/LumberyardPicker.tsx'
import type { StockArticle } from '../../domain/1dcutting/cutting.ts'
import type { Lumberyard } from '../../domain/1dcutting/lumberyards/lumberyards.ts'
import { summarizeStock, type StockGroup } from '../../domain/1dcutting/lumberyards/stockSummary.ts'
import './LumberyardsPanel.css'

interface LumberyardsPanelProps {
  lumberyards: readonly Lumberyard[]
  // The chosen lumberyard, shared with the Cutting tab.
  lumberyard: Lumberyard
  onSelectLumberyard(id: string): void
}

export function LumberyardsPanel({ lumberyards, lumberyard, onSelectLumberyard }: LumberyardsPanelProps) {
  let body
  if ('error' in lumberyard) body = <p className="yards__message">The stock list for {lumberyard.name} could not be read.</p>
  else if (lumberyard.stock.length === 0) body = <p className="yards__message">{lumberyard.name} has no articles in stock.</p>
  else body = <StockTable name={lumberyard.name} stock={lumberyard.stock} />
  return (
    <div className="yards">
      <LumberyardPicker lumberyards={lumberyards} value={lumberyard.id} onChange={onSelectLumberyard} />
      {body}
    </div>
  )
}

function StockTable({ name, stock }: { name: string; stock: readonly StockArticle[] }) {
  const summary = useMemo(() => summarizeStock(stock), [stock])
  return (
    <section className="yards__section">
      <div className="yards__heading">
        <h2 id="yards-stock-heading">Stock at {name}</h2>
        <span className="yards__totals">
          {plural(summary.articles, 'article')} · {plural(summary.boards, 'board')} · {formatMetres(summary.lengthMm)}
        </span>
      </div>
      <table className="yards__table" aria-labelledby="yards-stock-heading">
        <thead>
          <tr>
            <th scope="col" className="yards__num">
              Length (mm)
            </th>
            <th scope="col">Finish</th>
            <th scope="col" className="yards__num">
              In stock
            </th>
            <th scope="col" className="yards__num">
              Total
            </th>
          </tr>
        </thead>
        {summary.groups.map((group) => (
          <GroupRows key={`${group.profile} ${group.grade}`} group={group} />
        ))}
      </table>
    </section>
  )
}

function GroupRows({ group }: { group: StockGroup }) {
  return (
    <tbody>
      <tr className="yards__group">
        <th scope="rowgroup">
          {group.profile} {group.grade}
        </th>
        <td colSpan={3} className="yards__group-totals">
          {plural(group.articles.length, 'length')} · {plural(group.boards, 'board')} · {formatMetres(group.lengthMm)}
        </td>
      </tr>
      {group.articles.map((article) => (
        <tr key={article.id}>
          <td className="yards__num">{formatMm(article.lengthMm)}</td>
          <td>{article.finish}</td>
          {/* Unlimited stock (no quantity) shows a dash, as in the order list. */}
          <td className="yards__num">
            {article.quantity === undefined ? '—' : formatCount(article.quantity)}
            {article.quantity === 0 && <span className="yards__out"> out of stock</span>}
          </td>
          <td className="yards__num">{article.quantity === undefined ? '—' : formatMetres(article.lengthMm * article.quantity)}</td>
        </tr>
      ))}
    </tbody>
  )
}

function plural(count: number, noun: string): string {
  return `${formatCount(count)} ${count === 1 ? noun : `${noun}s`}`
}
