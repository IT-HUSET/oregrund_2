import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildLumberyards, DEFAULT_LUMBERYARD_ID, LUMBERYARDS, type Lumberyard } from '../../domain/1dcutting/lumberyards/lumberyards.ts'
import { computeCuttingPlan } from '../../domain/1dcutting/traceability.ts'
import type { Board } from '../../domain/boards/board.ts'
import { makeBoard } from '../../domain/boards/__fixtures__/boards.ts'
import { CuttingPanel, type CutTarget, type ModelTrace } from './CuttingPanel.tsx'

const S01 = [
  makeBoard('1 Stud 45x95 C24', 2000, { oid: 'A', element: 'VÄGG-999' }),
  makeBoard('2 Stud 45x95 C24', 2000, { oid: 'B' }),
  makeBoard('3 Nogging 45x95 C24', 1500, { oid: 'C' }),
  makeBoard('4 Nogging 45x95 C24', 1000, { oid: 'D' }),
]

// The default yard (Standard brädgård) stocks every article these tests plan with.
const STANDARD = LUMBERYARDS.find((y) => y.id === DEFAULT_LUMBERYARD_ID)!
const yardProps = { lumberyards: LUMBERYARDS, lumberyard: STANDARD, onSelectLumberyard: () => {} }

function Panel({ boards, ...rest }: { boards: Board[]; onShowInModel?(t: ModelTrace): void; cutTarget?: CutTarget }) {
  return <CuttingPanel boards={boards} plan={computeCuttingPlan(boards, STANDARD)} {...yardProps} {...rest} />
}

// A panel whose yard can be switched, as App does.
function YardSwitcher({ boards, yards, initial }: { boards: Board[]; yards: readonly Lumberyard[]; initial: string }) {
  const [id, setId] = useState(initial)
  const yard = yards.find((y) => y.id === id)!
  return (
    <CuttingPanel boards={boards} plan={computeCuttingPlan(boards, yard)} lumberyards={yards} lumberyard={yard} onSelectLumberyard={setId} />
  )
}

