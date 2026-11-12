/**
 * 運轉動畫（P3）。每個動畫是一個純函式：給它「零件 id → 3D 物件」的查表、參數 t、檔位、時間，
 * 它直接改物件的位置 / 旋轉 / 發光色。不經過 React，每格畫面呼叫一次。
 *
 * 零件模型裡的命名約定見 procedural/transParts.ts 開頭。
 */
import * as THREE from 'three'
import type { Bilingual } from '../core/schema'
import type { Variant } from '../core/partGraph'
import { CYL_X, CYL_NO, STROKE_R, ROD_L, CRANK_ANGLE } from './procedural/engineGeom'
import { cyclePhase, strokeOf, valveLift, slider, revPerSec, rpmAt, type Stroke } from '../core/engineCycle'

export interface AnimCtx {
  get: (partId: string) => THREE.Object3D | undefined
  t: number          // 滑桿 0–1
  gear: string       // 'R','N','1'…'8'
  time: number       // 秒
  variant: Variant
  dt?: number        // 這一格經過的秒數（R4 引擎運轉用）
  playing?: boolean
  slow?: boolean     // 慢動作
}

export interface AnimPhase { until: number; label: Bilingual }

export interface AnimDef {
  id: string
  variant: Variant | 'both'
  title: Bilingual
  desc: Bilingual
  control: 'slider' | 'gear' | 'rpm'
  sliderLabels?: [Bilingual, Bilingual]
  /** 滑桿動畫可以分段說明：t 落在哪一段就顯示那段文字 */
  phases?: AnimPhase[]
  /** 這個動畫會動到的零件（面板用來自動半透明外殼、鏡頭對準） */
  parts: string[]
  apply: (c: AnimCtx) => void
}

const POWER = new THREE.Color(0xffb300)
const ACTIVE = new THREE.Color(0x00e676)
const CONTACT = new THREE.Color(0xff5252)
const OFF = new THREE.Color(0x000000)

const RPM = 2.2   // 引擎轉速的視覺值（rad/s）

export function glow(o: THREE.Object3D | undefined, color: THREE.Color, k = 0.6) {
  if (!o) return
  o.traverse((m) => {
    const mesh = m as THREE.Mesh
    if (!mesh.isMesh) return
    for (const mm of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const sm = mm as THREE.MeshStandardMaterial
      if (sm.emissive) { sm.emissive.copy(color); sm.emissiveIntensity = k }
    }
  })
}
const spin = (o: THREE.Object3D | undefined, name: string, angle: number) => { const s = o?.getObjectByName(name); if (s) s.rotation.x = angle }
const byName = (o: THREE.Object3D | undefined, name: string) => o?.getObjectByName(name)
const ease = (t: number) => t * t * (3 - 2 * t)
const seg = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)))

/** 手排示意齒比（實際 GS6-17BG 齒比待查證，這些只用來讓齒輪轉速看起來合理） */
export const MANUAL_RATIOS: Record<string, number> = { R: -3.4, N: 0, 1: 3.7, 2: 2.1, 3: 1.4, 4: 1.0, 5: 0.8, 6: 0.65 }
export const MANUAL_RATIOS_NOTE: Bilingual = { zh: '示意齒比（GS6-17BG 實際齒比待查證）', en: 'Illustrative ratios (actual GS6-17BG ratios unverified)' }
/** ZF 8HP45 齒比與各檔接合元件（社群來源：Wikipedia ZF 8HP） */
export const AUTO_RATIOS: Record<string, number> = { R: -3.295, N: 0, 1: 4.714, 2: 3.143, 3: 2.106, 4: 1.667, 5: 1.285, 6: 1.0, 7: 0.839, 8: 0.667 }
export const AUTO_ELEMENTS: Record<string, string> = { R: 'ABD', N: 'B', 1: 'ABC', 2: 'ABE', 3: 'BCE', 4: 'BDE', 5: 'BCD', 6: 'CDE', 7: 'ACD', 8: 'ADE' }
export const GEARS: Record<Variant, string[]> = { manual: ['R', 'N', '1', '2', '3', '4', '5', '6'], auto: ['R', 'N', '1', '2', '3', '4', '5', '6', '7', '8'] }

