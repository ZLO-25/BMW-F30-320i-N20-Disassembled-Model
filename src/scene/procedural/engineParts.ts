/**
 * N20 引擎零件的程式化模型（P2 版）。目標：形狀像、比例近似、位置關係正確；尺寸是示意，沒有對照原廠圖。
 * 座標：每個產生器的原點 = 資料裡該零件的 position。引擎座標原點在缸體中心。
 *       +X 車頭（皮帶側，正時鏈也在這一側、皮帶盤後面）、+Y 上、+Z 右（渦輪/排氣側）、-X 後方（飛輪／變速箱側）。曲軸沿 X，在 y=-0.09。
 * 零件位置寫在 data/parts/engine.json，改這裡的尺寸時兩邊要一起改。
 */
import * as THREE from 'three'
import {
  registerProcedural, getProcedural, segs, mat, COLORS, M, at, mesh, rbox, cylX, cylY, cylZ, tube, beltLoop, sprocket, openTray,
  hexHead, hoseClamp, type Detail,
} from './registry'

import { CYL_X, CRANK_Y, STROKE_R, ROD_L, CRANK_ANGLE } from './engineGeom'
export { CYL_X }
const BEARING_X = [-0.182, -0.091, 0, 0.091, 0.182]                    // 五道主軸承
const BORE_R = 0.042
const HEAD_Y = 0.183
const CAM_Y = 0.115                                                    // 缸頭座標
const CAM_Z = 0.055

const grp = (...objs: THREE.Object3D[]) => { const g = new THREE.Group(); g.add(...objs); return g }

registerProcedural('empty', () => new THREE.Group())
registerProcedural('box', (d: Detail) => grp(mesh(rbox(d, 0.1, 0.1, 0.1), M.steel())))

// ───────────────────────── 缸體 ─────────────────────────
registerProcedural('engine_block_v2', (d) => {
  const g = new THREE.Group()
  // 上半部：有四個缸孔的鋁合金鑄件（擠出形狀，缸孔是真的洞，拆掉缸頭看得到活塞）
  const s = new THREE.Shape()
  const W = 0.29, D = 0.15, r = 0.02
  s.moveTo(-W + r, -D); s.lineTo(W - r, -D); s.quadraticCurveTo(W, -D, W, -D + r)
  s.lineTo(W, D - r); s.quadraticCurveTo(W, D, W - r, D); s.lineTo(-W + r, D)
  s.quadraticCurveTo(-W, D, -W, D - r); s.lineTo(-W, -D + r); s.quadraticCurveTo(-W, -D, -W + r, -D)
  for (const x of CYL_X) { const h = new THREE.Path(); h.absarc(x, 0, BORE_R, 0, Math.PI * 2, true); s.holes.push(h) }
  const upper = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: false, curveSegments: segs(d, 24, 12, 6) })
  upper.rotateX(-Math.PI / 2)
  g.add(mesh(upper, M.castAl()))
  // 缸壁內面（深色，讓缸孔看起來有深度）
  for (const x of CYL_X) g.add(mesh(new THREE.CylinderGeometry(BORE_R - 0.0005, BORE_R - 0.0005, 0.178, segs(d, 32, 16, 8), 1, true), mat(0x8d9096, { metalness: 0.9, roughness: 0.35, side: THREE.BackSide }), x, 0.09, 0))
  // 下半部曲軸箱：四面牆 + 五道隔板，底部開口（拆掉油底殼看得到曲軸）
  const lower = openTray(d, 0.6, 0.18, 0.36, 0.014, M.castAl, false)
  lower.position.y = -0.18
  g.add(lower)
  for (const x of BEARING_X) g.add(mesh(rbox(d, 0.012, 0.12, 0.33, 0.003), M.castAl(), x, -0.04, 0))
  // 側面加強肋
  for (const x of [-0.24, -0.12, 0, 0.12, 0.24]) for (const z of [0.183, -0.183]) g.add(mesh(rbox(d, 0.012, 0.3, 0.012, 0.004), M.castAl(), x, -0.03, z))
  // 前方正時鏈室的背板（鏈條在它外面 x=+0.318，皮帶盤後面；審查後從後方改到前方，見 docs/REVIEW_REPORT.md H1）
  g.add(mesh(rbox(d, 0.012, 0.52, 0.32, 0.006), M.castAl(), 0.306, 0.07, 0))
  // 後端面（飛輪側）
  g.add(mesh(rbox(d, 0.012, 0.3, 0.3, 0.006), M.castAl(), -0.306, -0.03, 0))
  // 引擎腳支架
  for (const z of [0.2, -0.2]) g.add(mesh(rbox(d, 0.08, 0.05, 0.04, 0.008), M.castAl(), 0.05, -0.02, z))
  // 排水塞、感知器座之類的小凸台
  for (const x of [-0.15, 0.05, 0.2]) g.add(mesh(cylZ(d, 0.009, 0.012), M.machinedAl(), x, 0.05, -0.185))
  return g
})

registerProcedural('head_gasket_v1', (d) => {
  const s = new THREE.Shape()
  s.moveTo(-0.288, -0.148); s.lineTo(0.288, -0.148); s.lineTo(0.288, 0.148); s.lineTo(-0.288, 0.148); s.closePath()
  for (const x of CYL_X) { const h = new THREE.Path(); h.absarc(x, 0, BORE_R + 0.002, 0, Math.PI * 2, true); s.holes.push(h) }
  for (const x of [-0.22, -0.09, 0.09, 0.22]) for (const z of [-0.11, 0.11]) { const h = new THREE.Path(); h.absarc(x, z, 0.008, 0, Math.PI * 2, true); s.holes.push(h) }
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: false, curveSegments: segs(d, 24, 12, 6) })
  geo.rotateX(-Math.PI / 2)
  return grp(mesh(geo, mat(0x2a2c30, { metalness: 0.8, roughness: 0.45 })))
})

// ───────────────────────── 缸頭 ─────────────────────────
registerProcedural('cylinder_head_v2', (d) => {
  const g = new THREE.Group()
  // 下半部實心（燃燒室、水道）
  g.add(mesh(rbox(d, 0.58, 0.08, 0.3, 0.01), M.castAl(), 0, 0.04, 0))
  // 上半部是開頂的凸輪軸室，拆掉氣門室蓋就看得到凸輪軸
  const tray = openTray(d, 0.58, 0.06, 0.3, 0.012, M.castAl, false)
  tray.position.y = 0.08
  g.add(tray)
  // 火星塞套管
  for (const x of CYL_X) g.add(mesh(cylY(d, 0.017, 0.07), M.castAl(), x, 0.105, 0))
  // 進氣道（左 -Z）與排氣道（右 +Z）的開口
  for (const x of CYL_X) {
    g.add(mesh(rbox(d, 0.05, 0.03, 0.006, 0.01), M.dark(), x, 0.05, -0.151))
    g.add(mesh(rbox(d, 0.04, 0.026, 0.006, 0.01), M.dark(), x, 0.05, 0.151))
  }
  // 凸輪軸承座（下半）
  for (const x of BEARING_X) for (const z of [CAM_Z, -CAM_Z]) g.add(mesh(rbox(d, 0.02, 0.03, 0.035, 0.004), M.castAl(), x, 0.1, z))
  // 缸頭螺絲頭
  for (const x of [-0.22, -0.09, 0.09, 0.22]) for (const z of [-0.11, 0.11]) g.add(mesh(cylY(d, 0.009, 0.012), M.darkSteel(), x, 0.086, z))
  return g
})

registerProcedural('valve_cover_v2', (d) => {
  const g = new THREE.Group()
  const p = M.blackPlastic
  g.add(mesh(rbox(d, 0.58, 0.05, 0.3, 0.018), p(), 0, 0.025, 0))
  g.add(mesh(rbox(d, 0.54, 0.03, 0.22, 0.015), p(), 0, 0.055, -0.01))
  // 考爾井
  for (const x of CYL_X) {
    g.add(mesh(cylY(d, 0.026, 0.02), p(), x, 0.075, 0))
    g.add(mesh(cylY(d, 0.019, 0.022), M.dark(), x, 0.077, 0))
  }
  // 頂部加強肋
  for (const x of [-0.27, -0.18, -0.09, 0, 0.09, 0.18, 0.27]) g.add(mesh(rbox(d, 0.006, 0.012, 0.2, 0.002), p(), x, 0.073, -0.01))
  // 內建油氣分離器 / PCV
  g.add(mesh(rbox(d, 0.2, 0.03, 0.07, 0.012), p(), -0.13, 0.075, -0.1))
  g.add(mesh(cylY(d, 0.022, 0.02), p(), -0.2, 0.095, -0.1))
  g.add(mesh(cylZ(d, 0.011, 0.05), p(), -0.05, 0.08, -0.14))
  // 周圍螺絲
  // R2：周圍的六角法蘭螺絲（M6，對邊 10 mm）
  for (const x of [-0.27, -0.13, 0, 0.13, 0.27]) for (const z of [-0.14, 0.14]) g.add(mesh(hexHead(d, 0.010, 0.006), M.steel(), x, 0.05, z))
  return g
})

