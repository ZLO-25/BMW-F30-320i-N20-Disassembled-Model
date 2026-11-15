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
import { createGearbox, requestShift, stepGearbox, MANUAL_RATIOS as GB_RATIOS, SYNC_OF, coupling, type Gear, type GearboxInputs, type GearboxState } from '../core/gearbox'
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
  clutchHeld?: boolean   // G2 手排換檔台
  brakeHeld?: boolean
  autoClutch?: boolean
  shiftSlow?: boolean
}

export interface AnimPhase { until: number; label: Bilingual }

export interface AnimDef {
  id: string
  variant: Variant | 'both'
  /** 清單裡不顯示的變體（功能已併進別的項目；CompareView 仍直接用它） */
  hiddenIn?: Variant[]
  title: Bilingual
  desc: Bilingual
  control: 'slider' | 'gear' | 'rpm' | 'shift'
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
export const MANUAL_RATIOS: Record<string, number> = GB_RATIOS   // 數值在 core/gearbox.ts
export const MANUAL_RATIOS_NOTE: Bilingual = { zh: '示意齒比（GS6-17BG 實際齒比待查證）', en: 'Illustrative ratios (actual GS6-17BG ratios unverified)' }
/** ZF 8HP45 齒比與各檔接合元件（社群來源：Wikipedia ZF 8HP） */
export const AUTO_RATIOS: Record<string, number> = { R: -3.295, N: 0, 1: 4.714, 2: 3.143, 3: 2.106, 4: 1.667, 5: 1.285, 6: 1.0, 7: 0.839, 8: 0.667 }
export const AUTO_ELEMENTS: Record<string, string> = { R: 'ABD', N: 'B', 1: 'ABC', 2: 'ABE', 3: 'BCE', 4: 'BDE', 5: 'BCD', 6: 'CDE', 7: 'ACD', 8: 'ADE' }
export const GEARS: Record<Variant, string[]> = { manual: ['R', 'N', '1', '2', '3', '4', '5', '6'], auto: ['R', 'N', '1', '2', '3', '4', '5', '6', '7', '8'] }

/** 動畫重置：把所有會被動的東西歸零（換動畫或關掉時呼叫） */
export function resetAnim(get: AnimCtx['get']) {
  crank = 0
  resetGearbox(get)
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
    for (let i = 1; i <= 6; i++) { const g = byName(o, `gear_${i}`); if (g) g.rotation.x = 0 }
    const lock = byName(o, 'lockup'); if (lock) lock.position.x = 0.02
    for (const n of ['gear_l', 'gear_r', 'pump', 'turbine', 'stator', 'carrier', 'sun', 'ring']) { const x = byName(o, n); if (x && n !== 'ring') x.rotation.x = 0 }
  }
}