const stat = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent
const bars = () => screen.getAllByRole('list', { name: /board \d+:/ })
const segments = (bar: HTMLElement) => within(bar).getAllByRole('listitem')
const widthOf = (el: HTMLElement) => parseFloat(el.style.width)
const kerfGaps = (bar: HTMLElement) => [...bar.querySelectorAll<HTMLElement>('.cutting__kerf')]

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('CuttingPanel', () => {
  // S14
  it('shows the totals, the order list and the cut boards', () => {
    render(<Panel boards={S01} />)

    expect(stat('Pieces placed')).toBe('4')
    expect(stat('Boards to buy')).toBe('2')
    expect(stat('Purchased')).toBe('6.9 m')
    expect(stat('Required')).toBe('6.5 m')
    expect(stat('Waste')).toBe('0.4 m (5.8 %)')
    expect(stat('Saw kerf')).toBe('incl. 18 mm (4.5 mm per cut)')
    expect(stat('Not planned')).toBe('0')

    const order = within(screen.getByRole('table', { name: 'Order list' })).getAllByRole('row').slice(1)
    expect(order.map((row) => within(row).getAllByRole('cell').map((c) => c.textContent))).toEqual([
      ['45x95', 'C24', 'hyvlat', '3,600', '1', '3.6 m', '25', '24'],
      ['45x95', 'C24', 'hyvlat', '3,300', '1', '3.3 m', '10', '9'],
    ])

    expect(screen.getByRole('heading', { level: 3, name: '45x95 C24' })).toBeInTheDocument()
    const [long, short] = bars()
    expect(long).toHaveAccessibleName('45x95 C24 board 1: 3,600 mm')
    expect(segments(long).map((s) => s.textContent)).toEqual(['A', 'C', 'waste'])
    expect(segments(long)[2]).toHaveAccessibleName('Waste 100 mm: offcut 91 mm · kerf 9 mm')
    expect(segments(long)[2]).toHaveAttribute('title', 'offcut 91 mm · kerf 9 mm')
    expect(segments(short).map((s) => s.textContent)).toEqual(['B', 'D', 'waste'])
    expect(segments(short)[2]).toHaveAccessibleName('Waste 300 mm: offcut 291 mm · kerf 9 mm')
    expect(screen.getByText('3,600 mm')).toBeInTheDocument()
    expect(screen.getByText('3,300 mm')).toBeInTheDocument()
    expect(screen.getByText('waste 100 mm')).toBeInTheDocument()
    expect(screen.getByText('waste 300 mm')).toBeInTheDocument()

    // Saw order: A, kerf, C, kerf, offcut.
    expect([...long.children].map((el) => el.textContent || el.className)).toEqual([
      'A',
      'cutting__kerf',
      'C',
      'cutting__kerf',
      'waste',
    ])
    expect(kerfGaps(long)).toHaveLength(2)
    expect(kerfGaps(short)).toHaveLength(2)
    kerfGaps(long).forEach((gap) => expect(gap).toHaveAttribute('aria-hidden', 'true'))

    expect(widthOf(long)).toBeCloseTo(100)
    expect(widthOf(segments(long)[0])).toBeCloseTo(55.56, 1)
    expect(widthOf(kerfGaps(long)[0])).toBeCloseTo(0.125)
    expect(widthOf(short)).toBeCloseTo(91.67, 1)
    expect(screen.queryByRole('heading', { name: /Not planned/ })).not.toBeInTheDocument()
  })

  // S15
  it('makes every cut traceable to its IFC element', async () => {
    render(<Panel boards={S01} />)
    const cut = segments(bars()[0])[0]
    const expected = 'OID A · Stud · VÄGG-999 · 2,000 mm · offset 0 mm'
    expect(cut).toHaveAccessibleName(expected)
    expect(cut).toHaveAttribute('title', expected)

    await userEvent.tab()
    expect(screen.getByRole('combobox', { name: 'Lumberyard' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Cutting report' })).toHaveFocus()
    await userEvent.tab()
    expect(cut).toHaveFocus()
    await userEvent.tab()
    expect(segments(bars()[0])[1]).toHaveAccessibleName(/^OID C · Nogging · GOLV-999 · 1,500 mm · offset 2,005 mm$/)
  })

  // S16
  it('lists unplaced and skipped pieces with a reason', () => {
    render(
      <Panel
        boards={[
          makeBoard('FD5 Opening header beam 45x190 C24', 1180, { oid: '11' }),
          makeBoard('7 Stud 45x95 C24', 6000, { oid: '12' }),
          makeBoard('U9 Glulam beam 42x270 GL', 3000, { oid: '13' }),
          makeBoard('Mystery piece', 900, { oid: '14' }),
          makeBoard('8 Stud 45x95 C24', null, { oid: '15' }),
          makeBoard('9 Stud 45x95 C24', 2400, { oid: '16' }),
        ]}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Not planned (5)' })).toBeInTheDocument()
    const rows = within(screen.getByRole('table', { name: 'Not planned (5)' })).getAllByRole('row').slice(1)
    expect(rows.map((row) => within(row).getAllByRole('cell').map((c) => c.textContent))).toEqual([
      ['11', 'FD5 Opening header beam 45x190 C24', '45x190 C24', '1,180', 'No matching stock article'],
      ['12', '7 Stud 45x95 C24', '45x95 C24', '6,000', 'Longer than the longest stock length'],
      ['13', 'U9 Glulam beam 42x270 GL', '42x270 GL', '3,000', 'No matching stock article'],
      ['14', 'Mystery piece', '', '900', 'Name could not be read'],
      ['15', '8 Stud 45x95 C24', '45x95 C24', '', 'Missing length'],
    ])
    expect(stat('Pieces placed')).toBe('1')
    expect(stat('Not planned')).toBe('5')
    expect(stat('Required')).toBe('2.4 m')
  })

  it('collapses a long "Not planned" list', async () => {
    const boards = Array.from({ length: 21 }, (_, i) => makeBoard(`${i} Header 45x190 C24`, 1000, { oid: String(i) }))
    render(<Panel boards={boards} />)
    expect(screen.queryByRole('table', { name: 'Not planned (21)' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(screen.getByRole('table', { name: 'Not planned (21)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-expanded', 'true')
  })

  // S17
  it('shows loading, empty and board-list error states', () => {
    const { rerender } = render(<CuttingPanel boards={null} plan={null} {...yardProps} />)
    expect(screen.getByText('Planning cuts…')).toBeInTheDocument()
    rerender(<Panel boards={[]} />)
    expect(screen.getByText('No boards found in this model.')).toBeInTheDocument()
    rerender(<CuttingPanel boards={null} plan={null} error {...yardProps} />)
    expect(screen.getByText('The board list could not be built from this model.')).toBeInTheDocument()
  })

  // S17 (d)
  it('shows an error when the plan cannot be computed', () => {
    render(<Panel boards={[makeBoard('1 Stud 45x95 C24', 1000, { oid: 'X' }), makeBoard('2 Stud 45x95 C24', 900, { oid: 'X' })]} />)
    expect(screen.getByText('The cutting plan could not be computed for this model.')).toBeInTheDocument()
  })
})

// Cut traceability
describe('CuttingPanel show in 3D', () => {
  // S03 + S12
  it('shows a cut in 3D by click or keyboard', async () => {
    const onShowInModel = vi.fn()
    render(<Panel boards={S01} onShowInModel={onShowInModel} />)
    const cut = segments(bars()[0])[1]
    expect(cut).toHaveAccessibleName('OID C · Nogging · GOLV-999 · 1,500 mm · offset 2,005 mm')
    const button = within(cut).getByRole('button', { name: 'Show OID C in 3D' })
    await userEvent.click(button)
    expect(onShowInModel).toHaveBeenLastCalledWith({ oids: ['C'], primary: 'C' })

    onShowInModel.mockClear()
    within(segments(bars()[0])[0]).getByRole('button').focus()
    await userEvent.keyboard('{Enter}')
    expect(onShowInModel).toHaveBeenLastCalledWith({ oids: ['A'], primary: 'A' })
  })

  // S04
  it('shows a whole board and a whole order line in 3D', async () => {
    const onShowInModel = vi.fn()
    render(<Panel boards={S01} onShowInModel={onShowInModel} />)
    await userEvent.click(screen.getByRole('button', { name: 'Show 45x95 C24 board 2: 3,300 mm in 3D' }))
    expect(onShowInModel).toHaveBeenLastCalledWith({ oids: ['B', 'D'], label: '45x95 C24 board 2: 3,300 mm' })

    await userEvent.click(screen.getByRole('button', { name: 'Show 45x95 C24 · 3,600 mm in 3D' }))
    expect(onShowInModel).toHaveBeenLastCalledWith({ oids: ['A', 'C'], label: '45x95 C24 · 3,600 mm' })
  })

  // S11 (b)
  it('disables the action for a cut whose element is not in the board list', () => {
    const boards = [makeBoard('1 Stud 45x95 C24', 1000, { oid: 'A' })]
    const plan = computeCuttingPlan(boards, STANDARD)
    render(
      <CuttingPanel boards={[makeBoard('9 Other 45x70 C24', 500, { oid: 'Z' })]} plan={plan} onShowInModel={() => {}} {...yardProps} />,
    )
    const button = screen.getByRole('button', { name: 'Show OID A in 3D' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'Element not found in the model')
  })

  // S09
  it('scrolls to, focuses and marks the target cut', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    render(<Panel boards={S01} onShowInModel={() => {}} cutTarget={{ oid: 'D', seq: 1 }} />)
    const cut = segments(bars()[1])[1]
    expect(cut).toHaveAttribute('aria-current', 'true')
    expect(within(cut).getByRole('button')).toHaveFocus()
    expect(scrollIntoView).toHaveBeenCalled()
    expect(segments(bars()[0]).filter((s) => s.hasAttribute('aria-current'))).toEqual([])
    delete (Element.prototype as Partial<Element>).scrollIntoView
  })
})

describe('CuttingPanel cutting report', () => {
  const withExtras = [...S01, makeBoard('Mystery piece', 900, { oid: 'X' })]

  it('opens a factory cut list per purchased board and returns to the plan', async () => {
    render(<Panel boards={withExtras} />)
    const open = screen.getByRole('button', { name: 'Cutting report' })
    await userEvent.click(open)

    const heading = screen.getByRole('heading', { level: 2, name: 'Cutting report' })
    expect(heading).toHaveFocus()
    expect(screen.getByText('Lumberyard: Standard brädgård')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Cutting list' })).not.toBeInTheDocument()
    expect(screen.getByText('2 boards · 4 cuts')).toBeInTheDocument()
    expect(screen.getByText(/1 piece is not planned and is not in this report/)).toBeInTheDocument()

    const table = screen.getByRole('table', { name: '45x95 C24' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((row) => [...row.children].map((c) => c.textContent))).toEqual([
      ['Board 1 · 3,600 mm hyvlat · 2 cuts · waste 100 mm'],
      ['1', 'A', '1', 'Stud', 'VÄGG-999', '2,000', '0', '2,000'],
      ['2', 'C', '3', 'Nogging', 'GOLV-999', '1,500', '2,005', '3,505'],
      ['Board 2 · 3,300 mm hyvlat · 2 cuts · waste 300 mm'],
      ['1', 'B', '2', 'Stud', 'GOLV-999', '2,000', '0', '2,000'],
      ['2', 'D', '4', 'Nogging', 'GOLV-999', '1,000', '2,005', '3,005'],
    ])

    await userEvent.click(screen.getByRole('button', { name: 'Back to cutting plan' }))
    expect(screen.queryByRole('heading', { name: 'Cutting report' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cutting list' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cutting report' })).toHaveFocus()
  })

  it('prints the report', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<Panel boards={S01} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cutting report' }))
    await userEvent.click(screen.getByRole('button', { name: 'Print' }))
    expect(print).toHaveBeenCalledOnce()
  })

  it('has no report when no board is purchased', () => {
    render(<Panel boards={[makeBoard('Mystery piece', 900, { oid: 'X' })]} />)
    expect(screen.queryByRole('button', { name: 'Cutting report' })).not.toBeInTheDocument()
  })

  it('closes the report when a cut is targeted from 3D', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    const { rerender } = render(<Panel boards={S01} onShowInModel={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cutting report' }))
    rerender(<Panel boards={S01} onShowInModel={() => {}} cutTarget={{ oid: 'D', seq: 1 }} />)
    expect(screen.queryByRole('heading', { name: 'Cutting report' })).not.toBeInTheDocument()
    expect(within(segments(bars()[1])[1]).getByRole('button')).toHaveFocus()
    delete (Element.prototype as Partial<Element>).scrollIntoView
  })
})

// Lumberyards
const YARD_HEADER = 'typ;utförande;tjocklek_mm;bredd_mm;hållfasthetsklass;sorteringsklass;längd_mm;antal;källa'
const [TESTGARDEN, TRASIGA, RYMLIGA] = buildLumberyards([
  { id: 'test', name: 'Testgården', csv: `${YARD_HEADER}\nartikel;hyvlat;45;95;C24;T2;4200;1;x\nartikel;hyvlat;45;95;C24;T2;3000;10;x` },
  { id: 'bad', name: 'Trasiga gården', csv: `${YARD_HEADER}\nartikel;hyvlat;45;95;C24;T2;3000;-1;x` },
  { id: 'ample', name: 'Rymliga gården', csv: `${YARD_HEADER}\nartikel;hyvlat;45;95;C24;T2;4200;50;x\nartikel;hyvlat;45;95;C24;T2;6000;5;x` },
])
const S04 = [
  makeBoard('1 Stud 45x95 C24', 4000, { oid: 'A' }),
  makeBoard('2 Stud 45x95 C24', 3900, { oid: 'B' }),
  makeBoard('3 Nogging 45x95 C24', 2000, { oid: 'C' }),
  makeBoard('4 Stud 45x95 C24', 6000, { oid: 'D' }),
  makeBoard('5 Nogging 45x95 C16', 2000, { oid: 'E' }),
]
const orderRows = () =>
  within(screen.getByRole('table', { name: 'Order list' }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell').map((c) => c.textContent))

describe('CuttingPanel lumberyards', () => {
  // S07 (panel half)
  it('has a labelled lumberyard select that re-plans against the chosen yard', async () => {
    render(<YardSwitcher boards={S04} yards={[TESTGARDEN, RYMLIGA]} initial="test" />)
    const select = screen.getByRole('combobox', { name: 'Lumberyard' })
    expect(select).toHaveDisplayValue('Testgården')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Testgården', 'Rymliga gården'])
    expect(stat('Pieces placed')).toBe('2')

    await userEvent.selectOptions(select, 'Rymliga gården')
    expect(select).toHaveDisplayValue('Rymliga gården')
    expect(stat('Pieces placed')).toBe('4')
    expect(stat('Out of stock')).toBe('0')
    expect(orderRows().map((row) => row.slice(3, 5))).toEqual([
      ['6,000', '2'],
      ['4,200', '1'],
    ])
  })

  // S08
  it('shows stock per order line, marks sold-out articles and counts out-of-stock pieces', () => {
    render(<YardSwitcher boards={S04} yards={[TESTGARDEN]} initial="test" />)
    expect(orderRows()).toEqual([
      ['45x95', 'C24', 'hyvlat', '4,200', '1', '4.2 m', '1', '0 sold out'],
      ['45x95', 'C24', 'hyvlat', '3,000', '1', '3.0 m', '10', '9'],
    ])
    const header = within(screen.getByRole('table', { name: 'Order list' })).getAllByRole('columnheader')
    expect(header.map((h) => h.textContent)).toEqual(expect.arrayContaining(['In stock', 'Left after order']))
    expect(stat('Out of stock')).toBe('1')
    expect(stat('Not planned')).toBe('3')

    const rows = within(screen.getByRole('table', { name: 'Not planned (3)' })).getAllByRole('row').slice(1)
    expect(rows.map((row) => [within(row).getAllByRole('cell')[0].textContent, within(row).getAllByRole('cell')[4].textContent])).toEqual([
      ['B', 'Out of stock at Testgården'],
      ['D', 'Longer than the longest stock length'],
      ['E', 'No matching stock article'],
    ])
  })

  it('shows a dash for articles with unlimited stock', () => {
    const article = { id: '45x95-C24-3000', finish: 'hyvlat', profile: { thicknessMm: 45, widthMm: 95 }, grade: 'C24', lengthMm: 3000 } as const
    const unlimited: Lumberyard = { id: 'u', name: 'Obegränsade gården', stock: [article] }
    render(<YardSwitcher boards={[makeBoard('1 Stud 45x95 C24', 2000, { oid: 'U' })]} yards={[unlimited]} initial="u" />)
    expect(orderRows()[0].slice(6)).toEqual(['—', '—'])
  })

  // S09 (report half)
  it('names the chosen yard in the cutting report', async () => {
    render(<YardSwitcher boards={S04} yards={[TESTGARDEN, RYMLIGA]} initial="ample" />)
    await userEvent.click(screen.getByRole('button', { name: 'Cutting report' }))
    expect(screen.getByText('Lumberyard: Rymliga gården')).toBeInTheDocument()
  })

  // S10 (panel half)
  it('explains an unreadable stock list and keeps the select usable', async () => {
    render(<YardSwitcher boards={S04} yards={[TESTGARDEN, TRASIGA, RYMLIGA]} initial="bad" />)
    expect(screen.getByText('The stock list for Trasiga gården could not be read.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Waste report' })).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Lumberyard' }), 'Testgården')
    expect(screen.queryByText(/could not be read/)).not.toBeInTheDocument()
    expect(stat('Pieces placed')).toBe('2')
  })
})