registerProcedural('engine_cover_v1', (d) => {
  const g = new THREE.Group()
  g.add(mesh(rbox(d, 0.48, 0.02, 0.24, 0.009), M.glossPlastic(), 0, 0, 0))
  g.add(mesh(rbox(d, 0.4, 0.012, 0.15, 0.006), M.glossPlastic(), 0, 0.014, -0.01))
  // 中央金屬飾條
  g.add(mesh(rbox(d, 0.22, 0.004, 0.035, 0.002), M.machinedAl(), 0.03, 0.021, -0.01))
  // 兩條縱向稜線
  for (const z of [-0.07, 0.05]) g.add(mesh(rbox(d, 0.38, 0.006, 0.008, 0.003), M.glossPlastic(), 0, 0.021, z))
  return g
})

/**
 * R2 引擎飾蓋（依 ZL 實車引擎室照片描繪外形）：
 *   - 四邊圓角的大面板，右前角（+X、+Z）挖一個缺口讓機油加注蓋露出來
 *   - 中間凸起的上層、右後方三道斜紋、左側一條長的字樣凸條（實車是 BMW / TwinPower Turbo 字樣，這裡不放商標文字）
 *   - 前方中間一個圓形徽章座（不放廠徽）
 * 座標：原點在氣門室蓋上方，+X 車頭，+Z 右側（排氣側）。
 */
registerProcedural('engine_cover_v2', (d) => {
  const g = new THREE.Group()
  const W = 0.5, D = 0.27, R = 0.035
  const notch = { x: 0.2, z: 0.09, r: 0.034 }   // 和 eng.head.oil_filler_cap 的位置一致
  // 外形畫在 (X, -Z) 平面，擠出後轉成水平
  const s = new THREE.Shape()
  const x0 = -W / 2, x1 = W / 2, y0 = -D / 2, y1 = D / 2
  s.moveTo(x0 + R, y0)
  s.lineTo(notch.x - notch.r - 0.01, y0)
  // 右前角（shape 的 y = -z，所以 z = +0.09 在 y = -0.09）：沿缺口的圓弧繞過去
  s.absarc(notch.x, -notch.z, notch.r + 0.006, Math.PI, Math.PI * 0.5 - 0.6, true)
  s.lineTo(x1, -notch.z + notch.r * 0.4)
  s.lineTo(x1, y1 - R)
  s.quadraticCurveTo(x1, y1, x1 - R, y1)
  s.lineTo(x0 + R, y1)
  s.quadraticCurveTo(x0, y1, x0, y1 - R)
  s.lineTo(x0, y0 + R)
  s.quadraticCurveTo(x0, y0, x0 + R, y0)
  const curve = segs(d, 16, 8, 4)
  const base = new THREE.ExtrudeGeometry(s, { depth: 0.014, bevelEnabled: d !== 'low', bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: segs(d, 3, 2, 1), curveSegments: curve })
  base.rotateX(-Math.PI / 2)
  g.add(mesh(base, M.blackPlastic(), 0, -0.008, 0))
  // 上層凸起：較小的圓角板
  const top = new THREE.Shape()
  const tw = 0.36, td = 0.17, tr = 0.03
  top.moveTo(-tw / 2 + tr, -td / 2); top.lineTo(tw / 2 - tr, -td / 2); top.quadraticCurveTo(tw / 2, -td / 2, tw / 2, -td / 2 + tr)
  top.lineTo(tw / 2, td / 2 - tr); top.quadraticCurveTo(tw / 2, td / 2, tw / 2 - tr, td / 2); top.lineTo(-tw / 2 + tr, td / 2)
  top.quadraticCurveTo(-tw / 2, td / 2, -tw / 2, td / 2 - tr); top.lineTo(-tw / 2, -td / 2 + tr); top.quadraticCurveTo(-tw / 2, -td / 2, -tw / 2 + tr, -td / 2)
  const tg = new THREE.ExtrudeGeometry(top, { depth: 0.012, bevelEnabled: d !== 'low', bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: segs(d, 3, 2, 1), curveSegments: curve })
  tg.rotateX(-Math.PI / 2)
  g.add(mesh(tg, M.glossPlastic(), -0.03, 0.01, 0.01))
  // 左側（-Z）長條字樣凸條
  g.add(mesh(rbox(d, 0.22, 0.004, 0.022, 0.002), M.machinedAl(), -0.04, 0.0285, -0.05))
  // 右後方三道斜紋
  for (let i = 0; i < 3; i++) {
    const rib = mesh(rbox(d, 0.07, 0.005, 0.006, 0.0025), M.glossPlastic(), -0.13 + i * 0.022, 0.0275, 0.055)
    rib.rotation.y = 0.55
    g.add(rib)
  }
  // 前方中間的圓形徽章座（不放廠徽）
  g.add(mesh(cylY(d, 0.026, 0.006), M.machinedAl(), 0.1, 0.027, 0.01))
  g.add(mesh(cylY(d, 0.021, 0.007), M.glossPlastic(), 0.1, 0.028, 0.01))
  return g
})

registerProcedural('coil_set_v2', (d) => {
  const g = new THREE.Group()
  for (const x of CYL_X) {
    const c = new THREE.Group()
    c.add(mesh(cylY(d, 0.0145, 0.1), M.blackPlastic(), 0, -0.05, 0))
    c.add(mesh(cylY(d, 0.011, 0.02), M.rubber(), 0, -0.105, 0))
    c.add(mesh(rbox(d, 0.04, 0.026, 0.062, 0.008), M.glossPlastic(), 0, 0.012, 0.008))
    c.add(mesh(rbox(d, 0.022, 0.018, 0.02, 0.004), M.greyPlastic(), 0, 0.012, 0.048))
    c.add(mesh(cylY(d, 0.005, 0.008), M.steel(), 0.012, 0.028, -0.014))
    c.position.x = x
    g.add(c)
  }
  // R2：線束。四個考爾插頭接到同一條波紋管線束，往後方（-X）走出去接 DME
  const loomZ = 0.072, loomY = 0.02
  g.add(mesh(tube(d, [[CYL_X[3] + 0.04, loomY, loomZ], [0, loomY + 0.004, loomZ + 0.004], [CYL_X[0] - 0.03, loomY, loomZ], [-0.26, loomY - 0.01, loomZ + 0.02], [-0.32, loomY - 0.04, loomZ + 0.05]], 0.0075), M.rubber()))
  for (const x of CYL_X) g.add(mesh(tube(d, [[x, 0.014, 0.058], [x - 0.006, loomY, loomZ - 0.004]], 0.004), M.rubber()))
  if (d === 'high') for (let i = 0; i < 26; i++) {
    // 波紋管的環紋
    const x = CYL_X[3] + 0.035 - i * 0.0155
    g.add(mesh(new THREE.TorusGeometry(0.0078, 0.0011, 4, 12), M.rubber(), x, loomY + 0.002, loomZ + 0.002, 0, Math.PI / 2, 0))
  }
  return g
})

registerProcedural('filler_cap_v1', (d) => {
  const g = grp(mesh(cylY(d, 0.024, 0.018), M.glossPlastic()), mesh(cylY(d, 0.02, 0.006), M.glossPlastic(), 0, 0.012, 0))
  g.add(mesh(rbox(d, 0.036, 0.008, 0.006, 0.002), M.glossPlastic(), 0, 0.017, 0))
  return g
})

registerProcedural('spark_plug_set_v2', (d) => {
  const g = new THREE.Group()
  for (const x of CYL_X) {
    const p = new THREE.Group()
    p.add(mesh(cylY(d, 0.007, 0.022), M.steel(), 0, -0.012, 0))                                    // 螺牙
    p.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 6), M.steel(), 0, 0.006, 0))         // 六角
    p.add(mesh(cylY(d, 0.0055, 0.042), M.ceramic(), 0, 0.033, 0))                                   // 陶瓷
    p.add(mesh(cylY(d, 0.0032, 0.008), M.steel(), 0, 0.058, 0))                                     // 頂端接頭
    p.add(mesh(rbox(d, 0.002, 0.004, 0.004, 0.0005), M.steel(), 0, -0.025, 0.002))                  // 側電極
    p.position.x = x
    g.add(p)
  }
  return g
})