/** 壓板膜片彈簧指、壓環、分離軸承依踏板量 k（0 放開 – 1 踩到底）擺姿勢；回傳軸承（上色用） */
function poseClutch(pp: THREE.Object3D | undefined, csc: THREE.Object3D | undefined, k: number) {
  const fingers = byName(pp, 'fingers'); if (fingers) fingers.children.forEach(f => { f.rotation.z = 0.25 - 0.5 * k })
  const ring = byName(pp, 'ring'); if (ring) ring.position.x = 0.006 - 0.008 * k
  const bearing = byName(csc, 'bearing'); if (bearing) bearing.position.x = 0.012 * k
  return bearing
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
    const bearing = poseClutch(pp, csc, k)
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
  hiddenIn: ['manual'],   // 手排的動力路徑已併進 manual_shift（手排換檔台）；對照模式仍用這個動畫的手排分支
  title: { zh: '各檔位的動力路徑', en: 'Power path in each gear' },
  desc: { zh: '橘色 = 正在傳遞動力的零件。看哪三個離合器 / 煞車接合，動力怎麼穿過行星齒輪組。（手排的動力路徑在「手排換檔台」裡。）', en: 'Orange = parts carrying power. See which three clutches/brakes engage and how power passes through the planetary sets. (For the manual, see the power path inside the manual shift bench.)' },
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


// ───────────────────────── G2：手排換檔台 ─────────────────────────
let box: GearboxState = createGearbox()
const ang = { engine: 0, input: 0, out: 0 }       // 累加轉角（弧度）：轉速會變，不能用 time × 固定值
let stickRow = 0, stickTilt = 0                   // 排檔桿目前的左右 / 前後角度
const VIS = 2.2 / 2000                            // 視覺轉速：2,000 rpm 畫成 2.2 rad/s（和 RPM 常數同級）
const SLEEVE_TRAVEL = 0.03                        // 套筒全行程（公尺），和 powerPath 一樣
const SYNC_IDS = ['1_2', '3_4', '5_6'] as const
const MAN = 'trans.manual.'
/** 介面每 125 ms 讀一次（唯讀）；請求換檔走 shiftRequest，判斷全在 core/gearbox.ts */
export const shiftStatus = (): Readonly<GearboxState> => box
export const shiftRequest = (to: Gear, inp: GearboxInputs) => requestShift(box, to, inp)

/** 排檔桿的 H 型位置：R | 1-2 | 3-4 | 5-6 */
const ROW_OF: Record<string, number> = { R: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3 }
const moveTo = (v: number, target: number, d: number) => (v < target ? Math.min(target, v + d) : Math.max(target, v - d))

function resetGearbox(get: AnimCtx['get']) {
  box = createGearbox(); ang.engine = ang.input = ang.out = 0; stickRow = 0; stickTilt = 0
  for (const id of SYNC_IDS) {
    const f = byName(get(MAN + 'shift_forks'), `fork_${id}`)
    if (f && f.userData.x0 !== undefined) f.position.x = f.userData.x0
  }
  const gr = byName(get(MAN + 'mainshaft'), 'gear_R')
  if (gr) { if (gr.userData.x0 !== undefined) gr.position.x = gr.userData.x0; gr.rotation.x = 0 }
  const st = byName(get(MAN + 'shift_lever'), 'stick'); if (st) { st.rotation.x = 0; st.rotation.z = 0 }
  poseClutch(get(MAN + 'pressure_plate'), get(MAN + 'csc'), 0)
  brakeVis = 0
  posePedals(get, 0, 0, 0)
}

/** 三個踏板（離合 / 煞車 / 油門）：0 = 放開，1 = 踩到底。名字見 chassisParts.ts brake_pedal_v1 / accel_pedal_v1、transParts.ts clutch_master_v2 */
const PEDAL_SWING = 0.18       // 吊掛式踏板（離合、煞車）踩到底的角度（弧度），+θ = 踏板墊往車頭
const ACCEL_SWING = -0.22      // 地板鉸鏈式油門踩到底的角度
const PUSHROD_ARM = 0.1        // 推桿掛在踏板臂樞軸下方 0.1 m
const PEDAL_TILT = -0.15
let brakeVis = 0               // 煞車踏板的視覺位置（按住時 0.12 秒內踩下）
function posePedals(get: AnimCtx['get'], clutch: number, brake: number, throttle: number) {
  const c = byName(get('trans.manual.master_cylinder'), 'pedal'); if (c) c.rotation.z = PEDAL_SWING * clutch
  const bp = get('brk.pedal')
  const b = byName(bp, 'pedal'); if (b) b.rotation.z = PEDAL_SWING * brake
  const pr = byName(bp, 'pushrod')
  if (pr) { const x0 = -0.11 + Math.sin(PEDAL_TILT) * PUSHROD_ARM; pr.position.x = x0 + PUSHROD_ARM * (Math.sin(PEDAL_TILT + PEDAL_SWING * brake) - Math.sin(PEDAL_TILT)) }
  const a = byName(get('elec.accel_pedal'), 'pedal'); if (a) a.rotation.z = ACCEL_SWING * throttle
}

function poseGearbox(get: AnimCtx['get'], b: GearboxState, dt: number) {
  const sp = (id: string) => get(MAN + id)
  const dmf = sp('dmf'), disc = sp('clutch_disc'), pp = sp('pressure_plate'), csc = sp('csc'), inp = sp('input_shaft')
  const cs = sp('countershaft'), ms = sp('mainshaft'), flange = sp('output_flange'), forks = sp('shift_forks'), lever = sp('shift_lever')
  const k = ease(b.pedal)
  const bearing = poseClutch(pp, csc, k)
  const driving = b.locked && coupling(b.pedal) > 0.5
  // 轉動（轉角累加）
  spin(dmf, 'spin', ang.engine); spin(pp, 'spin', ang.engine)
  spin(disc, 'spin', ang.input); spin(inp, 'spin', ang.input)
  spin(cs, 'spin', -ang.input * 0.8)
  spin(ms, 'spin', ang.out); spin(flange, 'spin', ang.out)
  // 套筒、撥叉、同步器
  const lockedSync = b.locked && SYNC_OF[b.gear] ? SYNC_OF[b.gear][0] : null
  const target = b.shift && b.shift.to !== 'N' ? b.shift.to : null
  const tSync = target && SYNC_OF[target] ? SYNC_OF[target] : null
  const grindSync = b.grind > 0 && b.grindAt && SYNC_OF[b.grindAt] ? SYNC_OF[b.grindAt] : null
  for (const id of SYNC_IDS) {
    const sy = sp(`synchro_${id}`)
    const sleeve = byName(sy, 'sleeve')
    if (sleeve) sleeve.position.x = b.sleeve[id] * SLEEVE_TRAVEL
    const fork = byName(forks, `fork_${id}`)
    if (fork) fork.position.x = ((fork.userData.x0 ??= fork.position.x) as number) + b.sleeve[id] * SLEEVE_TRAVEL
    spin(sy, 'spin', ang.out)
    // 兩側齒輪：奇數檔在 +X 側（gear_l），偶數檔在 −X 側（gear_r）；和輸出軸上的同號齒輪用同一個轉角
    const n = SYNC_IDS.indexOf(id) * 2 + 1
    const gl = byName(sy, 'gear_l'), gr = byName(sy, 'gear_r')
    if (gl) gl.rotation.x = ang.input / MANUAL_RATIOS[n]
    if (gr) gr.rotation.x = ang.input / MANUAL_RATIOS[n + 1]
    // 發光：同步中的環紅；打齒時紅；鎖上的套筒綠
    const syncing = b.shift?.phase === 'sync' && tSync && tSync[0] === id
    const grinding = grindSync && grindSync[0] === id
    const side = syncing ? tSync![1] : grinding ? grindSync![1] : 0
    glow(byName(sy, 'ring_l'), side === 1 ? CONTACT : OFF, 0.9)
    glow(byName(sy, 'ring_r'), side === -1 ? CONTACT : OFF, 0.9)
    glow(sleeve, lockedSync === id ? ACTIVE : OFF, 0.6)
  }
  // 輸出軸上的六個齒輪（空套，轉速 = 輸入軸 ÷ 該檔齒比）；副軸上的對應齒輪只亮、不另外轉
  const gnum = b.locked ? Number(b.gear) : 0
  for (let i = 1; i <= 6; i++) {
    const g = byName(ms, `gear_${i}`)
    if (g) g.rotation.x = ang.input / MANUAL_RATIOS[i]
    glow(g, driving && i === gnum ? POWER : OFF, 0.7)
    glow(byName(cs, `gear_${i}`), driving && i === gnum ? POWER : OFF, 0.7)
  }
  // 倒檔惰輪：滑入 2 cm
  const gR = byName(ms, 'gear_R')
  if (gR) { gR.position.x = ((gR.userData.x0 ??= gR.position.x) as number) + b.rev * 0.02; gR.rotation.x = -ang.input * 0.5; glow(gR, driving && b.gear === 'R' ? POWER : OFF, 0.7) }
  // 其他零件上色
  glow(dmf, POWER, 0.45); glow(pp, POWER, 0.4)
  glow(disc, driving ? POWER : OFF, 0.45); glow(inp, driving ? POWER : OFF, 0.45); glow(cs, driving ? POWER : OFF, 0.35)
  glow(ms, driving ? POWER : OFF, 0.4); glow(flange, driving ? POWER : OFF, 0.45)
  glow(bearing, b.pedal > 0.1 ? CONTACT : OFF, 0.6)
  // 排檔桿：先在「排」之間橫移（只在空檔時），再依套筒位置前後推
  const act: Gear = b.shift ? (b.shift.phase === 'sync' || b.shift.phase === 'engage' ? b.shift.to : b.shift.from) : b.gear
  const wantRow = ROW_OF[act] !== undefined ? (ROW_OF[act] - 1.5) * 0.12 : stickRow
  stickRow = moveTo(stickRow, wantRow, dt * 1)
  const wantTilt = act === 'R' ? b.rev * 0.2 : SYNC_OF[act] ? b.sleeve[SYNC_OF[act][0]] * 0.2 : 0
  stickTilt = moveTo(stickTilt, wantTilt, dt * 1)
  const stick = byName(lever, 'stick'); if (stick) { stick.rotation.x = stickRow; stick.rotation.z = -stickTilt }
}

const manualShift: AnimDef = {
  id: 'manual_shift', variant: 'manual', control: 'shift',
  title: { zh: '🕹 手排換檔台與動力路徑', en: '🕹 Manual shift bench & power path' },
  desc: {
    zh: '自己踩離合器、打檔、給油，看變速箱裡每個零件怎麼跟著動，也能看每個檔位的動力路徑（橘色 = 正在傳遞動力、綠色 = 被鎖上的套筒）：離合器分離 → 排檔桿推撥叉 → 套筒退回空檔 → 同步環用摩擦把輸入軸拖到新轉速（紅）→ 犬齒咬合（綠）→ 放離合器。齒輪排列為示意，不是 GS6-17BG 的實際配置。',
    en: 'Press the clutch, pick a gear and add throttle, and watch every part respond, including each gear\'s power path (orange = carrying power, green = locked sleeve): clutch releases → lever pushes the fork → sleeve returns to neutral → the synchro ring drags the input shaft to the new speed (red) → dog teeth engage (green) → clutch released. The gear layout is schematic, not the real GS6-17BG arrangement.',
  },
  parts: [MAN + 'mainshaft', MAN + 'dmf', MAN + 'clutch_disc', MAN + 'pressure_plate', MAN + 'csc', MAN + 'input_shaft', MAN + 'countershaft',   // 第一個 = 鏡頭對準的零件
    MAN + 'synchro_1_2', MAN + 'synchro_3_4', MAN + 'synchro_5_6', MAN + 'shift_forks', MAN + 'shift_lever', MAN + 'output_flange',
    MAN + 'master_cylinder', 'brk.pedal', 'elec.accel_pedal'],
  apply: ({ get, t, dt = 1 / 60, clutchHeld = false, brakeHeld = false, autoClutch = true, shiftSlow = false }) => {
    stepGearbox(box, { throttle: t, clutchHeld, brakeHeld, autoClutch, slow: shiftSlow }, dt)
    ang.engine += box.engineRpm * VIS * dt
    ang.input += box.inputRpm * VIS * dt
    ang.out += box.outRpm * VIS * dt
    poseGearbox(get, box, dt)
    brakeVis = moveTo(brakeVis, brakeHeld ? 1 : 0, dt / 0.12)
    posePedals(get, ease(box.pedal), brakeVis, t)
  },
}

export const ANIMATIONS: AnimDef[] = [engineRunning, manualShift, clutchDisengage, synchroShift, tcLockup, powerPath]
export const ANIM_BY_ID = new Map(ANIMATIONS.map(a => [a.id, a]))
const ALL_PARTS = [...new Set(ANIMATIONS.flatMap(a => a.parts))]
export const animationsFor = (variant: Variant) => ANIMATIONS.filter(a => (a.variant === 'both' || a.variant === variant) && !a.hiddenIn?.includes(variant))
/** 舊連結 / 學習目標若指到已併掉的動畫，換成現在的項目（手排的 power_path → manual_shift） */
export const resolveAnim = (id: string, variant: Variant | null): string =>
  id === 'power_path' && variant === 'manual' ? 'manual_shift' : id