/** 動畫重置：把所有會被動的東西歸零（換動畫或關掉時呼叫） */
export function resetAnim(get: AnimCtx['get']) {
  crank = 0
  poseEngine(get, 0, false)
  for (const id of ALL_PARTS) {
    const o = get(id)
    if (!o) continue
    glow(o, OFF, 0)
    o.traverse((m) => { if (m.name === 'spin') m.rotation.x = 0 })
    const ring = byName(o, 'ring'); if (ring) ring.position.x = 0.006
    const fingers = byName(o, 'fingers'); if (fingers) fingers.children.forEach(f => { f.rotation.z = 0.25 })
    const bearing = byName(o, 'bearing'); if (bearing) bearing.position.x = 0
    const sleeve = byName(o, 'sleeve'); if (sleeve) sleeve.position.x = 0
    const lock = byName(o, 'lockup'); if (lock) lock.position.x = 0.02
    for (const n of ['gear_l', 'gear_r', 'pump', 'turbine', 'stator', 'carrier', 'sun', 'ring']) { const x = byName(o, n); if (x && n !== 'ring') x.rotation.x = 0 }
  }
}

const clutchDisengage: AnimDef = {
  id: 'clutch_disengage', variant: 'manual', control: 'slider',
  title: { zh: '踩離合器：壓板怎麼分離', en: 'Clutch pedal: how the pressure plate releases' },
  desc: { zh: '膜片彈簧平常把離合器片壓在飛輪上。分離軸承往前推彈簧指的內圈，外圈就翹起來，壓環退開，離合器片自由了。', en: 'The diaphragm spring normally clamps the disc to the flywheel. The release bearing pushes the inner tips forward, the outer edge lifts, the pressure ring backs off and the disc is free.' },
  sliderLabels: [{ zh: '放開踏板', en: 'Pedal up' }, { zh: '踩到底', en: 'Pedal down' }],
  phases: [
    { until: 0.15, label: { zh: '接合：飛輪、離合器片、輸入軸一起轉，動力進變速箱', en: 'Engaged: flywheel, disc and input shaft turn together; power flows in' } },
    { until: 0.5, label: { zh: '分離軸承開始推彈簧指，壓力正在減少（半離合）', en: 'Bearing starts pushing the fingers; clamp force drops (slipping)' } },
    { until: 1.01, label: { zh: '分離：壓環退開，離合器片停下，引擎和變速箱斷開', en: 'Released: ring backs off, disc stops, engine and gearbox are separated' } },
  ],
  parts: ['trans.manual.dmf', 'trans.manual.clutch_disc', 'trans.manual.pressure_plate', 'trans.manual.csc', 'trans.manual.input_shaft'],
  apply: ({ get, t, time }) => {
    const k = ease(t)
    const pp = get('trans.manual.pressure_plate'), disc = get('trans.manual.clutch_disc'), dmf = get('trans.manual.dmf'), csc = get('trans.manual.csc'), inp = get('trans.manual.input_shaft')
    const fingers = byName(pp, 'fingers'); if (fingers) fingers.children.forEach(f => { f.rotation.z = 0.25 - 0.5 * k })
    const ring = byName(pp, 'ring'); if (ring) ring.position.x = 0.006 - 0.008 * k
    const bearing = byName(csc, 'bearing'); if (bearing) bearing.position.x = 0.012 * k
    // 轉速：飛輪、壓板永遠跟引擎；離合器片與輸入軸在 t>0.5 後減速到停
    const discRate = RPM * (1 - seg(t, 0.4, 0.95))
    spin(dmf, 'spin', time * RPM); spin(pp, 'spin', time * RPM)
    spin(disc, 'spin', time * discRate); spin(inp, 'spin', time * discRate)
    glow(dmf, POWER, 0.5); glow(pp, POWER, 0.4)
    glow(disc, discRate > 0.2 ? POWER : OFF, 0.5); glow(inp, discRate > 0.2 ? POWER : OFF, 0.5)
    glow(bearing, t > 0.1 ? CONTACT : OFF, 0.6)
  },
}