// ───────────────────────── 凸輪軸、VANOS、Valvetronic ─────────────────────────
registerProcedural('cam_caps_v1', (d) => {
  const g = new THREE.Group()
  for (const x of BEARING_X) for (const z of [CAM_Z, -CAM_Z]) {
    g.add(mesh(rbox(d, 0.02, 0.018, 0.036, 0.004), M.castAl(), x, 0, z))
    for (const dz of [-0.013, 0.013]) g.add(mesh(cylY(d, 0.004, 0.006), M.darkSteel(), x, 0.011, z + dz))
  }
  return g
})

function camshaft(d: Detail, phase: number): THREE.Group {
  const g = new THREE.Group()
  g.add(mesh(cylX(d, 0.011, 0.6), M.forged(), -0.01, 0, 0))
  for (const x of BEARING_X) g.add(mesh(cylX(d, 0.0135, 0.018), M.steel(), x, 0, 0))
  // 凸輪（蛋形）：每缸兩個，依點火順序 1-3-4-2 錯開角度
  const egg = new THREE.Shape()
  const n = segs(d, 28, 16, 10)
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const rr = 0.015 + 0.007 * Math.max(0, Math.cos(a)) ** 2
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr
    if (i === 0) egg.moveTo(px, py); else egg.lineTo(px, py)
  }
  const lobeGeo = new THREE.ExtrudeGeometry(egg, { depth: 0.012, bevelEnabled: false })
  lobeGeo.translate(0, 0, -0.006)
  lobeGeo.rotateY(Math.PI / 2)
  const order = [0, 3, 1, 2]   // 1、3、4、2 缸各差 90° 凸輪角
  CYL_X.forEach((x, i) => {
    for (const dx of [-0.018, 0.018]) {
      const lobe = mesh(lobeGeo, M.steel(), x + dx, 0, 0)
      lobe.rotation.x = phase + order[i] * Math.PI / 2
      g.add(lobe)
    }
  })
  // 後端六角（扳手固定用）
  g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.014, 6).rotateZ(Math.PI / 2), M.steel(), -0.255, 0, 0))
  return g
}
registerProcedural('camshaft_intake_v1', (d) => camshaft(d, 0))
registerProcedural('camshaft_exhaust_v1', (d) => camshaft(d, Math.PI / 3))

registerProcedural('vanos_unit_v1', (d) => {
  const g = new THREE.Group()
  g.add(mesh(sprocket(d, 0.05, 32, 0.01), M.darkSteel(), -0.016, 0, 0))
  g.add(mesh(cylX(d, 0.04, 0.03), M.steel(), 0, 0, 0))
  g.add(mesh(cylX(d, 0.03, 0.006), M.machinedAl(), -0.022, 0, 0))
  g.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 6).rotateZ(Math.PI / 2), M.darkSteel(), -0.028, 0, 0))
  return g
})

registerProcedural('vanos_solenoids_v1', (d) => {
  const g = new THREE.Group()
  for (const z of [-0.04, 0.04]) {
    g.add(mesh(cylY(d, 0.011, 0.045), M.steel(), 0, 0.01, z))
    g.add(mesh(rbox(d, 0.022, 0.018, 0.026, 0.004), M.blackPlastic(), 0, 0.04, z))
  }
  return g
})

registerProcedural('eccentric_shaft_v1', (d) => {
  const g = grp(mesh(cylX(d, 0.008, 0.56), M.forged()))
  for (const x of CYL_X) g.add(mesh(cylX(d, 0.014, 0.014), M.steel(), x, 0.004, 0))
  // 蝸輪扇形（馬達從這裡帶動）
  const sector = new THREE.CylinderGeometry(0.035, 0.035, 0.008, segs(d, 24, 12, 8), 1, false, 0, Math.PI * 0.7).rotateZ(Math.PI / 2)
  g.add(mesh(sector, M.steel(), 0.05, 0, 0))
  return g
})

registerProcedural('valvetronic_motor_v1', (d) => {
  const g = new THREE.Group()
  g.add(mesh(cylZ(d, 0.024, 0.07), M.darkSteel(), 0, 0, -0.01))
  g.add(mesh(cylZ(d, 0.03, 0.01), M.castAl(), 0, 0, 0.03))
  g.add(mesh(rbox(d, 0.025, 0.02, 0.03, 0.005), M.blackPlastic(), 0, 0.028, -0.02))
  return g
})

registerProcedural('rocker_set_v1', (d) => {
  const g = new THREE.Group()
  for (const x of CYL_X) for (const dx of [-0.018, 0.018]) {
    // 排氣側：滾子搖臂 + 液壓頂桿
    g.add(mesh(rbox(d, 0.012, 0.007, 0.034, 0.002), M.steel(), x + dx, 0, 0.045))
    g.add(mesh(cylY(d, 0.006, 0.014), M.steel(), x + dx, -0.006, 0.062))
    // 進氣側：多一支 Valvetronic 中間搖臂（斜立）
    g.add(mesh(rbox(d, 0.012, 0.007, 0.034, 0.002), M.steel(), x + dx, 0, -0.045))
    g.add(mesh(rbox(d, 0.01, 0.04, 0.008, 0.002), M.darkSteel(), x + dx, 0.02, -0.075, 0.5, 0, 0))
    g.add(mesh(cylY(d, 0.006, 0.014), M.steel(), x + dx, -0.006, -0.062))
  }
  return g
})

registerProcedural('valve_set_v1', (d) => {
  const g = new THREE.Group()
  const helix = (r: number, h: number, turns: number) => {
    const pts: [number, number, number][] = []
    const n = segs(d, 36, 30, 12)
    for (let i = 0; i <= n; i++) { const a = (i / n) * turns * Math.PI * 2; pts.push([Math.cos(a) * r, (i / n) * h - h / 2, Math.sin(a) * r]) }
    // E6：氣門彈簧線徑 1.2 mm、整組藏在缸頭裡，不需要 96 段 × 12 邊的細管（以前 16 支共約 3.7 萬個三角形，全車最多的零件）
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), false, 'catmullrom', 0.3), segs(d, 72, 48, 20), 0.0012, segs(d, 5, 5, 4), false)
  }
  const springGeo = d === 'low' ? cylY(d, 0.009, 0.028) : helix(0.0085, 0.028, 6)
  // R4：每缸的進氣門（vi_i，-Z 側）與排氣門（ve_i，+Z 側）各成一組，運轉動畫把它們往下推開
  CYL_X.forEach((x, i) => {
    for (const [side, z, rHead] of [['vi', -0.035, 0.014], ['ve', 0.035, 0.012]] as const) {
      const v = new THREE.Group()
      v.name = `${side}_${i}`
      for (const dx of [-0.018, 0.018]) {
        v.add(mesh(cylY(d, 0.0028, 0.085), M.steel(), x + dx, -0.005, z))
        v.add(mesh(cylY(d, rHead, 0.003, rHead * 0.7), M.steel(), x + dx, -0.048, z))
        v.add(mesh(cylY(d, 0.007, 0.004), d === 'high' ? M.darkSteel() : M.steel(), x + dx, 0.035, z))
        g.add(mesh(springGeo, M.steel(), x + dx, 0.02, z))
      }
      g.add(v)
    }
  })
  return g
})

// ───────────────────────── 燃油 ─────────────────────────
registerProcedural('hpfp_v1', (d) => {
  const g = new THREE.Group()
  g.add(mesh(cylY(d, 0.026, 0.055), M.machinedAl(), 0, 0.01, 0))
  g.add(mesh(rbox(d, 0.07, 0.01, 0.05, 0.004), M.machinedAl(), 0, -0.02, 0))
  g.add(mesh(cylY(d, 0.016, 0.02), M.steel(), 0, 0.045, 0))
  g.add(mesh(rbox(d, 0.02, 0.016, 0.026, 0.004), M.blackPlastic(), 0.026, 0.02, 0))
  g.add(mesh(cylX(d, 0.005, 0.03), M.steel(), -0.03, 0.025, 0))
  return g
})

// 高壓油管：高壓油泵在缸頭後端「排氣側」（排氣凸輪軸驅動，ST1111），油管繞過缸頭後方接到進氣側的油軌
registerProcedural('hp_line_v1', (d) =>
  grp(mesh(tube(d, [[-0.24, 0.165, 0.075], [-0.27, 0.165, 0.0], [-0.285, 0.13, -0.12], [-0.262, 0.09, -0.205], [-0.24, 0.055, -0.195], [-0.205, 0.05, -0.19]], 0.004), M.steel())))

