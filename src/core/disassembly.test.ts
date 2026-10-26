import { describe, it, expect } from 'vitest'
import { Part, PartFile, ToolFile } from './schema'
import { buildGraph, validateGraph } from './partGraph'
import {
  emptyTeardown, checkRemove, checkInstall, applyRemove, applyInstall, removedSet,
  undoEntry, redoEntry, greedyTeardown, greedyReinstall, type TeardownState,
} from './disassembly'
import toolsJson from '../../data/tools.json'

// 讀 data/parts/ 底下全部檔案（和 loadData 一樣），新系統加進來測試自動涵蓋
const partFiles = import.meta.glob('../../data/parts/*.json', { eager: true, import: 'default' }) as Record<string, unknown[]>
const allJson = Object.values(partFiles).flat()

const mk = (id: string, parent: string | null, requires: string[] = [], extra: Partial<Parameters<typeof Part.parse>[0]> = {}) =>
  Part.parse({
    id, system: 'engine', subsystem: 't', level: parent ? 2 : 0,
    name: { zh: id, en: id }, modelRef: 'procedural:box',
    position: { x: 0, y: 0, z: 0 }, parent,
    explain: { universal: { zh: '', en: '' }, specific: { zh: '', en: '' } },
    removal: { requires, tools: [], fasteners: [], warnings: [] },
    partNumbers: [], commonIssues: [], transmissionVariant: 'both',
    ...extra,
  })

/** 小引擎：缸頭上裝著氣門室蓋，氣門室蓋上裝著考爾；火星塞在缸頭裡 */
const mini = () => buildGraph([
  mk('car', null, [], { removable: false }),
  mk('engine', 'car'),
  mk('head', 'engine', ['manifold']),
  mk('cover', 'head', ['coil']),
  mk('coil', 'cover'),
  mk('plug', 'head', ['coil']),
  mk('manifold', 'head'),
  mk('throttle', 'manifold'),
])

const remove = (g: ReturnType<typeof mini>, s: TeardownState, id: string) => {
  const r = checkRemove(g, s, id)
  if (!r.ok) throw new Error(`${id} 拆不下來：${JSON.stringify(r)}`)
  return applyRemove(s, r.unit)
}

describe('規則 1：子件跟著父件走', () => {
  it('拆進氣歧管時節氣門一起下來', () => {
    const g = mini()
    const s = remove(g, emptyTeardown(), 'manifold')
    expect([...removedSet(s)].sort()).toEqual(['manifold', 'throttle'])
    expect(s.units).toHaveLength(1)
  })
  it('結構件不能拆', () => {
    const r = checkRemove(mini(), emptyTeardown(), 'car')
    expect(r).toEqual({ ok: false, reason: 'fixed' })
  })
  it('detachesWithParent=false 的子件要先單獨拆', () => {
    const g = buildGraph([mk('car', null, [], { removable: false }), mk('rad', 'car'), mk('fan', 'rad', [], { detachesWithParent: false })])
    expect(checkRemove(g, emptyTeardown(), 'rad')).toEqual({ ok: false, reason: 'blocked', blockers: ['fan'] })
    const s = remove(g, emptyTeardown(), 'fan')
    expect(checkRemove(g, s, 'rad').ok).toBe(true)
  })
})

describe('規則 2：requires 例外清單', () => {
  it('考爾沒拆，氣門室蓋拆不下來，而且會告訴你擋住的是誰', () => {
    const r = checkRemove(mini(), emptyTeardown(), 'cover')
    expect(r).toEqual({ ok: false, reason: 'blocked', blockers: ['coil'] })
  })
  it('requires 自己的子件也要先單獨拆（缸頭要先拆歧管）', () => {
    const g = mini()
    let s = remove(g, emptyTeardown(), 'coil')
    expect(checkRemove(g, s, 'head')).toEqual({ ok: false, reason: 'blocked', blockers: ['manifold'] })
    s = remove(g, s, 'manifold')
    s = remove(g, s, 'head')
    // 缸頭帶走氣門室蓋與火星塞（它們之間的 requires 都在同一包裡，不算擋）
    expect(s.units.at(-1)!.members.sort()).toEqual(['cover', 'head', 'plug'])
  })
  it('單元成員 requires 單元外面的零件時也會擋', () => {
    const g = buildGraph([mk('car', null, [], { removable: false }), mk('turbo', 'car'), mk('pipe', 'car'), mk('wastegate', 'turbo', ['pipe'])])
    expect(checkRemove(g, emptyTeardown(), 'turbo')).toEqual({ ok: false, reason: 'blocked', blockers: ['pipe'] })
  })
})