const synchroShift: AnimDef = {
  id: 'synchro_shift', variant: 'manual', control: 'slider',
  title: { zh: '換檔：同步器怎麼先同步再咬合', en: 'Shifting: how a synchroniser matches speed, then locks' },
  desc: { zh: '以 1-2 檔同步器往 1 檔推為例。套筒先推同步環去摩擦齒輪的錐面，兩邊轉速一樣後，套筒的犬齒才滑進齒輪的齒，把齒輪鎖在輸出軸上。', en: 'Example: the 1-2 synchroniser moving into 1st. The sleeve first presses the synchro ring against the gear\'s cone; once the speeds match, the sleeve\'s dog teeth slide into the gear and lock it to the output shaft.' },
  sliderLabels: [{ zh: '空檔', en: 'Neutral' }, { zh: '入檔', en: 'In gear' }],
  phases: [
    { until: 0.3, label: { zh: '空檔：齒輪空轉（和輸出軸轉速不同），套筒在中間', en: 'Neutral: the gear freewheels at a different speed; sleeve centred' } },
    { until: 0.65, label: { zh: '同步：套筒推同步環摩擦齒輪錐面，齒輪被拖到和輸出軸同速（紅色 = 摩擦中）', en: 'Synchronising: sleeve presses the ring against the cone; the gear is dragged to shaft speed (red = friction)' } },
    { until: 0.85, label: { zh: '同速後同步環讓開，套筒繼續前進', en: 'Speeds matched: the ring unblocks and the sleeve moves on' } },
    { until: 1.01, label: { zh: '入檔：犬齒咬合，齒輪鎖在輸出軸上（綠色）', en: 'In gear: dog teeth engaged, gear locked to the output shaft (green)' } },
  ],
  parts: ['trans.manual.synchro_1_2', 'trans.manual.mainshaft', 'trans.manual.countershaft', 'trans.manual.shift_forks'],
  apply: ({ get, t, time }) => {
    const sy = get('trans.manual.synchro_1_2')
    const sleeve = byName(sy, 'sleeve'); if (sleeve) sleeve.position.x = 0.02 * ease(seg(t, 0, 0.3)) + 0.012 * ease(seg(t, 0.65, 1))
    const shaftRate = RPM * 0.5
    const gearFree = RPM * 1.1
    const sync = seg(t, 0.3, 0.65)
    const gearRate = gearFree + (shaftRate - gearFree) * ease(sync)
    spin(sy, 'spin', time * shaftRate)
    const gl = byName(sy, 'gear_l'); if (gl) gl.rotation.x = time * gearRate
    const gr = byName(sy, 'gear_r'); if (gr) gr.rotation.x = time * RPM * 0.8
    const ringL = byName(sy, 'ring_l')
    glow(ringL, t > 0.3 && t < 0.7 ? CONTACT : OFF, 0.8)
    glow(sleeve, t >= 0.85 ? ACTIVE : OFF, 0.6)
    glow(gl, t >= 0.85 ? ACTIVE : OFF, 0.5)
    spin(get('trans.manual.mainshaft'), 'spin', time * shaftRate)
    spin(get('trans.manual.countershaft'), 'spin', time * gearFree)
  },
}

