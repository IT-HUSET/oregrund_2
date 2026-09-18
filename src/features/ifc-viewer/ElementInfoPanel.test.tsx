import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CutLocation } from '../../domain/1dcutting/traceability.ts'
import type { ElementInfo } from '../../domain/ifc/elementInfo.ts'
import { ElementInfoPanel } from './ElementInfoPanel.tsx'

const info: ElementInfo = {
  expressId: 1,
  name: '3 Nogging 45x95 C24',
  ifcType: 'IFCBEAM',
  globalId: 'guid-1',
  tag: 'C',
  propertySets: [],
  quantitySets: [],
}

const location: CutLocation = {
  oid: 'C',
  boardIndex: 0,
  groupLabel: '45x95 C24',
  boardNumber: 1,
  article: { id: '45x95-C24-3600', finish: 'hyvlat', profile: { thicknessMm: 45, widthMm: 95 }, grade: 'C24', lengthMm: 3600 },
  cutIndex: 1,
  cutCount: 2,
  offsetMm: 2000,
  lengthMm: 1500,
  wasteMm: 100,
  siblings: ['A'],
}

const cutting = () => screen.getByRole('region', { name: 'Cutting' })

// Cut traceability
describe('ElementInfoPanel cutting section', () => {
  // S07
  it('shows where a placed board is cut from, with links', async () => {
    const onSelectPiece = vi.fn()
    const onShowInCuttingList = vi.fn()
    render(
      <ElementInfoPanel
        info={info}
        trace={{ kind: 'placed', location }}
        onSelectPiece={onSelectPiece}
        onShowInCuttingList={onShowInCuttingList}
      />,
    )
    expect(cutting()).toHaveTextContent('45x95 C24 · 3,600 mm · board 1')
    expect(cutting()).toHaveTextContent('Cut 2 of 2 · offset 2,000 mm · 1,500 mm')
    expect(cutting()).toHaveTextContent('Waste on this board: 100 mm')

    await userEvent.click(within(cutting()).getByRole('button', { name: 'Select OID A in 3D' }))
    expect(onSelectPiece).toHaveBeenCalledWith('A')
    await userEvent.click(within(cutting()).getByRole('button', { name: 'Show in cutting list' }))
    expect(onShowInCuttingList).toHaveBeenCalledWith('C')
  })

  // S08 + S11 (c)
  it('explains not-planned, pending and failed plans, and hides the section for non-boards', () => {
    const { rerender } = render(<ElementInfoPanel info={info} trace={{ kind: 'not-planned', reason: 'no-matching-stock' }} />)
    expect(cutting()).toHaveTextContent('Not planned: No matching stock article')
    expect(within(cutting()).queryByRole('button')).not.toBeInTheDocument()

    rerender(<ElementInfoPanel info={info} trace={{ kind: 'pending' }} />)
    expect(cutting()).toHaveTextContent('Planning cuts…')

    rerender(<ElementInfoPanel info={info} trace={{ kind: 'error' }} />)
    expect(cutting()).toHaveTextContent('The cutting plan could not be computed for this model.')

    rerender(<ElementInfoPanel info={info} trace={{ kind: 'not-a-board' }} />)
    expect(screen.queryByRole('region', { name: 'Cutting' })).not.toBeInTheDocument()
    rerender(<ElementInfoPanel info={info} />)
    expect(screen.queryByRole('region', { name: 'Cutting' })).not.toBeInTheDocument()
  })

  // S04
  it('summarises a highlighted set', () => {
    render(<ElementInfoPanel info={null} highlighted={{ label: '45x95 C24 board 2: 3,000 mm', count: 2 }} />)
    expect(screen.getByRole('heading', { name: '2 pieces highlighted' })).toBeInTheDocument()
    expect(screen.getByText('45x95 C24 board 2: 3,000 mm')).toBeInTheDocument()
  })
})