describe('規則 3：裝回 = 反順序', () => {
  it('氣門室蓋還在托盤時，考爾裝不回去', () => {
    const g = mini()
    let s = remove(g, emptyTeardown(), 'coil')
    s = remove(g, s, 'cover')
    const r = checkInstall(g, s, 'coil')
    expect(r).toEqual({ ok: false, reason: 'blocked', blockers: ['cover'] })
    s = applyInstall(s, 'cover')!.state
    expect(checkInstall(g, s, 'coil').ok).toBe(true)
  })
  it('父件還在托盤時，子件裝不回去', () => {
    const g = mini()
    let s = remove(g, emptyTeardown(), 'throttle')
    s = remove(g, s, 'coil')
    s = remove(g, s, 'manifold')
    s = remove(g, s, 'head')
    expect(checkInstall(g, s, 'throttle')).toEqual({ ok: false, reason: 'blocked', blockers: ['manifold'] })
  })
})

describe('復原 / 重做', () => {
  it('復原拆下 = 裝回；重做 = 再拆一次', () => {
    const g = mini()
    const r = checkRemove(g, emptyTeardown(), 'coil')
    if (!r.ok) throw new Error()
    const s1 = applyRemove(emptyTeardown(), r.unit)
    const h = { kind: 'remove' as const, unit: r.unit }
    const s0 = undoEntry(s1, h)
    expect(s0.units).toHaveLength(0)
    expect(redoEntry(s0, h)).toEqual(s1)
  })
  it('復原裝回會放回托盤原位置', () => {
    const g = mini()
    let s = remove(g, emptyTeardown(), 'throttle')
    s = remove(g, s, 'coil')
    const inst = applyInstall(s, 'throttle')!
    const back = undoEntry(inst.state, { kind: 'install', unit: inst.unit, index: inst.index })
    expect(back).toEqual(s)
  })
})

