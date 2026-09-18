import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IfcViewport } from './IfcViewport.tsx'

afterEach(() => {
  vi.restoreAllMocks()
})

// Clarification edge case: the browser lacks WebGL support
describe('IfcViewport', () => {
  it('explains when the browser cannot render 3D', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    render(<IfcViewport model={null} selectedExpressId={null} onPick={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Your browser does not support 3D rendering. Use Chrome or Edge.')
  })
})