registerProcedural('rail_injectors_v1', (d) => {
  const g = grp(mesh(cylX(d, 0.011, 0.42), M.steel()))
  for (const x of [-0.19, 0.19]) g.add(mesh(cylX(d, 0.013, 0.02), M.steel(), x, 0, 0))
  for (const x of CYL_X) {
    const inj = new THREE.Group()
    inj.add(mesh(cylY(d, 0.0075, 0.05), M.steel(), 0, -0.025, 0))
    inj.add(mesh(rbox(d, 0.016, 0.014, 0.018, 0.003), M.blackPlastic(), 0, 0.006, -0.012))
    inj.add(mesh(cylY(d, 0.004, 0.012), M.orange(), 0, -0.055, 0))
    inj.position.set(x, 0, 0.012)
    inj.rotation.x = 0.9
    g.add(inj)
    g.add(mesh(rbox(d, 0.02, 0.02, 0.03, 0.004), M.steel(), x, 0, 0.004))
  }
  return g
})

// ───────────────────────── 進氣 ─────────────────────────
registerProcedural('intake_manifold_v2', (d) => {
  const g = new THREE.Group()
  const p = M.greyPlastic
  // 氣室
  g.add(mesh(cylX(d, 0.052, 0.48), p(), 0, -0.05, -0.13))
  for (const x of [-0.24, 0.24]) g.add(mesh(new THREE.SphereGeometry(0.052, segs(d, 24, 12, 8), segs(d, 12, 8, 5)), p(), x, -0.05, -0.13))
  // 四根彎管：從氣室外側往上繞，再進缸頭
  for (const x of CYL_X) g.add(mesh(tube(d, [[x, -0.02, -0.17], [x, 0.05, -0.16], [x, 0.07, -0.07], [x, 0.03, -0.015], [x, 0, 0.004]], 0.021), p()))
  // 對缸頭的法蘭
  g.add(mesh(rbox(d, 0.5, 0.05, 0.012, 0.006), p(), 0, 0, 0.003))
  // 前端節氣門法蘭
  g.add(mesh(cylX(d, 0.044, 0.012), p(), 0.29, -0.05, -0.13))
  // 進氣壓力/溫度感知器
  g.add(mesh(rbox(d, 0.02, 0.016, 0.03, 0.004), M.blackPlastic(), -0.1, 0.006, -0.13))
  return g
})

registerProcedural('throttle_body_v2', (d) => {
  const g = new THREE.Group()
  g.add(mesh(cylX(d, 0.04, 0.05), M.castAl(), 0.03, 0, 0))
  g.add(mesh(cylX(d, 0.033, 0.052), M.dark(), 0.03, 0, 0))
  const plate = mesh(cylX(d, 0.032, 0.002), M.machinedAl(), 0.03, 0, 0)
  plate.rotation.y = 0.5
  g.add(plate)
  for (const x of [0.005, 0.055]) g.add(mesh(rbox(d, 0.008, 0.095, 0.095, 0.01), M.castAl(), x, 0, 0))
  g.add(mesh(rbox(d, 0.05, 0.04, 0.035, 0.008), M.blackPlastic(), 0.03, -0.055, -0.02))
  g.add(mesh(rbox(d, 0.02, 0.016, 0.02, 0.004), M.blackPlastic(), 0.03, -0.055, 0.008))
  return g
})

// 引擎座標中的關鍵接點（增壓管、進氣管要接到這些點）
const P_COMP_IN: [number, number, number] = [0.165, 0.123, 0.27]
const P_COMP_OUT: [number, number, number] = [0.11, 0.25, 0.31]
const P_THROTTLE_IN: [number, number, number] = [0.395, 0.193, -0.28]
const P_IC_R: [number, number, number] = [0.95, -0.07, 0.29]
const P_IC_L: [number, number, number] = [0.95, -0.07, -0.29]
// R2：空濾盒搬到引擎前方中間（車座標 x 1.80、y 0.82、z -0.04），出口在它的右後方
//   出口車座標 ≈ (1.80 - 0.215, 0.82 - 0.005, -0.04 + 0.30) → 引擎座標（減掉 eng.assembly 的 1.15, 0.4, 0）
const P_AIRBOX_OUT: [number, number, number] = [0.435, 0.415, 0.26]

/** 把一個「沿 Y 軸」的環形幾何（管束、波紋）擺到管子端點 p，朝向 p → toward 的方向 */
function clampLike(_d: Detail, geo: THREE.BufferGeometry, p: readonly number[], toward: readonly number[], m: THREE.Material): THREE.Mesh {
  const o = new THREE.Mesh(geo, m)
  const dir = new THREE.Vector3(toward[0] - p[0], toward[1] - p[1], toward[2] - p[2]).normalize()
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  // 往管子裡面挪一點，管束才是箍在管子上而不是懸在管口
  o.position.set(p[0], p[1], p[2]).addScaledVector(dir, 0.012)
  return o
}

registerProcedural('inlet_duct_v1', (d) => {
  const g = new THREE.Group()
  // R2：從前方的空濾盒出口往後、往下，沿著引擎右前方接到渦輪壓縮端
  const path: [number, number, number][] = [P_AIRBOX_OUT, [0.38, 0.39, 0.285], [0.32, 0.3, 0.3], [0.26, 0.2, 0.29], [0.2, 0.14, 0.278], P_COMP_IN]
  g.add(mesh(tube(d, path, 0.034), M.rubber()))
  // 波紋段（往下彎的那一段）
  if (d !== 'low') for (let i = 0; i < 6; i++) {
    const t = i / 5
    const p = [0.335 - t * 0.05, 0.33 - t * 0.09, 0.298 - t * 0.006] as const
    g.add(clampLike(d, new THREE.TorusGeometry(0.036, 0.004, 6, segs(d, 20, 12, 8)).rotateX(Math.PI / 2), [p[0], p[1], p[2]], [p[0] - 0.05, p[1] - 0.09, p[2]], M.rubber()))
  }
  // 兩端的蝸桿式管束
  g.add(clampLike(d, hoseClamp(d, 0.034), P_AIRBOX_OUT, path[1], M.steel()))
  g.add(clampLike(d, hoseClamp(d, 0.034), P_COMP_IN, path[path.length - 2], M.steel()))
  return g
})

registerProcedural('airbox_v1', (d) => {
  const g = new THREE.Group()
  g.add(mesh(rbox(d, 0.34, 0.09, 0.27, 0.02), M.blackPlastic(), 0, -0.035, 0))
  g.add(mesh(rbox(d, 0.345, 0.07, 0.275, 0.02), M.blackPlastic(), 0, 0.045, 0))          // 上蓋
  g.add(mesh(rbox(d, 0.35, 0.006, 0.28, 0.002), M.greyPlastic(), 0, 0.01, 0))             // 分模線
  g.add(mesh(cylZ(d, 0.036, 0.06), M.blackPlastic(), -0.05, 0.02, 0.15))                  // 出口
  g.add(mesh(rbox(d, 0.14, 0.05, 0.08, 0.012), M.blackPlastic(), 0.2, -0.03, -0.06))      // 進風口（往車頭）
  for (const [x, z] of [[-0.15, -0.12], [0.15, -0.12], [-0.15, 0.12], [0.15, 0.12]]) g.add(mesh(cylY(d, 0.007, 0.01), M.steel(), x, 0.082, z))
  return g
})

registerProcedural('air_filter_v1', (d) => {
  const g = grp(mesh(rbox(d, 0.3, 0.012, 0.24, 0.004), M.rubber(), 0, -0.012, 0))
  const n = d === 'low' ? 10 : 24
  for (let i = 0; i < n; i++) g.add(mesh(new THREE.BoxGeometry(0.28, 0.035, 0.004), M.filter(), 0, 0.006, -0.11 + (i / (n - 1)) * 0.22))
  return g
})

/**
 * R2 空濾盒（依 ZL 實車引擎室照片）：F30 N20 的空濾盒橫躺在引擎前方、水箱上面，
 * 上蓋是一個「T」字形：後半段寬、前半段（往水箱罩方向）窄，前緣有金屬卡扣。
 * 空氣從前方（腎型水箱罩後面）進來，濾過後從右後方的出口接到渦輪。
 *
 *          +X（車頭）
 *        ┌───────┐        ← 窄的前段（進風）
 *   ┌────┘       └────┐
 *   │   濾芯在這一層下  │   ← 寬的後段
 *   └──────────────[出口]   出口在右後（+Z）
 *
 * 座標：原點在盒子中心。寬（Z）0.80 m、深（X）0.38 m、高 0.11 m（照片比例估算）。
 */
