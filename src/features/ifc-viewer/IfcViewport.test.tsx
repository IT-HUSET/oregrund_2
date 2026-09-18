import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IfcViewport } from './IfcViewport.tsx'
import { EMPTY_SELECTION } from './selection.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

// Clarification edge case: the browser lacks WebGL support
describe('IfcViewport', () => {
  it('explains when the browser cannot render 3D', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    render(<IfcViewport model={null} selection={EMPTY_SELECTION} onPick={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Your browser does not support 3D rendering. Use Chrome or Edge.')
  })

  // Cut traceability TI02: "Show whole model" only while ghosting
  it('offers "Show whole model" only while other elements are ghosted', async () => {
    // Claims WebGL support so the controls render; the renderer itself then fails and is skipped.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as RenderingContext)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const onShowWholeModel = vi.fn()
    const model = new THREE.Group()
    const { rerender } = render(
      <IfcViewport model={model} selection={EMPTY_SELECTION} onPick={() => {}} onShowWholeModel={onShowWholeModel} />,
    )
    expect(screen.queryByRole('button', { name: 'Show whole model' })).not.toBeInTheDocument()

    rerender(
      <IfcViewport
        model={model}
        selection={{ primary: 1, related: [], ghostOthers: true, frameRequest: 1 }}
        onPick={() => {}}
        onShowWholeModel={onShowWholeModel}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Show whole model' }))
    expect(onShowWholeModel).toHaveBeenCalledOnce()
  })
})
