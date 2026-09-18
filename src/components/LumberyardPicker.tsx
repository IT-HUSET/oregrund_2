import { useId } from 'react'
import './LumberyardPicker.css'

interface LumberyardPickerProps {
  lumberyards: readonly { id: string; name: string }[]
  value: string
  onChange(id: string): void
}

export function LumberyardPicker({ lumberyards, value, onChange }: LumberyardPickerProps) {
  const id = useId()
  return (
    <div className="yard-picker">
      <label htmlFor={id}>Lumberyard</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {lumberyards.map((yard) => (
          <option key={yard.id} value={yard.id}>
            {yard.name}
          </option>
        ))}
      </select>
    </div>
  )
}