const tcLockup: AnimDef = {
  id: 'tc_lockup', variant: 'auto', control: 'slider',
  title: { zh: '扭力變換器：耦合與鎖定', en: 'Torque converter: coupling and lock-up' },
  desc: { zh: '泵輪跟引擎轉，把油甩向渦輪；渦輪比泵輪慢一點（打滑），差越多扭力放大越多。巡航時鎖定離合器把兩者鎖死，不再打滑。', en: 'The pump turns with the engine and flings oil at the turbine, which lags a little (slip); more slip means more torque multiplication. When cruising, the lock-up clutch ties both together so there is no slip.' },
  sliderLabels: [{ zh: '起步（打滑）', en: 'Pull-away (slip)' }, { zh: '鎖定', en: 'Locked' }],
  phases: [
    { until: 0.35, label: { zh: '起步：泵輪快、渦輪慢，導輪把油導回，扭力放大約 2 倍', en: 'Pull-away: pump fast, turbine slow; the stator redirects oil and roughly doubles torque' } },
    { until: 0.7, label: { zh: '耦合：轉速接近，導輪開始空轉，像一個油做的離合器', en: 'Coupling: speeds converge, the stator freewheels; it behaves like a fluid clutch' } },
    { until: 1.01, label: { zh: '鎖定：鎖定離合器貼上殼體，泵輪 = 渦輪，零打滑（綠色）', en: 'Lock-up: the clutch presses on the housing; pump = turbine, zero slip (green)' } },
  ],
  parts: ['trans.auto.torque_converter', 'trans.auto.flexplate'],
  apply: ({ get, t, time }) => {
    const tc = get('trans.auto.torque_converter')
    const slip = 1 - 0.55 * (1 - ease(seg(t, 0, 0.75)))
    const pump = byName(tc, 'pump'); if (pump) pump.rotation.x = time * RPM
    const turb = byName(tc, 'turbine'); if (turb) turb.rotation.x = time * RPM * slip
    const stator = byName(tc, 'stator'); if (stator) stator.rotation.x = time * RPM * seg(t, 0.35, 0.7) * 0.9
    const lock = byName(tc, 'lockup'); if (lock) lock.position.x = 0.02 + 0.022 * ease(seg(t, 0.7, 1))
    spin(get('trans.auto.flexplate'), 'spin', time * RPM)
    glow(pump, POWER, 0.5); glow(turb, POWER, 0.2 + 0.4 * slip)
    glow(stator, t < 0.35 ? CONTACT : OFF, 0.6)
    glow(lock, t > 0.75 ? ACTIVE : OFF, 0.8)
  },
}

const powerPath: AnimDef = {
  id: 'power_path', variant: 'both', control: 'gear',
  title: { zh: '各檔位的動力路徑', en: 'Power path in each gear' },
  desc: { zh: '橘色 = 正在傳遞動力的零件。手排：看哪一對齒輪被同步器鎖上；自排：看哪三個離合器 / 煞車接合，動力怎麼穿過行星齒輪組。', en: 'Orange = parts carrying power. Manual: see which gear pair the synchroniser locks. Automatic: see which three clutches/brakes engage and how power passes through the planetary sets.' },
  parts: ['trans.manual.input_shaft', 'trans.manual.countershaft', 'trans.manual.mainshaft', 'trans.manual.synchro_1_2', 'trans.manual.synchro_3_4', 'trans.manual.synchro_5_6', 'trans.manual.output_flange',
    'trans.auto.torque_converter', 'trans.auto.clutch_packs', 'trans.auto.gearsets', 'trans.auto.output_flange', 'trans.auto.flexplate', 'trans.manual.dmf', 'trans.manual.clutch_disc', 'trans.manual.pressure_plate'],
  apply: ({ get, gear, time, variant }) => {
    if (variant === 'manual') {
      const ratio = MANUAL_RATIOS[gear] ?? 0
      const outRate = ratio === 0 ? 0 : RPM / ratio
      for (const id of ['trans.manual.dmf', 'trans.manual.clutch_disc', 'trans.manual.pressure_plate', 'trans.manual.input_shaft']) { spin(get(id), 'spin', time * RPM); glow(get(id), POWER, 0.45) }
      const cs = get('trans.manual.countershaft'); spin(cs, 'spin', time * RPM * 0.8); glow(cs, POWER, 0.45)
      const ms = get('trans.manual.mainshaft'); spin(ms, 'spin', time * outRate); glow(ms, ratio ? POWER : OFF, 0.45)
      const n = Number(gear)
      for (let i = 1; i <= 6; i++) {
        const gm = byName(ms, `gear_${i}`)
        // 空套齒輪永遠跟副軸齒輪轉（常嚙合）；被鎖上的那個和輸出軸同速
        if (gm) gm.rotation.x = time * RPM * 0.8 * (0.5 + i * 0.2)
        glow(gm, i === n ? POWER : OFF, 0.7)
        glow(byName(cs, `gear_${i}`), i === n ? POWER : OFF, 0.7)
      }
      glow(byName(ms, 'gear_R'), gear === 'R' ? POWER : OFF, 0.7)
      const syncOf: Record<number, [string, number]> = { 1: ['1_2', 1], 2: ['1_2', -1], 3: ['3_4', 1], 4: ['3_4', -1], 5: ['5_6', 1], 6: ['5_6', -1] }
      for (const s of ['1_2', '3_4', '5_6']) {
        const sy = get(`trans.manual.synchro_${s}`)
        const sleeve = byName(sy, 'sleeve')
        const hit = syncOf[n]
        if (sleeve) sleeve.position.x = hit && hit[0] === s ? hit[1] * 0.03 : 0
        spin(sy, 'spin', time * outRate)
        glow(sleeve, hit && hit[0] === s ? ACTIVE : OFF, 0.6)
      }
      const of = get('trans.manual.output_flange'); spin(of, 'spin', time * outRate); glow(of, ratio ? POWER : OFF, 0.45)
    } else {
      const ratio = AUTO_RATIOS[gear] ?? 0
      const outRate = ratio === 0 ? 0 : RPM / ratio
      const el = AUTO_ELEMENTS[gear] ?? ''
      spin(get('trans.auto.flexplate'), 'spin', time * RPM); glow(get('trans.auto.flexplate'), POWER, 0.45)
      const tc = get('trans.auto.torque_converter')
      const pump = byName(tc, 'pump'); if (pump) pump.rotation.x = time * RPM
      const turb = byName(tc, 'turbine'); if (turb) turb.rotation.x = time * RPM * 0.95
      glow(pump, POWER, 0.45); glow(turb, POWER, 0.45)
      const cp = get('trans.auto.clutch_packs')
      for (const L of 'ABCDE') {
        const on = el.includes(L)
        glow(byName(cp, `pack_${L}`), on ? ACTIVE : OFF, 0.7)
        const piston = byName(cp, `piston_${L}`); if (piston) { piston.position.x = (piston.userData.x0 ??= piston.position.x) - (on ? 0.012 : 0) }
      }
      const gs = get('trans.auto.gearsets')
      for (let s = 1; s <= 4; s++) {
        const set = byName(gs, `set_${s}`)
        const sun = byName(set, 'sun'); if (sun) sun.rotation.x = time * RPM * (ratio ? 1 : 0.3) * (1 - s * 0.15)
        const carrier = byName(set, 'carrier'); if (carrier) carrier.rotation.x = time * (ratio ? outRate : 0) * (0.5 + s * 0.15)
        glow(set, ratio ? POWER : OFF, 0.3)
      }
      const of = get('trans.auto.output_flange'); spin(of, 'spin', time * outRate); glow(of, ratio ? POWER : OFF, 0.45)
    }
  },
}

