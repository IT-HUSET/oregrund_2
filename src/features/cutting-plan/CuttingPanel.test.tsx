import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeBoard } from '../../domain/boards/__fixtures__/boards.ts'
import { CuttingPanel } from './CuttingPanel.tsx'

const S01 = [
  makeBoard('1 Stud 45x95 C24', 2000, { oid: 'A', element: 'VÄGG-999' }),
  makeBoard('2 Stud 45x95 C24', 2000, { oid: 'B' }),
  makeBoard('3 Nogging 45x95 C24', 1500, { oid: 'C' }),
  makeBoard('4 Nogging 45x95 C24', 1000, { oid: 'D' }),
]

const stat = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent
const bars = () => screen.getAllByRole('list', { name: /board \d+:/ })
const segments = (bar: HTMLElement) => within(bar).getAllByRole('listitem')
const widthOf = (el: HTMLElement) => parseFloat(el.style.width)

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('CuttingPanel', () => {
  // S14
  it('shows the totals, the order list and the cut boards', () => {
    render(<CuttingPanel boards={S01} />)

    expect(stat('Pieces placed')).toBe('4')
    expect(stat('Boards to buy')).toBe('2')
    expect(stat('Purchased')).toBe('6.6 m')
    expect(stat('Required')).toBe('6.5 m')
    expect(stat('Waste')).toBe('0.1 m (1.5 %)')
    expect(stat('Not planned')).toBe('0')

    const order = within(screen.getByRole('table', { name: 'Order list' })).getAllByRole('row').slice(1)
    expect(order.map((row) => within(row).getAllByRole('cell').map((c) => c.textContent))).toEqual([
      ['45x95', 'C24', 'hyvlat', '3,600', '1', '3.6 m'],
      ['45x95', 'C24', 'hyvlat', '3,000', '1', '3.0 m'],
    ])

    expect(screen.getByRole('heading', { level: 3, name: '45x95 C24' })).toBeInTheDocument()
    const [long, short] = bars()
    expect(long).toHaveAccessibleName('45x95 C24 board 1: 3,600 mm')
    expect(segments(long).map((s) => s.textContent)).toEqual(['A', 'C', 'waste'])
    expect(segments(long)[2]).toHaveAccessibleName('Waste 100 mm')
    expect(segments(short).map((s) => s.textContent)).toEqual(['B', 'D'])

    expect(widthOf(long)).toBeCloseTo(100)
    expect(widthOf(segments(long)[0])).toBeCloseTo(55.56, 1)
    expect(widthOf(short)).toBeCloseTo(83.33, 1)
    expect(screen.queryByRole('heading', { name: /Not planned/ })).not.toBeInTheDocument()
  })

  // S15
  it('makes every cut traceable to its IFC element', async () => {
    render(<CuttingPanel boards={S01} />)
    const cut = segments(bars()[0])[0]
    const expected = 'OID A · Stud · VÄGG-999 · 2,000 mm · offset 0'
    expect(cut).toHaveAccessibleName(expected)
    expect(cut).toHaveAttribute('title', expected)

    await userEvent.tab()
    expect(cut).toHaveFocus()
    await userEvent.tab()
    expect(segments(bars()[0])[1]).toHaveAccessibleName(/^OID C · Nogging · GOLV-999 · 1,500 mm · offset 2,000$/)
  })

  // S16
  it('lists unplaced and skipped pieces with a reason', () => {
    render(
      <CuttingPanel
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
    render(<CuttingPanel boards={boards} />)
    expect(screen.queryByRole('table', { name: 'Not planned (21)' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(screen.getByRole('table', { name: 'Not planned (21)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-expanded', 'true')
  })

  // S17
  it('shows loading, empty and board-list error states', () => {
    const { rerender } = render(<CuttingPanel boards={null} />)
    expect(screen.getByText('Planning cuts…')).toBeInTheDocument()
    rerender(<CuttingPanel boards={[]} />)
    expect(screen.getByText('No boards found in this model.')).toBeInTheDocument()
    rerender(<CuttingPanel boards={null} error />)
    expect(screen.getByText('The board list could not be built from this model.')).toBeInTheDocument()
  })

  // S17 (d)
  it('shows an error when the plan cannot be computed', () => {
    render(
      <CuttingPanel
        boards={[makeBoard('1 Stud 45x95 C24', 1000, { oid: 'X' }), makeBoard('2 Stud 45x95 C24', 900, { oid: 'X' })]}
      />,
    )
    expect(screen.getByText('The cutting plan could not be computed for this model.')).toBeInTheDocument()
    expect(console.error).toHaveBeenCalledWith('Failed to compute the cutting plan', expect.any(Error))
  })
})
