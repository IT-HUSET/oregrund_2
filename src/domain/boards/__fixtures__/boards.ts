import { toBoard, type Board } from '../board.ts'

let nextId = 1000

// Builds a board the way the loader does, from a Vertex BD name and a raw length (null = no
// Length quantity). Hand-authored test data only.
export function makeBoard(name: string, length: number | null, overrides: Partial<Board> = {}): Board {
  const expressId = nextId++
  const board = toBoard({
    expressId,
    ifcTypeName: 'IFCBEAM',
    attributes: { Name: { value: name }, Tag: { value: String(900000 + expressId) }, GlobalId: { value: `guid-${expressId}` } },
    quantities: length === null ? [] : [{ Name: { value: 'Length' }, LengthValue: { _representationValue: length } }],
    assembly: { Name: { value: 'GOLV-999' } },
  })
  return { ...board, ...overrides }
}
