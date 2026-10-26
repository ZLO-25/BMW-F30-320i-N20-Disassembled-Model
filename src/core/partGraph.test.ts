import { describe, it, expect } from 'vitest'
import { Part } from './schema'
import { buildGraph, validateGraph, descendants, searchParts } from './partGraph'

const mk = (id: string, parent: string | null, extra: Partial<Parameters<typeof Part.parse>[0]> = {}) =>
  Part.parse({
    id, system: 'engine', subsystem: 't', level: parent ? 2 : 0,
    name: { zh: id, en: id }, modelRef: 'procedural:box',
    position: { x: 0, y: 0, z: 0 }, parent,
    explain: { universal: { zh: '', en: '' }, specific: { zh: '', en: '' } },
    removal: { requires: [], tools: [], fasteners: [], warnings: [] },
    partNumbers: [], commonIssues: [], transmissionVariant: 'both',
    ...extra,
  })

describe('partGraph', () => {
  it('builds tree and finds descendants', () => {
    const parts = [mk('root', null), mk('a', 'root'), mk('b', 'a'), mk('c', 'root')]
    const g = buildGraph(parts)
    expect(g.roots.map(p => p.id)).toEqual(['root'])
    expect(descendants(g, 'root').map(p => p.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('detects requires cycle', () => {
    const parts = [
      mk('root', null),
      mk('a', 'root', { removal: { requires: ['b'], tools: [], fasteners: [], warnings: [] } }),
      mk('b', 'root', { removal: { requires: ['a'], tools: [], fasteners: [], warnings: [] } }),
    ]
    const issues = validateGraph(parts)
    expect(issues.some(i => i.message.includes('requires 成環'))).toBe(true)
  })

  it('detects missing parent and unknown tool', () => {
    const parts = [mk('root', null), mk('a', 'ghost', { removal: { requires: [], tools: ['tool.nope'], fasteners: [], warnings: [] } })]
    const msgs = validateGraph(parts, new Set(['tool.torx_t30'])).map(i => i.message)
    expect(msgs.some(m => m.includes('parent 不存在'))).toBe(true)
    expect(msgs.some(m => m.includes('工具不存在'))).toBe(true)
  })

  it('flags cross-variant requires', () => {
    const parts = [
      mk('root', null),
      mk('m', 'root', { transmissionVariant: 'manual', removal: { requires: ['x'], tools: [], fasteners: [], warnings: [] } }),
      mk('x', 'root', { transmissionVariant: 'auto' }),
    ]
    const msgs = validateGraph(parts).map(i => i.message)
    expect(msgs.some(m => m.includes('manual 模式下'))).toBe(true)
  })

  it('search expands ancestors', () => {
    const parts = [mk('root', null), mk('a', 'root'), mk('b', 'a', { name: { zh: '正時鏈', en: 'Timing Chain' } })]
    const { matches, expand } = searchParts(buildGraph(parts), '正時')
    expect([...matches]).toEqual(['b'])
    expect([...expand].sort()).toEqual(['a', 'b', 'root'])
  })

  it('schema rejects unverified value that is not null', () => {
    expect(() => mk('root', null, {
      removal: { requires: [], tools: [], fasteners: [{ desc: 'x', qty: 1, torque_nm: 10, oneTimeUse: false, source: null, confidence: 'unverified' }], warnings: [] },
    })).toThrow()
  })
})