export const AIRBOX = { w: 0.8, rear: 0.24, stemW: 0.32, stemD: 0.14, h: 0.11 }
registerProcedural('airbox_v2', (d) => {
  const g = new THREE.Group()
  const { w, rear, stemW, stemD, h } = AIRBOX
  const xr = -0.19 + rear / 2           // 寬段中心 x
  const xs = -0.19 + rear + stemD / 2   // 窄段中心 x
  // 下殼（深灰）與上蓋（黑），中間一條分模線
  g.add(mesh(rbox(d, rear, h * 0.55, w, 0.02), M.greyPlastic(), xr, -h * 0.2, 0))
  g.add(mesh(rbox(d, stemD, h * 0.55, stemW, 0.02), M.greyPlastic(), xs, -h * 0.2, 0))
  g.add(mesh(rbox(d, rear + 0.006, h * 0.42, w + 0.006, 0.022), M.blackPlastic(), xr, h * 0.27, 0))
  g.add(mesh(rbox(d, stemD + 0.006, h * 0.42, stemW + 0.006, 0.022), M.blackPlastic(), xs, h * 0.27, 0))
  // 上蓋的三道橫向加強紋（照片上清楚可見）
  for (const [x, len] of [[xr - 0.07, w - 0.12], [xr + 0.0, w - 0.1], [xr + 0.07, w - 0.16]] as const) g.add(mesh(rbox(d, 0.008, 0.006, len, 0.003), M.blackPlastic(), x, h * 0.48 + 0.003, 0.02))
  // 前緣的金屬卡扣（寬段前緣兩個、窄段前端一個）
  for (const z of [0.3, 0.12, -0.3]) {
    g.add(mesh(rbox(d, 0.012, 0.03, 0.022, 0.003), M.steel(), -0.19 + rear + 0.004, h * 0.15, z))
  }
  g.add(mesh(rbox(d, 0.012, 0.03, 0.022, 0.003), M.steel(), -0.19 + rear + stemD + 0.004, h * 0.15, 0))
  // 進風口（往水箱罩）
  g.add(mesh(rbox(d, 0.04, h * 0.5, stemW * 0.8, 0.012), M.blackPlastic(), -0.19 + rear + stemD + 0.02, -h * 0.05, 0))
  // 出口：右後方往後的短管，接進氣管
  g.add(mesh(cylX(d, 0.038, 0.06), M.blackPlastic(), -0.19 - 0.025, -h * 0.05, 0.3))
  // 蓋子上的固定螺絲
  for (const z of [-0.36, 0.36]) g.add(mesh(hexHead(d, 0.010, 0.006), M.darkSteel(), xr - 0.08, h * 0.48, z))
  return g
})

registerProcedural('air_filter_v2', (d) => {
  // 大片平板濾芯：橡膠框 + 摺紙
  const g = grp(mesh(rbox(d, 0.2, 0.012, 0.66, 0.004), M.rubber(), 0, -0.012, 0))
  const n = d === 'low' ? 16 : 48
  for (let i = 0; i < n; i++) g.add(mesh(new THREE.BoxGeometry(0.18, 0.03, 0.004), M.filter(), 0, 0.006, -0.31 + (i / (n - 1)) * 0.62))
  return g
})

// ───────────────────────── 增壓 ─────────────────────────
registerProcedural('turbo_v2', (d) => {
  const g = new THREE.Group()
  const n = segs(d, 32, 16, 8)
  // 一體式排氣歧管：四根管子收成雙渦流（1-4、2-3 各一組）
  const coll: Record<number, [number, number, number]> = { 0: [-0.04, -0.1, 0.1], 3: [-0.04, -0.1, 0.1], 1: [0.0, -0.105, 0.105], 2: [0.0, -0.105, 0.105] }
  CYL_X.forEach((x, i) => g.add(mesh(tube(d, [[x, 0, 0.006], [x, -0.008, 0.045], [x * 0.55, -0.055, 0.085], coll[i]], 0.017), M.hotIron())))
  g.add(mesh(rbox(d, 0.5, 0.045, 0.012, 0.006), M.castIron(), 0, 0, 0.006))
  // 渦輪殼（熱端）
  g.add(mesh(new THREE.TorusGeometry(0.048, 0.028, segs(d, 14, 8, 5), n), M.hotIron(), -0.02, -0.12, 0.12, 0, Math.PI / 2, 0))
  g.add(mesh(cylX(d, 0.04, 0.05), M.hotIron(), -0.02, -0.12, 0.12))
  g.add(mesh(cylY(d, 0.032, 0.05), M.hotIron(), -0.06, -0.15, 0.12))       // 往下的排氣出口
  g.add(mesh(rbox(d, 0.06, 0.008, 0.06, 0.005), M.castIron(), -0.06, -0.175, 0.12))
  // 中心軸承座（水冷、油冷）
  g.add(mesh(cylX(d, 0.03, 0.05), M.castAl(), 0.035, -0.12, 0.12))
  g.add(mesh(tube(d, [[0.035, -0.09, 0.12], [0.03, -0.04, 0.09], [0.0, 0.0, 0.05]], 0.004), M.steel()))
  // 壓縮殼（冷端，鋁）
  g.add(mesh(new THREE.TorusGeometry(0.052, 0.03, segs(d, 14, 8, 5), n), M.machinedAl(), 0.1, -0.12, 0.12, 0, Math.PI / 2, 0))
  g.add(mesh(cylX(d, 0.045, 0.03), M.machinedAl(), 0.1, -0.12, 0.12))
  g.add(mesh(cylX(d, 0.033, 0.05), M.machinedAl(), 0.14, -0.12, 0.12))     // 進氣口（朝車頭）
  g.add(mesh(tube(d, [[0.1, -0.075, 0.15], [0.105, -0.03, 0.16], P_COMP_OUT.map((v, i) => v - [0, HEAD_Y + 0.06, 0.15][i]) as [number, number, number]], 0.026), M.machinedAl()))
  return g
})

registerProcedural('wastegate_v1', (d) => {
  const g = grp(mesh(cylZ(d, 0.024, 0.026), M.steel()), mesh(cylZ(d, 0.026, 0.006), M.steel(), 0, 0, 0.012))
  g.add(mesh(cylX(d, 0.003, 0.07), M.steel(), 0.03, -0.01, -0.01))
  g.add(mesh(rbox(d, 0.012, 0.03, 0.006, 0.002), M.steel(), 0.065, -0.025, -0.01))
  return g
})

registerProcedural('heat_shield_v1', (d) => {
  const geo = new THREE.CylinderGeometry(0.1, 0.1, 0.3, segs(d, 32, 16, 8), 1, true, -Math.PI * 0.15, Math.PI * 0.75).rotateZ(Math.PI / 2)
  const m = M.heatShield(); m.side = THREE.DoubleSide
  const g = grp(mesh(geo, m, 0, -0.09, 0.0))
  g.add(mesh(rbox(d, 0.3, 0.006, 0.05, 0.003), M.heatShield(), 0, 0.012, -0.03))
  return g
})

registerProcedural('charge_pipe_v1', (d) => {
  const g = new THREE.Group()
  g.add(mesh(tube(d, [P_COMP_OUT, [0.2, 0.27, 0.33], [0.45, 0.12, 0.34], [0.75, -0.04, 0.33], P_IC_R], 0.027), M.blackPlastic()))
  g.add(mesh(tube(d, [P_IC_L, [0.75, -0.03, -0.33], [0.52, 0.12, -0.33], [0.43, 0.193, -0.29], P_THROTTLE_IN], 0.027), M.blackPlastic()))
  for (const p of [P_COMP_OUT, P_IC_R, P_IC_L, P_THROTTLE_IN]) g.add(mesh(new THREE.SphereGeometry(0.031, segs(d, 16, 10, 6), segs(d, 10, 6, 4)), M.greyPlastic(), ...p))
  return g
})

registerProcedural('intercooler_v1', (d) => {
  const g = new THREE.Group()
  const core = mat(0x2b2e33, { metalness: 0.8, roughness: 0.5 })
  g.add(mesh(rbox(d, 0.05, 0.19, 0.5, 0.004), core))
  // 鰭片（細橫條）
  if (d !== 'low') for (let i = 0; i < 18; i++) g.add(mesh(new THREE.BoxGeometry(0.052, 0.002, 0.5), mat(0x484c52, { metalness: 0.9, roughness: 0.4 }), 0, -0.09 + i * 0.0105, 0))
  for (const z of [0.28, -0.28]) {
    g.add(mesh(rbox(d, 0.07, 0.2, 0.06, 0.015), M.blackPlastic(), -0.005, 0, z))
    g.add(mesh(cylX(d, 0.03, 0.06), M.blackPlastic(), -0.05, -0.02, z * 1.04))
  }
  return g
})