// ───────────────────────── R4：引擎運轉 ─────────────────────────
/** 曲軸目前角度（弧度）。放模組裡累加，因為轉速會變，不能用 time × 固定轉速 */
let crank = 0
export const engineStatus = () => {
  const deg = ((crank * 180) / Math.PI) % 720
  return { deg, strokes: [1, 2, 3, 4].map(c => strokeOf(cyclePhase(deg, c))) as Stroke[] }
}
const LIFT = 0.008                      // 氣門開度（視覺值）
const STROKE_GLOW: Partial<Record<Stroke, THREE.Color>> = { power: new THREE.Color(0xff6a00), intake: new THREE.Color(0x2a7fff) }
const ENGINE_SPIN: [string, number][] = [
  ['eng.block.crankshaft', 1], ['eng.front.vibration_damper', 1], ['trans.manual.dmf', 1], ['trans.auto.flexplate', 1],
  ['eng.head.camshaft_intake', 0.5], ['eng.head.camshaft_exhaust', 0.5], ['eng.timing.vanos_intake', 0.5], ['eng.timing.vanos_exhaust', 0.5],
  ['eng.acc.alternator', 0.08 / 0.03], ['eng.acc.ac_compressor', 0.08 / 0.055],   // 皮帶盤半徑比（示意尺寸）
]
/** 把引擎擺到曲軸角 a（弧度）的樣子 */
export function poseEngine(get: AnimCtx['get'], a: number, glowOn = true) {
  for (const [id, k] of ENGINE_SPIN) { const o = get(id); if (o) o.rotation.x = a * k }
  const bal = get('eng.block.balance_shafts')
  for (const i of [0, 1]) { const b = byName(bal, `bal_${i}`); if (b) b.rotation.x = (i ? 2 : -2) * a }
  const set = get('eng.block.piston_rod_set')
  const valves = get('eng.head.valves')
  const deg = (a * 180) / Math.PI
  CYL_X.forEach((_, i) => {
    const s = slider(CRANK_ANGLE[i] + a, STROKE_R, ROD_L)
    const piston = byName(set, `piston_${i}`), rod = byName(set, `rod_${i}`)
    const y0 = (piston?.userData.y0 ?? (piston ? (piston.userData.y0 = piston.position.y - slider(CRANK_ANGLE[i], STROKE_R, ROD_L).pistonY) : 0)) as number
    if (piston) piston.position.y = y0 + s.pistonY
    if (rod) {
      const ry0 = (rod.userData.y0 ??= rod.position.y - slider(CRANK_ANGLE[i], STROKE_R, ROD_L).py) as number
      rod.position.y = ry0 + s.py
      rod.position.z = s.pz
      rod.rotation.x = -s.rodAngle
    }
    const phase = cyclePhase(deg, CYL_NO[i])
    const st = strokeOf(phase)
    const vi = byName(valves, `vi_${i}`), ve = byName(valves, `ve_${i}`)
    if (vi) vi.position.y = -LIFT * valveLift(phase, 'intake')
    if (ve) ve.position.y = -LIFT * valveLift(phase, 'exhaust')
    // 做功：活塞頂發橘光（越剛點火越亮）；進氣：淡藍
    const c = glowOn ? STROKE_GLOW[st] : undefined
    glow(piston, c ?? OFF, c ? (st === 'power' ? 1 - (phase / 180) * 0.7 : 0.35) : 0)
  })
}

