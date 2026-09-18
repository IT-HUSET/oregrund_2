import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { buildLumberyards, LUMBERYARDS, type Lumberyard } from '../../domain/1dcutting/lumberyards/lumberyards.ts'
import { LumberyardsPanel } from './LumberyardsPanel.tsx'

const HEADER = 'typ;utförande;tjocklek_mm;bredd_mm;hållfasthetsklass;sorteringsklass;längd_mm;antal;källa'
const YARDS = buildLumberyards([
  {
    id: 'north',
    name: 'Norra gården',
    csv: [
      HEADER,
      'artikel;hyvlat;95;45;C24;T2;4200;2;x',
      'artikel;hyvlat;45;95;C24;T2;3600;0;x',
      'artikel;sågat;22;95;C16;;3000;10;x',
    ].join('\n'),
  },
  { id: 'south', name: 'Södra gården', csv: `${HEADER}\nartikel;hyvlat;45;195;C24;T2;5400;7;x` },
  { id: 'bad', name: 'Trasiga gården', csv: 'not a stock list' },
])

// The panel with its yard held in state, as App does.
function Switcher({ yards = YARDS, initial = 'north' }: { yards?: readonly Lumberyard[]; initial?: string }) {
  const [id, setId] = useState(initial)
  return <LumberyardsPanel lumberyards={yards} lumberyard={yards.find((y) => y.id === id)!} onSelectLumberyard={setId} />
}

const select = () => screen.getByRole('combobox', { name: 'Lumberyard' })
const table = () => screen.getByRole('table', { name: /^Stock at / })
// Each profile and grade is a row group whose first row holds its header and totals.
const groups = () =>
  within(table())
    .getAllByRole('rowgroup')
    .slice(1)
    .map((group) =>
      within(group)
        .getAllByRole('row')
        .map((row) => [...row.querySelectorAll('th, td')].map((c) => c.textContent)),
    )

describe('LumberyardsPanel', () => {
  it('lists the chosen yard’s stock per profile and grade, with totals', () => {
    render(<Switcher />)

    expect(select()).toHaveDisplayValue('Norra gården')
    expect(screen.getByRole('heading', { name: 'Stock at Norra gården' })).toBeInTheDocument()
    expect(screen.getByText('3 articles · 12 boards · 38.4 m')).toBeInTheDocument()
    expect(groups()).toEqual([
      [
        ['22x95 C16', '1 length · 10 boards · 30.0 m'],
        ['3,000', 'sågat', '10', '30.0 m'],
      ],
      [
        ['45x95 C24', '2 lengths · 2 boards · 8.4 m'],
        ['3,600', 'hyvlat', '0 out of stock', '0.0 m'],
        ['4,200', 'hyvlat', '2', '8.4 m'],
      ],
    ])
  })

  it('shows another yard’s stock when it is picked', async () => {
    render(<Switcher />)
    await userEvent.selectOptions(select(), 'Södra gården')

    expect(screen.getByRole('heading', { name: 'Stock at Södra gården' })).toBeInTheDocument()
    expect(groups()).toEqual([[['45x195 C24', '1 length · 7 boards · 37.8 m'], ['5,400', 'hyvlat', '7', '37.8 m']]])
  })

  it('says so when a yard’s stock list cannot be read, and keeps the picker usable', async () => {
    render(<Switcher initial="bad" />)
    expect(screen.getByText('The stock list for Trasiga gården could not be read.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    await userEvent.selectOptions(select(), 'Norra gården')
    expect(screen.queryByText(/could not be read/)).not.toBeInTheDocument()
    expect(table()).toBeInTheDocument()
  })

  it('says so when a yard has no articles', () => {
    const yards = buildLumberyards([{ id: 'empty', name: 'Tomma gården', csv: HEADER }])
    render(<Switcher yards={yards} initial="empty" />)
    expect(screen.getByText('Tomma gården has no articles in stock.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('lists every bundled yard', async () => {
    render(<Switcher yards={LUMBERYARDS} initial="standard" />)
    expect(within(select()).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Har allt brädgård',
      'Standard brädgård',
      'Bara märkliga mått brädgård',
    ])
    for (const name of ['Har allt brädgård', 'Bara märkliga mått brädgård', 'Standard brädgård']) {
      await userEvent.selectOptions(select(), name)
      expect(screen.getByRole('heading', { name: `Stock at ${name}` })).toBeInTheDocument()
      expect(groups().length).toBeGreaterThan(0)
    }
  })
})
