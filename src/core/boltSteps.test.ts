import { describe, expect, it } from 'vitest'
import { boltSteps, needsBoltSteps, holdSeconds, torqueInfo, boltCoverage } from './boltSteps'
import { PartFile } from './schema'

const partFiles = import.meta.glob('../../data/parts/*.json', { eager: true, import: 'default' }) as Record<string, unknown>
const parts = Object.values(partFiles).flatMap(m => PartFile.parse(m))

describe('R5 螺栓級拆裝步驟', () => {
  it('拆下：先拿工具、每組螺絲都要鬆、最後取下', () => {
    const p = parts.find(x => x.removal.fasteners.length >= 2 && x.removal.tools.length)!
    const s = boltSteps(p, 'remove')
    expect(s[0].kind).toBe('tools')
    expect(s.filter(x => x.kind === 'loosen')).toHaveLength(p.removal.fasteners.length)
    expect(s[s.length - 1].kind).toBe('lift')
  })

  it('裝回：反順序鎖，每組都有', () => {
    const p = parts.find(x => x.removal.fasteners.length >= 2)!
    const idx = boltSteps(p, 'install').filter(x => x.kind === 'tighten').map(x => (x as { index: number }).index)
    expect(idx).toEqual(p.removal.fasteners.map((_, i) => i).reverse())
  })

  it('沒有來源的扭力不顯示數字（錯的扭力比沒有更危險）', () => {
    for (const p of parts) for (const f of p.removal.fasteners) {
      const t = torqueInfo(f)
      if (!f.source) expect(t.nm).toBeNull()
    }
  })

  it('沒有螺絲資料的零件拆下時會說「待查證」，不會假裝沒有螺絲', () => {
    const p = parts.find(x => !x.removal.fasteners.length && x.removal.tools.length)!
    expect(needsBoltSteps(p)).toBe(true)
    expect(boltSteps(p, 'remove').some(s => s.kind === 'unknown')).toBe(true)
  })

  it('按住時間合理（0.3–2 秒）', () => {
    for (const p of parts) for (const s of boltSteps(p, 'remove')) {
      const h = holdSeconds(s)
      if (h) { expect(h).toBeGreaterThan(0.3); expect(h).toBeLessThan(2) }
    }
  })

  it('涵蓋率算得出來', () => {
    const c = boltCoverage(parts)
    expect(c.withFasteners).toBeGreaterThan(0)
    expect(c.torqueSourced).toBeLessThanOrEqual(c.groups)
  })
})