// ───────────────────────── 正時（前置：鏈條在皮帶盤後面，VANOS 在凸輪軸前端）─────────────────────────
const CHAIN_CIRCLES = [
  { y: CRANK_Y, z: 0, r: 0.031 },
  { y: HEAD_Y + CAM_Y, z: -CAM_Z, r: 0.053 },
  { y: HEAD_Y + CAM_Y, z: CAM_Z, r: 0.053 },
]

registerProcedural('timing_chain_v1', (d) => {
  const loop = beltLoop(CHAIN_CIRCLES)
  const g = grp(mesh(tube(d, loop, 0.0045, true), M.darkSteel()))
  // 鏈節的凹凸感：每隔一段放一片小鏈板
  if (d === 'high') {
    const curve = new THREE.CatmullRomCurve3(loop.map(p => new THREE.Vector3(...p)), true)
    const plate = new THREE.BoxGeometry(0.012, 0.008, 0.003)
    const N = 110
    for (let i = 0; i < N; i++) {
      const t = i / N
      const p = curve.getPointAt(t), tg = curve.getTangentAt(t)
      const m = mesh(plate, M.steel(), p.x, p.y, p.z)
      m.rotation.x = Math.atan2(tg.z, tg.y)
      g.add(m)
    }
  }
  return g
})

registerProcedural('chain_guides_v1', (d) => {
  const g = new THREE.Group()
  const strip = (y0: number, z0: number, y1: number, z1: number, off: number) => {
    const len = Math.hypot(y1 - y0, z1 - z0)
    const m = mesh(rbox(d, 0.016, len, 0.012, 0.004), mat(0x2d2a26, { metalness: 0, roughness: 0.7 }), 0, (y0 + y1) / 2, (z0 + z1) / 2 + off)
    m.rotation.x = Math.atan2(-(z1 - z0), y1 - y0)
    return m
  }
  g.add(strip(CRANK_Y + 0.01, -0.034, HEAD_Y + CAM_Y - 0.03, -CAM_Z - 0.054, -0.01))
  g.add(strip(CRANK_Y + 0.01, 0.034, HEAD_Y + CAM_Y - 0.03, CAM_Z + 0.054, 0.01))
  return g
})

// 機械真空泵（缸頭後端、進氣側凸輪軸驅動；資料 z=-0.055）：圓筒本體 + 法蘭 + 真空管接頭
registerProcedural('vacuum_pump_v1', (d) => grp(
  mesh(cylX(d, 0.032, 0.05), M.castAl(), -0.025, 0, 0),
  mesh(cylX(d, 0.04, 0.008), M.machinedAl(), 0.002, 0, 0),
  mesh(cylZ(d, 0.007, 0.03), M.blackPlastic(), -0.03, 0.02, 0.035),
))

registerProcedural('chain_tensioner_v1', (d) => grp(
  mesh(cylZ(d, 0.011, 0.04), M.steel(), 0, 0, -0.01),
  mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 6).rotateX(Math.PI / 2), M.steel(), 0, 0, 0.014),
))

// ───────────────────────── 曲軸箱內部 ─────────────────────────
registerProcedural('crankshaft_v1', (d) => {
  const g = new THREE.Group()
  for (const x of BEARING_X) g.add(mesh(cylX(d, 0.027, 0.02), M.steel(), x, 0, 0))
  CYL_X.forEach((x, i) => {
    const a = CRANK_ANGLE[i]
    const py = Math.cos(a) * STROKE_R, pz = Math.sin(a) * STROKE_R
    g.add(mesh(cylX(d, 0.023, 0.022), M.steel(), x, py, pz))
    // 兩片曲柄臂 + 配重
    for (const dx of [-0.024, 0.024]) {
      const web = new THREE.Group()
      web.add(mesh(rbox(d, 0.012, 0.075, 0.05, 0.01), M.forged(), 0, STROKE_R / 2, 0))
      web.add(mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.012, segs(d, 24, 12, 8), 1, false, Math.PI * 0.65, Math.PI * 0.7).rotateZ(Math.PI / 2), M.forged(), 0, 0, 0))
      web.position.x = x + dx
      web.rotation.x = -a
      g.add(web)
    }
  })
  g.add(mesh(cylX(d, 0.02, 0.13), M.steel(), 0.265, 0, 0))                 // 前端軸頸（到減震盤）
  g.add(mesh(cylX(d, 0.045, 0.012), M.steel(), -0.205, 0, 0))              // 後端飛輪法蘭
  g.add(mesh(sprocket(d, 0.031, 20, 0.012), M.darkSteel(), 0.318, 0, 0))   // 正時鏈輪（在前方，減震皮帶盤後面）
  g.add(mesh(cylX(d, 0.018, 0.05), M.steel(), -0.235, 0, 0))              // 後端短軸頸（到飛輪法蘭）
  return g
})

registerProcedural('piston_rod_set_v1', (d) => {
  // R4：每缸的活塞（piston_i）與連桿（rod_i）是有名字的節點，運轉動畫才能各自動
  const g = new THREE.Group()
  CYL_X.forEach((x, i) => {
    const a = CRANK_ANGLE[i]
    const pin = new THREE.Vector3(x, CRANK_Y + Math.cos(a) * STROKE_R, Math.sin(a) * STROKE_R)
    const top = new THREE.Vector3(x, pin.y + ROD_L, 0)
    // 活塞：群組原點在活塞銷
    const piston = new THREE.Group()
    piston.name = `piston_${i}`
    piston.add(mesh(cylY(d, 0.0405, 0.05), M.machinedAl(), 0, 0.01, 0))
    // 活塞頂與活塞環另外上材質只在 high（每多一種材質手機就多一個 draw call，四缸 × 會動 = 不能合併）
    if (d === 'high') {
      piston.add(mesh(cylY(d, 0.03, 0.004), mat(0x9a9da2, { metalness: 0.8, roughness: 0.5 }), 0, 0.0355, 0))
      for (const dy of [0.022, 0.016, 0.01]) piston.add(mesh(new THREE.TorusGeometry(0.0405, 0.0012, 4, segs(d, 32, 16, 8)), M.darkSteel(), 0, dy, 0, Math.PI / 2, 0, 0))
    }
    piston.position.copy(top)
    g.add(piston)
    // 連桿：群組原點在曲柄銷
    const rod = new THREE.Group()
    rod.name = `rod_${i}`
    const len = pin.distanceTo(top)
    rod.add(mesh(rbox(d, 0.014, len - 0.04, 0.02, 0.004), M.forged(), 0, len / 2, 0))
    rod.add(mesh(cylX(d, 0.03, 0.02), M.forged(), 0, 0, 0))
    rod.add(mesh(cylX(d, 0.015, 0.02), M.forged(), 0, len, 0))
    rod.position.copy(pin)
    rod.rotation.x = Math.atan2(-(top.z - pin.z), top.y - pin.y)
    g.add(rod)
  })
  return g
})

registerProcedural('main_caps_v1', (d) => {
  const g = new THREE.Group()
  for (const x of BEARING_X) {
    g.add(mesh(rbox(d, 0.022, 0.045, 0.16, 0.008), M.castIron(), x, -0.04, 0))
    for (const z of [-0.055, 0.055]) g.add(mesh(cylY(d, 0.007, 0.012), M.darkSteel(), x, -0.067, z))
  }
  return g
})

registerProcedural('balance_shafts_v1', (d) => {
  const g = new THREE.Group()
  g.add(mesh(rbox(d, 0.3, 0.02, 0.15, 0.006), M.castAl(), 0, 0.02, 0))
  for (const [i, z] of [[0, -0.05], [1, 0.05]]) {
    // R4：兩支平衡軸各自是有名字的節點（bal_0 / bal_1），以兩倍曲軸轉速反向旋轉
    const shaft = new THREE.Group()
    shaft.name = `bal_${i}`
    shaft.add(mesh(cylX(d, 0.01, 0.3), M.steel()))
    for (const x of [-0.08, 0.08]) shaft.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, segs(d, 24, 12, 8), 1, false, 0, Math.PI).rotateZ(Math.PI / 2), M.forged(), x, 0, 0))
    shaft.position.z = z
    g.add(shaft)
  }
  return g
})

