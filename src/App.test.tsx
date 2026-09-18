import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App.tsx'

describe('App', () => {
  it('renders the app', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Labbithuset' })).toBeInTheDocument()
  })
})
