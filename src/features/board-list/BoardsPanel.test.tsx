import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { makeBoard } from '../../domain/boards/__fixtures__/boards.ts'
import { BoardsPanel } from './BoardsPanel.tsx'

const boards = [
  makeBoard('1 Stud 45x220 C24', 1200, { oid: '589830', element: 'GOLV-131*' }),
  makeBoard('2 Joist 45x220 C24', 254.99999999906868, { oid: '10', element: 'GOLV-130*' }),
  makeBoard('3 Sill plate 45x220_S C24', 3000, { oid: '9', element: 'GOLV-132' }),
  makeBoard('36 Siding board 22x145_sta_Z C16', 2408, { oid: '589997', element: '' }),
  makeBoard('4 Stud 45x220 C16', 900, { oid: '100', element: 'GOLV-131*' }),
]

// Flagged boards (S06)
const flagged = [
  ...boards,
  makeBoard('Mystery piece', 500, { oid: '700001' }),
  makeBoard('5 Stud 45x220 C24', null, { oid: '700002' }),
]

const pieces = () => screen.getByRole('table', { name: 'Pieces' })
const summary = () => screen.getByRole('table', { name: 'Summary' })
const header = (name: RegExp) => within(pieces()).getByRole('columnheader', { name })
const pieceRows = () => within(pieces()).getAllByRole('row').slice(1)
const column = (index: number) => pieceRows().map((row) => within(row).getAllByRole('cell')[index].textContent)
const oids = () => column(0)

describe('BoardsPanel', () => {
  // S04
  it('shows the summary and a piece table with all columns', () => {
    render(<BoardsPanel boards={boards} />)

    expect(within(pieces()).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'OID',
      'Role / description',
      'Element',
      'Profile▲',
      'Grade',
      'Length (mm)',
    ])
    expect(screen.getByText('5 boards · 7.8 m total')).toBeInTheDocument()
    const groupRow = within(summary()).getByRole('button', { name: '45x220 C24' }).closest('tr')!
    expect(within(groupRow).getAllByRole('cell').map((td) => td.textContent)).toEqual(['45x220', 'C24', '2', '1.5 m'])
    expect(within(summary()).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      '22x145_sta_Z C16',
      '45x220 C16',
      '45x220 C24',
      '45x220_S C24',
    ])
  })

  it('sorts by profile, then grade, then length by default', () => {
    render(<BoardsPanel boards={boards} />)
    expect(oids()).toEqual(['589997', '100', '10', '589830', '9'])
    expect(header(/Profile/)).toHaveAttribute('aria-sort', 'ascending')
  })

  // S04: header clicks toggle the order; lengths show as whole mm
  it('sorts by length ascending, then descending', async () => {
    render(<BoardsPanel boards={boards} />)
    const length = within(header(/Length/)).getByRole('button')

    await userEvent.click(length)
    expect(column(5)).toEqual(['255', '900', '1,200', '2,408', '3,000'])
    expect(header(/Length/)).toHaveAttribute('aria-sort', 'ascending')
    expect(header(/Profile/)).not.toHaveAttribute('aria-sort')

    await userEvent.click(length)
    expect(column(5)).toEqual(['3,000', '2,408', '1,200', '900', '255'])
    expect(header(/Length/)).toHaveAttribute('aria-sort', 'descending')
  })

  it.each([
    ['OID', 0, ['9', '10', '100', '589830', '589997']],
    ['Role', 1, ['Joist', 'Siding board', 'Sill plate', 'Stud', 'Stud']],
    ['Element', 2, ['GOLV-130*', 'GOLV-131*', 'GOLV-131*', 'GOLV-132', '']],
    ['Grade', 4, ['C16', 'C16', 'C24', 'C24', 'C24']],
  ])('sorts by %s both ways, keeping empty cells last', async (name, index, ascending) => {
    render(<BoardsPanel boards={boards} />)
    const button = within(header(new RegExp(name))).getByRole('button')

    await userEvent.click(button)
    expect(column(index)).toEqual(ascending)
    await userEvent.click(button)
    const nonEmpty = ascending.filter((v) => v !== '')
    expect(column(index)).toEqual([...nonEmpty.reverse(), ...ascending.filter((v) => v === '')])
  })

  // S04: a summary group filters the piece table
  it('filters the pieces to a summary group and clears the filter', async () => {
    render(<BoardsPanel boards={boards} />)
    const group = within(summary()).getByRole('button', { name: '45x220 C24' })

    await userEvent.click(group)
    expect(group).toHaveAttribute('aria-pressed', 'true')
    expect(oids()).toEqual(['10', '589830'])
    expect(screen.getByText('filtered: 45x220 C24')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Clear filter' }))
    expect(oids()).toHaveLength(5)
    expect(screen.queryByText(/filtered:/)).not.toBeInTheDocument()
    expect(group).toHaveAttribute('aria-pressed', 'false')
  })

  it('filters with the keyboard', async () => {
    render(<BoardsPanel boards={boards} />)
    within(summary()).getByRole('button', { name: '45x220_S C24' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(oids()).toEqual(['9'])
  })

  // S06: flagged boards are listed, marked and counted
  it('lists, marks and counts boards that could not be fully read', async () => {
    render(<BoardsPanel boards={flagged} />)

    expect(screen.getByText('2 boards could not be fully read')).toBeInTheDocument()
    const mystery = within(pieces()).getByRole('cell', { name: /Mystery piece/ }).closest('tr')!
    expect(within(mystery).getAllByRole('cell').map((td) => td.textContent)).toEqual([
      '700001',
      'Mystery pieceunparsed',
      'GOLV-999',
      '',
      '',
      '500',
    ])
    const noLength = within(pieces()).getByRole('cell', { name: '700002' }).closest('tr')!
    expect(within(noLength).getAllByRole('cell')[5]).toHaveTextContent('no length')

    // The board without a length counts toward its group but not its total.
    const c24 = within(summary()).getByRole('button', { name: '45x220 C24' }).closest('tr')!
    expect(within(c24).getAllByRole('cell').map((td) => td.textContent)).toEqual(['45x220', 'C24', '3', '1.5 m'])

    await userEvent.click(within(summary()).getByRole('button', { name: 'Unparsed' }))
    expect(oids()).toEqual(['700001'])
    expect(screen.getByText('filtered: Unparsed')).toBeInTheDocument()
  })

  // S08
  it('shows an empty state for a model without boards', () => {
    render(<BoardsPanel boards={[]} />)
    expect(screen.getByText('No boards found in this model.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  // S07
  it('shows an error state when the board list could not be built', () => {
    render(<BoardsPanel boards={null} error />)
    expect(screen.getByText('The board list could not be built from this model.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders file-derived text as text', () => {
    render(<BoardsPanel boards={[makeBoard('1 <b>bold</b> 45x70 C24', 1)]} />)
    expect(within(pieces()).getByText('<b>bold</b>')).toBeInTheDocument()
    expect(pieces().querySelector('b')).toBeNull()
  })
})