registerProcedural('oil_pump_v1', (d) => {
  const g = grp(mesh(rbox(d, 0.12, 0.045, 0.12, 0.01), M.castAl()))
  g.add(mesh(sprocket(d, 0.03, 18, 0.008), M.darkSteel(), 0.065, 0.01, 0))
  g.add(mesh(cylY(d, 0.012, 0.03), M.castAl(), 0.03, 0.03, 0.04))
  return g
})

registerProcedural('oil_pickup_v1', (d) => grp(
  mesh(tube(d, [[0, 0.03, 0], [0, -0.01, 0.01], [0, -0.035, 0.04]], 0.009), M.steel()),
  mesh(cylY(d, 0.035, 0.008), mat(0x777b80, { metalness: 0.9, roughness: 0.6, wireframe: false }), 0, -0.042, 0.04),
))

registerProcedural('oil_pan_v2', (d) => {
  const g = new THREE.Group()
  g.add(mesh(rbox(d, 0.6, 0.05, 0.36, 0.012), M.castAl(), 0, -0.025, 0))
  g.add(mesh(rbox(d, 0.34, 0.11, 0.3, 0.02), M.castAl(), 0.06, -0.095, 0))
  for (const x of [-0.04, 0.02, 0.08, 0.14]) g.add(mesh(rbox(d, 0.006, 0.02, 0.26, 0.002), M.castAl(), x, -0.155, 0))
  g.add(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.01, 6), M.steel(), 0.17, -0.153, 0.08))
  for (const x of [-0.27, -0.13, 0, 0.13, 0.27]) for (const z of [-0.172, 0.172]) g.add(mesh(cylY(d, 0.005, 0.006), M.steel(), x, -0.003, z))
  return g
})

registerProcedural('oil_level_sensor_v1', (d) => grp(
  mesh(cylY(d, 0.02, 0.05), M.blackPlastic(), 0, 0.025, 0),
  mesh(rbox(d, 0.05, 0.006, 0.05, 0.004), M.castAl(), 0, -0.002, 0),
  mesh(rbox(d, 0.018, 0.014, 0.02, 0.003), M.blackPlastic(), 0.03, -0.01, 0),
))

// ───────────────────────── 前端附件 ─────────────────────────
const BELT_CIRCLES = [
  { y: CRANK_Y, z: 0, r: 0.08 },
  { y: 0.05, z: -0.2, r: 0.03 },
  { y: -0.15, z: -0.2, r: 0.055 },
  { y: 0.075, z: -0.07, r: 0.03 },
]

registerProcedural('vibration_damper_v1', (d) => {
  const g = new THREE.Group()
  g.add(mesh(cylX(d, 0.08, 0.026), M.steel(), 0.012, 0, 0))
  for (let i = 0; i < 6; i++) g.add(mesh(new THREE.TorusGeometry(0.08, 0.0015, 4, segs(d, 40, 20, 10)), M.darkSteel(), 0.002 + i * 0.004, 0, 0, 0, Math.PI / 2, 0))
  g.add(mesh(cylX(d, 0.07, 0.008), M.rubber(), -0.004, 0, 0))
  g.add(mesh(cylX(d, 0.055, 0.03), M.castIron(), -0.012, 0, 0))
  g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 6).rotateZ(Math.PI / 2), M.darkSteel(), 0.03, 0, 0))
  return g
})

registerProcedural('belt_v1', (d) => {
  const m = mesh(tube(d, beltLoop(BELT_CIRCLES), 0.0035, true), M.rubber())
  m.scale.x = 3.2
  return grp(m)
})

registerProcedural('belt_tensioner_v1', (d) => grp(
  mesh(cylX(d, 0.03, 0.022), M.steel(), 0.015, 0.015, 0),
  mesh(rbox(d, 0.015, 0.07, 0.025, 0.006), M.castAl(), -0.005, -0.015, 0.015, 0.6, 0, 0),
  mesh(cylX(d, 0.025, 0.04), M.castAl(), -0.02, -0.045, 0.03),
))

registerProcedural('alternator_v1', (d) => {
  const g = new THREE.Group()
  g.add(mesh(cylX(d, 0.06, 0.13), M.castAl(), 0, 0, 0))
  for (let i = 0; i < 5; i++) g.add(mesh(new THREE.TorusGeometry(0.061, 0.003, 4, segs(d, 32, 16, 8)), M.castAl(), -0.05 + i * 0.025, 0, 0, 0, Math.PI / 2, 0))
  g.add(mesh(cylX(d, 0.03, 0.025), M.steel(), 0.125, 0, 0))
  g.add(mesh(cylX(d, 0.045, 0.02), M.blackPlastic(), -0.075, 0, 0))
  g.add(mesh(cylY(d, 0.006, 0.02), M.copper(), -0.07, 0.05, 0.02))
  for (const s of [1, -1]) g.add(mesh(rbox(d, 0.03, 0.025, 0.02, 0.005), M.castAl(), 0, s * 0.065, 0.02))
  return g
})

registerProcedural('ac_compressor_v1', (d) => {
  const g = new THREE.Group()
  g.add(mesh(cylX(d, 0.055, 0.17), M.castAl(), 0, 0, 0))
  g.add(mesh(cylX(d, 0.055, 0.03), M.steel(), 0.145, 0, 0))
  g.add(mesh(cylX(d, 0.03, 0.01), M.darkSteel(), 0.162, 0, 0))
  for (const x of [-0.04, 0.03]) g.add(mesh(rbox(d, 0.03, 0.03, 0.03, 0.006), M.castAl(), x, 0.06, 0))
  g.add(mesh(rbox(d, 0.02, 0.015, 0.02, 0.004), M.blackPlastic(), -0.07, 0.04, -0.03))
  return g
})

registerProcedural('starter_v1', (d) => {
  const g = new THREE.Group()
  g.add(mesh(cylX(d, 0.035, 0.12), M.darkSteel(), 0.03, 0, 0))
  g.add(mesh(cylX(d, 0.022, 0.09), M.steel(), 0.035, 0.05, 0))
  g.add(mesh(cylX(d, 0.03, 0.05), M.castAl(), -0.055, 0, 0))
  g.add(mesh(sprocket(d, 0.013, 10, 0.02), M.steel(), -0.09, 0, 0))
  g.add(mesh(cylY(d, 0.005, 0.015), M.copper(), 0.07, 0.075, 0))
  return g
})

registerProcedural('sensor_v1', (d) => grp(
  mesh(cylZ(d, 0.008, 0.035), M.blackPlastic(), 0, 0, -0.005),
  mesh(rbox(d, 0.02, 0.016, 0.02, 0.004), M.blackPlastic(), 0, 0.01, 0.015),
))

// ───────────────────────── 冷卻 ─────────────────────────
registerProcedural('water_pump_v2', (d) => {
  const g = new THREE.Group()
  g.add(mesh(cylX(d, 0.042, 0.1), M.blackPlastic(), -0.01, 0, 0))
  g.add(mesh(cylX(d, 0.055, 0.025), M.castAl(), -0.07, 0, 0))
  g.add(mesh(cylZ(d, 0.016, 0.06), M.castAl(), -0.06, 0.03, 0.03))
  g.add(mesh(cylX(d, 0.016, 0.05), M.castAl(), 0.055, 0, 0))
  g.add(mesh(rbox(d, 0.025, 0.02, 0.03, 0.004), M.greyPlastic(), 0, 0.048, 0))
  return g
})

registerProcedural('thermostat_v1', (d) => grp(
  mesh(rbox(d, 0.06, 0.05, 0.06, 0.012), M.blackPlastic()),
  mesh(cylX(d, 0.017, 0.05), M.blackPlastic(), 0.04, 0.005, 0.015),
  mesh(cylY(d, 0.016, 0.04), M.blackPlastic(), 0, -0.04, 0),
  mesh(rbox(d, 0.016, 0.014, 0.018, 0.003), M.greyPlastic(), -0.01, 0.03, -0.02),
))

