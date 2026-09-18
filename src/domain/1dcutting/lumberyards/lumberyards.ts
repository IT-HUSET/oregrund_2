// The mock lumberyards (brädgårdar) whose stock the cutting plan is limited to.
// See docs/specs/lumberyards/lumberyards.md.
import type { StockArticle } from '../cutting.ts'
import { parseYardCsv } from '../stock.ts'
import harAlltCsv from './har-allt.csv?raw'
import markligaMattCsv from './markliga-matt.csv?raw'
import standardCsv from './standard.csv?raw'

// A yard with its stock, or with the reason its stock list could not be read.
export type Lumberyard = { id: string; name: string } & ({ stock: readonly StockArticle[] } | { error: string })

export interface LumberyardSource {
  id: string
  name: string
  // Yard stock CSV text (parseYardCsv).
  csv: string
}

// Parses each yard's stock list. A malformed list gives that yard an error instead of throwing,
// so one bad file doesn't take down the other yards or the app.
export function buildLumberyards(sources: readonly LumberyardSource[]): Lumberyard[] {
  return sources.map(({ id, name, csv }) => {
    try {
      return { id, name, stock: parseYardCsv(csv) }
    } catch (e) {
      return { id, name, error: e instanceof Error ? e.message : String(e) }
    }
  })
}

export const LUMBERYARDS: readonly Lumberyard[] = buildLumberyards([
  { id: 'har-allt', name: 'Har allt brädgård', csv: harAlltCsv },
  { id: 'standard', name: 'Standard brädgård', csv: standardCsv },
  { id: 'markliga-matt', name: 'Bara märkliga mått brädgård', csv: markligaMattCsv },
])

export const DEFAULT_LUMBERYARD_ID = 'standard'