const engineRunning: AnimDef = {
  id: 'engine_running', variant: 'both', control: 'rpm',
  title: { zh: '引擎運轉：四行程與轉動件', en: 'Engine running: four strokes and moving parts' },
  desc: {
    zh: '曲軸轉兩圈，每一缸各完成一次「進氣 → 壓縮 → 做功 → 排氣」。四缸輪流點火，所以任何時候都有一缸在做功。凸輪軸轉速是曲軸的一半，平衡軸是兩倍（反向轉、抵銷四缸引擎的二次振動）。橘光 = 正在做功，藍光 = 正在進氣。點火順序 1-3-4-2 是直列四缸常見的順序（N20 原廠資料待查證）；氣門正時簡化成整個行程開著。',
    en: 'In two crank turns every cylinder completes intake → compression → power → exhaust once. The four cylinders fire in turn, so one is always on its power stroke. The camshafts turn at half crank speed, the balance shafts at twice (counter-rotating to cancel the four-cylinder second-order shake). Orange = power stroke, blue = intake. The 1-3-4-2 firing order is the usual inline-four order (N20 factory figure unverified); valve timing is simplified to open for the whole stroke.',
  },
  sliderLabels: [{ zh: '低轉速', en: 'Low rpm' }, { zh: '7,000 rpm 紅線', en: '7,000 rpm redline' }],
  parts: ['eng.block.crankshaft', 'eng.block.piston_rod_set', 'eng.head.camshaft_intake', 'eng.head.camshaft_exhaust', 'eng.head.valves', 'eng.block.balance_shafts', 'eng.front.vibration_damper', 'eng.acc.alternator', 'eng.acc.ac_compressor', 'eng.timing.vanos_intake', 'eng.timing.vanos_exhaust', 'trans.manual.dmf', 'trans.auto.flexplate'],
  apply: ({ get, t, dt = 0, playing, slow = true }) => {
    if (playing) crank += dt * revPerSec(rpmAt(t), slow) * Math.PI * 2
    poseEngine(get, crank)
  },
}

export const ANIMATIONS: AnimDef[] = [engineRunning, clutchDisengage, synchroShift, tcLockup, powerPath]
export const ANIM_BY_ID = new Map(ANIMATIONS.map(a => [a.id, a]))
const ALL_PARTS = [...new Set(ANIMATIONS.flatMap(a => a.parts))]
export const animationsFor = (variant: Variant) => ANIMATIONS.filter(a => a.variant === 'both' || a.variant === variant)