registerProcedural('coolant_hoses_v1', (d) => {
  const g = new THREE.Group()
  const r = M.rubber
  g.add(mesh(tube(d, [[0.35, 0.125, 0.115], [0.5, 0.2, 0.2], [0.72, 0.26, 0.33], [0.81, 0.3, 0.35]], 0.019), r()))     // 上水管
  g.add(mesh(tube(d, [[0.81, 0.0, 0.35], [0.62, -0.08, 0.3], [0.4, -0.11, 0.22], [0.295, -0.1, 0.2]], 0.019), r()))    // 下水管
  g.add(mesh(tube(d, [[-0.29, 0.1, -0.12], [-0.42, 0.14, -0.18], [-0.6, 0.2, -0.24]], 0.012), r()))                   // 暖氣水管
  g.add(mesh(tube(d, [[-0.29, 0.1, -0.08], [-0.44, 0.13, -0.12], [-0.6, 0.19, -0.16]], 0.012), r()))
  g.add(mesh(tube(d, [[0.0, 0.2, 0.28], [0.12, 0.15, 0.3], [0.28, -0.05, 0.25]], 0.007), r()))                        // 渦輪水冷管
  // R2：上、下水管兩端的管束
  const ends: [number[], number[], number][] = [
    [[0.35, 0.125, 0.115], [0.5, 0.2, 0.2], 0.019], [[0.81, 0.3, 0.35], [0.72, 0.26, 0.33], 0.019],
    [[0.81, 0.0, 0.35], [0.62, -0.08, 0.3], 0.019], [[0.295, -0.1, 0.2], [0.4, -0.11, 0.22], 0.019],
  ]
  for (const [p, q, rr] of ends) g.add(clampLike(d, hoseClamp(d, rr), p, q, M.steel()))
  return g
})

/**
 * R2 副水箱（膨脹水箱，依 ZL 實車引擎室照片）：引擎室左前角、左避震塔前面，半透明的乳白塑膠，
 * 看得到裡面藍綠色的冷卻液液面；上面是黑色的蓋子（有警告標籤）。
 * 座標：原點在水箱中心。
 */
registerProcedural('expansion_tank_v1', (d) => {
  const g = new THREE.Group()
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xe9e1c8, roughness: 0.5, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide })
  g.add(mesh(rbox(d, 0.15, 0.12, 0.12, 0.03), shell))
  // 冷卻液（藍綠色），液面在 MIN 與 MAX 之間
  const fluid = new THREE.MeshStandardMaterial({ color: 0x2fa7b5, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.8 })
  g.add(mesh(rbox(d, 0.138, 0.058, 0.108, 0.022), fluid, 0, -0.026, 0))
  // MIN / MAX 刻度（朝向車內側 +Z，打開引擎蓋站在車旁看得到）
  for (const y of [-0.04, 0.012]) g.add(mesh(rbox(d, 0.05, 0.003, 0.002, 0.001), M.dark(), 0.02, y, 0.061))
  // 加注口與蓋子
  g.add(mesh(cylY(d, 0.026, 0.02), shell, 0.03, 0.068, 0.01))
  g.add(mesh(cylY(d, 0.032, 0.024), M.blackPlastic(), 0.03, 0.088, 0.01))
  g.add(mesh(cylY(d, 0.02, 0.003), M.orange(), 0.03, 0.1015, 0.01))      // 蓋上的警告標籤（照片上是黃色）
  if (d !== 'low') for (let i = 0; i < 12; i++) {
    // 蓋子側面的止滑紋
    const a = (i / 12) * Math.PI * 2
    g.add(mesh(new THREE.BoxGeometry(0.004, 0.02, 0.004), M.blackPlastic(), 0.03 + Math.cos(a) * 0.032, 0.088, 0.01 + Math.sin(a) * 0.032))
  }
  // 底部出水管（往下接到水箱）與側面的排氣細管
  g.add(mesh(cylY(d, 0.009, 0.03), shell, -0.04, -0.075, 0))
  g.add(mesh(tube(d, [[-0.04, -0.085, 0], [-0.03, -0.14, 0.04], [0.0, -0.2, 0.1]], 0.009), M.rubber()))
  g.add(clampLike(d, hoseClamp(d, 0.009, 0.006), [-0.04, -0.09, 0], [-0.03, -0.14, 0.04], M.steel()))
  g.add(mesh(cylZ(d, 0.004, 0.03), shell, 0.05, 0.03, 0.07))
  // 固定耳
  g.add(mesh(rbox(d, 0.03, 0.01, 0.025, 0.003), shell, -0.085, -0.03, -0.04))
  g.add(mesh(hexHead(d, 0.010, 0.006), M.darkSteel(), -0.085, -0.025, -0.04))
  return g
})

registerProcedural('radiator_v1', (d) => {
  const g = new THREE.Group()
  g.add(mesh(rbox(d, 0.04, 0.42, 0.62, 0.004), mat(0x2f3338, { metalness: 0.8, roughness: 0.5 })))
  if (d !== 'low') for (let i = 0; i < 30; i++) g.add(mesh(new THREE.BoxGeometry(0.042, 0.002, 0.62), mat(0x50555c, { metalness: 0.9, roughness: 0.4 }), 0, -0.2 + i * 0.0138, 0))
  for (const z of [0.34, -0.34]) g.add(mesh(rbox(d, 0.06, 0.44, 0.06, 0.015), M.blackPlastic(), -0.005, 0, z))
  g.add(mesh(cylX(d, 0.02, 0.06), M.blackPlastic(), -0.04, 0.12, 0.36))
  g.add(mesh(cylX(d, 0.02, 0.06), M.blackPlastic(), -0.04, -0.18, 0.36))
  return g
})

registerProcedural('fan_v1', (d) => {
  const g = new THREE.Group()
  // 導風罩：方框
  for (const [y, h, z, w] of [[0.2, 0.02, 0, 0.62], [-0.2, 0.02, 0, 0.62], [0, 0.42, 0.3, 0.02], [0, 0.42, -0.3, 0.02]] as const) g.add(mesh(rbox(d, 0.04, h, w, 0.005), M.blackPlastic(), 0, y, z))
  g.add(mesh(new THREE.TorusGeometry(0.18, 0.012, 6, segs(d, 40, 20, 10)), M.blackPlastic(), 0, 0, 0, 0, Math.PI / 2, 0))
  // 馬達與葉片
  g.add(mesh(cylX(d, 0.05, 0.06), M.darkSteel(), -0.02, 0, 0))
  const n = 7
  for (let i = 0; i < n; i++) {
    const blade = mesh(rbox(d, 0.004, 0.13, 0.05, 0.002), M.blackPlastic(), 0, 0, 0)
    blade.geometry.translate(0, 0.1, 0)
    blade.rotation.set((i / n) * Math.PI * 2, 0, 0)
    blade.rotateY(0.4)
    g.add(blade)
  }
  return g
})

// ───────────────────────── 潤滑 ─────────────────────────
registerProcedural('oil_filter_housing_v2', (d) => {
  const g = new THREE.Group()
  g.add(mesh(rbox(d, 0.1, 0.08, 0.08, 0.012), M.castAl(), 0, 0, 0))
  g.add(mesh(cylY(d, 0.04, 0.05), M.castAl(), 0, 0.055, 0))
  g.add(mesh(rbox(d, 0.12, 0.012, 0.012, 0.004), M.castAl(), 0, -0.04, 0.04))
  return g
})

registerProcedural('oil_filter_v1', (d) => {
  const g = new THREE.Group()
  g.add(mesh(cylY(d, 0.037, 0.035), M.glossPlastic(), 0, 0.03, 0))
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 6), M.glossPlastic(), 0, 0.052, 0))
  // 濾芯（藏在蓋子下面，拆下來才看得到）
  g.add(mesh(cylY(d, 0.032, 0.09), M.filter(), 0, -0.035, 0))
  g.add(mesh(cylY(d, 0.012, 0.092), M.dark(), 0, -0.035, 0))
  return g
})

registerProcedural('oil_cooler_v1', (d) => {
  const g = grp(mesh(rbox(d, 0.11, 0.06, 0.025, 0.006), M.castAl()))
  for (let i = 0; i < 6; i++) g.add(mesh(new THREE.BoxGeometry(0.11, 0.003, 0.027), M.machinedAl(), 0, -0.025 + i * 0.01, 0))
  return g
})

// 讓 tsc 不抱怨沒用到
void COLORS; void at

/**
 * R4：引擎的「外殼」零件（缸體、缸頭、氣門室蓋、油底殼、進排氣歧管…）標成 shell，
 * 播放任何運轉動畫時會自動半透明，才看得到裡面的活塞、曲軸、凸輪軸。
 */
for (const name of ['engine_block_v2', 'head_gasket_v1', 'cylinder_head_v2', 'valve_cover_v2', 'engine_cover_v2', 'cam_caps_v1', 'oil_pan_v2', 'intake_manifold_v2', 'turbo_v2', 'heat_shield_v1', 'main_caps_v1', 'coil_set_v2']) {
  const gen = getProcedural(name)
  if (!gen) continue
  registerProcedural(name, (d) => {
    const o = gen(d)
    o.traverse(c => { if ((c as THREE.Mesh).isMesh) c.userData.shell = true })
    return o
  })
}