describe('真實資料：手排與自排各自都能從外殼一路拆到曲軸，再全部裝回', () => {
  const parts = PartFile.parse(allJson)
  const tools = ToolFile.parse(toolsJson)

  it('資料驗證沒有任何問題', () => {
    expect(validateGraph(parts, new Set(tools.map(t => t.id)))).toEqual([])
  })

  for (const v of ['manual', 'auto'] as const) {
    const g = buildGraph(parts, v)

    it(`${v}：只保留該變體的零件`, () => {
      expect(g.byId.has('trans.manual.assembly')).toBe(v === 'manual')
      expect(g.byId.has('trans.auto.assembly')).toBe(v === 'auto')
      expect(g.byId.has('eng.block.crankshaft')).toBe(true)
    })

    it(`${v}：正時鏈要先拆變速箱與飛輪/驅動盤`, () => {
      const chain = g.byId.get('eng.timing.chain')!
      expect(chain.removal.requires).toContain(v === 'manual' ? 'trans.manual.dmf' : 'trans.auto.flexplate')
      expect(chain.removal.requires).not.toContain(v === 'manual' ? 'trans.auto.flexplate' : 'trans.manual.dmf')
    })

    it(`${v}：每個零件都拆得下來（沒有死結），而且能拆到曲軸`, () => {
      const { order, stuck } = greedyTeardown(g)
      expect(stuck).toEqual([])
      expect(order).toContain('eng.block.crankshaft')
      // 曲軸一定排在飛輪/驅動盤後面
      const fw = v === 'manual' ? 'trans.manual.dmf' : 'trans.auto.flexplate'
      expect(order.indexOf('eng.block.crankshaft')).toBeGreaterThan(order.indexOf(fw))
    })

    it(`${v}：整車從外拆到內，最後只剩結構件`, () => {
      const { state, stuck } = greedyTeardown(g)
      expect(stuck).toEqual([])
      const left = [...g.byId.keys()].filter(id => !removedSet(state).has(id))
      expect(left.sort()).toEqual(['body.shell', 'car.root'])
    })

    it(`${v}：全部拆下後可以全部裝回，照反順序每一步都允許`, () => {
      let { state } = greedyTeardown(g)
      expect(state.units.length).toBeGreaterThan(100)
      expect(greedyReinstall(g, state).state.units).toEqual([])
      while (state.units.length) {
        const top = state.units.at(-1)!.root
        expect(checkInstall(g, state, top)).toEqual({ ok: true })
        state = applyInstall(state, top)!.state
      }
    })
  }

  it('手排：離合器要先拆變速箱，壓板 → 離合器片 → 飛輪有順序', () => {
    const g = buildGraph(parts, 'manual')
    expect(checkRemove(g, emptyTeardown(), 'trans.manual.pressure_plate')).toEqual({ ok: false, reason: 'blocked', blockers: ['trans.manual.assembly'] })
    // P4 起：變速箱前面還有排氣、傳動軸、橫樑
    let s = emptyTeardown()
    for (const id of ['exh.rear_muffler', 'exh.mid_section', 'drv.driveshaft', 'chs.trans_crossmember', 'trans.manual.assembly']) s = remove(g, s, id)
    expect(checkRemove(g, s, 'trans.manual.dmf')).toEqual({ ok: false, reason: 'blocked', blockers: ['trans.manual.clutch_disc'] })
    s = remove(g, s, 'trans.manual.pressure_plate')
    s = remove(g, s, 'trans.manual.clutch_disc')
    expect(checkRemove(g, s, 'trans.manual.dmf').ok).toBe(true)
  })

  it('P4：前輪 → 卡鉗 → 碟盤 → 轉向節有順序；副車架要先拆兩邊下臂', () => {
    const g = buildGraph(parts, 'auto')
    expect(checkRemove(g, emptyTeardown(), 'brk.f_rotor_l')).toEqual({ ok: false, reason: 'blocked', blockers: ['brk.f_caliper_l'] })
    expect(checkRemove(g, emptyTeardown(), 'brk.f_caliper_l')).toEqual({ ok: false, reason: 'blocked', blockers: ['chs.wheel_fl'] })
    let s = remove(g, emptyTeardown(), 'chs.wheel_fl')
    s = remove(g, s, 'brk.f_caliper_l')
    expect(s.units.at(-1)!.members.sort()).toEqual(['brk.f_caliper_l', 'brk.f_pads_l'])
    s = remove(g, s, 'brk.f_rotor_l')
    const r = checkRemove(g, s, 'chs.front_knuckle_l')
    expect(r.ok).toBe(false)
    if (!r.ok && r.reason === 'blocked') expect(r.blockers.sort()).toEqual(['chs.front_strut_l', 'str.tie_rod_l'])
    const sub = checkRemove(g, emptyTeardown(), 'chs.front_subframe')
    if (!sub.ok && sub.reason === 'blocked') expect(sub.blockers).toContain('chs.front_control_arm_l')
  })

  it('P4：變速箱要先拆傳動軸與橫樑，傳動軸要先拆排氣中段', () => {
    for (const v of ['manual', 'auto'] as const) {
      const g = buildGraph(parts, v)
      const r = checkRemove(g, emptyTeardown(), v === 'manual' ? 'trans.manual.assembly' : 'trans.auto.assembly')
      expect(r.ok).toBe(false)
      if (!r.ok && r.reason === 'blocked') expect(r.blockers.sort()).toEqual(['chs.trans_crossmember', 'drv.driveshaft'])
      expect(checkRemove(g, emptyTeardown(), 'drv.driveshaft')).toEqual({ ok: false, reason: 'blocked', blockers: ['exh.mid_section'] })
    }
  })
})
