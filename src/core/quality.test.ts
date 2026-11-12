import { describe, it, expect } from 'vitest'
import { profileFor, levelFromUrl, isWeakGpu, guessLevel, initialQuality, stepDown, parseSaved, modeLevel, Governor, GOVERNOR, type Level } from './quality'

describe('quality ladder', () => {
  it('L5 is the old high and L0 is the old low', () => {
    expect(profileFor(5)).toMatchObject({ detail: 'high', msaa: 4, ao: 'full', bloom: true, shadowMap: 2048, dprMax: 2 })
    expect(profileFor(0)).toMatchObject({ detail: 'low', ao: 'off', shadowMap: 0, contact: 0 })
  })
  it('only L2 uses native canvas AA; AO levels never do', () => {
    for (const l of [0, 1, 2, 3, 4, 5] as Level[]) {
      const p = profileFor(l)
      expect(p.nativeAA).toBe(l === 2)
      if (p.ao !== 'off') expect(p.nativeAA).toBe(false)
    }
  })
  it('cost is monotonic within the high-detail ladder', () => {
    const cost = (l: Level) => { const p = profileFor(l); return p.dprMax ** 2 * (1 + p.msaa / 4 + (p.ao === 'full' ? 1 : p.ao === 'half' ? 0.4 : 0) + (p.bloom ? 0.5 : 0)) }
    for (const l of [3, 4, 5] as Level[]) expect(cost(l)).toBeGreaterThan(cost((l - 1) as Level))
  })
  it('mobile fine = mid geometry with half-res AO', () => {
    expect(profileFor(1, true, true)).toMatchObject({ detail: 'mid', ao: 'half', shadowMap: 0 })
  })
})

describe('initial level', () => {
  it('URL wins: old ?quality= values and new ?level=', () => {
    expect(levelFromUrl('?quality=low')).toBe(0)
    expect(levelFromUrl('?quality=mid')).toBe(1)
    expect(levelFromUrl('?quality=high')).toBe(5)
    expect(levelFromUrl('?level=3')).toBe(3)
    expect(levelFromUrl('?level=9')).toBeNull()
    expect(levelFromUrl('?stats=1')).toBeNull()
  })
  it('guesses by GPU name and device', () => {
    expect(isWeakGpu('ANGLE (Intel, Intel(R) UHD Graphics 620)')).toBe(true)
    expect(isWeakGpu('Google SwiftShader')).toBe(true)
    expect(isWeakGpu(null)).toBe(true)
    expect(isWeakGpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)')).toBe(false)
    expect(guessLevel(false, 8, 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)')).toBe(4)
    expect(guessLevel(false, 8, 'Intel Iris')).toBe(3)
    expect(guessLevel(true, 8, 'Adreno')).toBe(1)
    expect(guessLevel(true, 4, 'Mali')).toBe(0)
  })
  it('priority: URL > saved > guess', () => {
    const base = { mobile: false, cores: 8, gpuRenderer: 'Intel', saved: { mode: 'auto' as const, level: 2 as Level }, search: '' }
    expect(initialQuality(base)).toEqual({ mode: 'auto', level: 2 })
    expect(initialQuality({ ...base, saved: null })).toEqual({ mode: 'auto', level: 3 })
    expect(initialQuality({ ...base, search: '?quality=high' })).toEqual({ mode: 'auto', level: 5 })
    expect(initialQuality({ ...base, saved: { mode: 'fine', level: 5 } })).toEqual({ mode: 'fine', level: 5 })
  })
  it('a saved desktop level never lands on a mobile-only level and vice versa', () => {
    expect(initialQuality({ mobile: false, cores: 8, gpuRenderer: 'x', saved: { mode: 'auto', level: 0 }, search: '' }).level).toBe(2)
    expect(initialQuality({ mobile: true, cores: 8, gpuRenderer: 'x', saved: { mode: 'auto', level: 4 }, search: '' }).level).toBe(1)
  })
  it('manual modes map to fixed levels', () => {
    expect(modeLevel('smooth', false, 4)).toBe(2)
    expect(modeLevel('smooth', true, 1)).toBe(0)
    expect(modeLevel('balanced', false, 4)).toBe(3)
    expect(modeLevel('balanced', true, 0)).toBe(1)
    expect(modeLevel('fine', false, 3)).toBe(5)
  })
})

describe('stepDown', () => {
  it('goes L5→L4→L3→L2 and stops; mobile levels do not step', () => {
    expect(stepDown(5)).toBe(4)
    expect(stepDown(4)).toBe(3)
    expect(stepDown(3)).toBe(2)
    expect(stepDown(2)).toBeNull()
    expect(stepDown(1)).toBeNull()
    expect(stepDown(0)).toBeNull()
  })
})

describe('parseSaved', () => {
  it('rejects garbage', () => {
    expect(parseSaved(null)).toBeNull()
    expect(parseSaved('nope')).toBeNull()
    expect(parseSaved('{"mode":"x","level":3}')).toBeNull()
    expect(parseSaved('{"mode":"auto","level":9}')).toBeNull()
    expect(parseSaved('{"mode":"auto","level":3}')).toEqual({ mode: 'auto', level: 3 })
  })
})

describe('Governor', () => {
  const run = (g: Governor, t: number, ms: number, frames: number) => {
    let dropped = false
    for (let i = 0; i < frames; i++) { t += ms; if (g.push(t, ms)) dropped = true }
    return { t, dropped }
  }
  it('does not judge during warm-up', () => {
    const g = new Governor(0)
    expect(run(g, 0, 100, 15).dropped).toBe(false)   // 1.5 s < 2 s
  })
  it('drops after two consecutive slow windows', () => {
    const g = new Governor(0)
    let t = GOVERNOR.warmupMs
    const r = run(g, t, 40, 60)   // 2.4 s of 40 ms frames
    expect(r.dropped).toBe(true)
  })
  it('does not drop for fast frames or for a single slow window', () => {
    const g = new Governor(0)
    let t = GOVERNOR.warmupMs
    expect(run(g, t, 16, 300).dropped).toBe(false)
    const g2 = new Governor(0)
    const a = run(g2, GOVERNOR.warmupMs, 40, 26)          // ~1 s slow (one window)
    expect(a.dropped).toBe(false)
    expect(run(g2, a.t, 16, 200).dropped).toBe(false)     // then fast: strikes reset
  })
  it('ignores idle gaps (on-demand rendering)', () => {
    const g = new Governor(0)
    let t = GOVERNOR.warmupMs, dropped = false
    for (let i = 0; i < 20; i++) { t += 3000; if (g.push(t, 3000)) dropped = true }   // one frame every 3 s
    expect(dropped).toBe(false)
  })
})
