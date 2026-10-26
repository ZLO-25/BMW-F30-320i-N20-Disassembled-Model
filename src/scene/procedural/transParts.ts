/**
 * 變速箱零件的程式化模型（P3）。示意形狀，比例近似。
 * 總成座標：原點在鐘形殼前端面中心，+X 朝引擎，箱體往 -X 延伸。引擎側零件（飛輪、離合器）用引擎座標。
 *
 * 動畫用的命名約定（src/scene/animations.ts 會用 getObjectByName 找）：
 *   name = 'spin'        會被連續旋轉的 group（繞 X 軸）
 *   name = 'fingers'     壓板膜片彈簧指；'ring' 壓板壓環；'bearing' 分離軸承
 *   name = 'sleeve'      同步器套筒；'ring_l' / 'ring_r' 同步環；'gear_l' / 'gear_r' 兩側齒輪
 *   name = 'gear_<n>'    輸出軸 / 副軸上第 n 檔的齒輪；'pack_<A-E>' 離合器組；'set_<1-4>' 行星組
 *   name = 'pump' / 'turbine' / 'stator' / 'lockup'  扭力變換器
 *   userData.shell = true 外殼：動畫時可以半透明看內部
 */
import * as THREE from 'three'
import { registerProcedural, segs, mat, M, mesh, rbox, cylX, cylY, cylZ, tube, sprocket, type Detail } from './registry'

const grp = (name = '', ...objs: THREE.Object3D[]) => { const g = new THREE.Group(); g.name = name; if (objs.length) g.add(...objs); return g }
const shell = <T extends THREE.Object3D>(o: T): T => { o.userData.shell = true; return o }

/** 空心圓盤（環）沿 X */
const ringX = (d: Detail, rOut: number, rIn: number, thick: number) => {
  const s = new THREE.Shape(); s.absarc(0, 0, rOut, 0, Math.PI * 2, false)
  const h = new THREE.Path(); h.absarc(0, 0, rIn, 0, Math.PI * 2, true); s.holes.push(h)
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: segs(d, 32, 16, 8) })
  g.translate(0, 0, -thick / 2); g.rotateY(Math.PI / 2)
  return g
}

/** 一疊交錯鋼片 / 摩擦片 */
function plateStack(d: Detail, rOut: number, rIn: number, n: number, pitch: number, name: string): THREE.Group {
  const g = grp(name)
  for (let i = 0; i < n; i++) g.add(mesh(ringX(d, rOut, rIn, pitch * 0.45), i % 2 ? M.steel() : mat(0x5a4632, { metalness: 0.2, roughness: 0.9 }), (i - (n - 1) / 2) * pitch, 0, 0))
  return g
}

// ───────────────────────── 手排 ─────────────────────────
registerProcedural('gearbox_manual_v1', (d) => {
  const g = new THREE.Group()
  const n = segs(d, 40, 20, 10)
  // 鐘形殼：錐形
  g.add(shell(mesh(new THREE.CylinderGeometry(0.105, 0.175, 0.16, n, 1, true).rotateZ(Math.PI / 2), M.castAl(), -0.08, 0, 0)))
  const front = M.castAl(); front.side = THREE.DoubleSide
  g.add(shell(mesh(ringX(d, 0.178, 0.09, 0.012), front, -0.002, 0, 0)))
  // 主箱體：長方圓角 + 加強肋
  g.add(shell(mesh(rbox(d, 0.44, 0.2, 0.19, 0.04), M.castAl(), -0.38, -0.01, 0)))
  for (const x of [-0.25, -0.33, -0.41, -0.49]) g.add(shell(mesh(rbox(d, 0.012, 0.21, 0.2, 0.004), M.castAl(), x, -0.01, 0)))
  // 尾段
  g.add(shell(mesh(new THREE.CylinderGeometry(0.06, 0.085, 0.08, n).rotateZ(Math.PI / 2), M.castAl(), -0.64, 0, 0)))
  // 排檔桿座、加油/洩油螺絲、支撐腳
  g.add(mesh(rbox(d, 0.06, 0.03, 0.05, 0.006), M.castAl(), -0.42, 0.105, 0))
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 6).rotateX(Math.PI / 2), M.steel(), -0.35, 0.02, 0.1))
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 6).rotateX(Math.PI / 2), M.steel(), -0.35, -0.09, 0.1))
  g.add(mesh(rbox(d, 0.08, 0.03, 0.12, 0.006), M.castAl(), -0.55, -0.12, 0))
  g.add(mesh(rbox(d, 0.05, 0.03, 0.05, 0.006), M.rubber(), -0.55, -0.14, 0))
  return g
})

registerProcedural('csc_v1', (d) => {
  const g = new THREE.Group()
  g.add(mesh(cylX(d, 0.045, 0.04), M.castAl(), -0.02, 0, 0))                        // 分泵本體
  const bearing = grp('bearing', mesh(ringX(d, 0.042, 0.02, 0.02), M.steel(), 0.015, 0, 0), mesh(ringX(d, 0.034, 0.026, 0.024), M.darkSteel(), 0.016, 0, 0))
  g.add(bearing)
  g.add(mesh(tube(d, [[-0.03, 0.04, 0.02], [-0.03, 0.09, 0.05], [-0.02, 0.14, 0.1]], 0.004), M.steel()))   // 油管
  return g
})

registerProcedural('input_shaft_v1', (d) => {
  const spin = grp('spin')
  spin.add(mesh(cylX(d, 0.012, 0.3), M.steel(), -0.1, 0, 0))
  spin.add(mesh(cylX(d, 0.011, 0.06), M.darkSteel(), 0.03, 0, 0))                    // 花鍵段
  spin.add(mesh(sprocket(d, 0.03, 18, 0.018), M.steel(), -0.2, 0, 0))                // 常嚙合齒輪
  return grp('', spin)
})

registerProcedural('tail_housing_v1', (d) => grp('',
  shell(mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.09, segs(d, 32, 16, 8)).rotateZ(Math.PI / 2), M.castAl())),
  mesh(ringX(d, 0.09, 0.05, 0.01), M.castAl(), 0.045, 0, 0),
))

registerProcedural('output_flange_v1', (d) => {
  const spin = grp('spin', mesh(cylX(d, 0.045, 0.014), M.steel()), mesh(cylX(d, 0.02, 0.03), M.steel(), 0.015, 0, 0))
  for (let i = 0; i < 4; i++) spin.add(mesh(cylX(d, 0.005, 0.01), M.darkSteel(), -0.01, Math.cos(i * Math.PI / 2) * 0.03, Math.sin(i * Math.PI / 2) * 0.03))
  return grp('', spin)
})

registerProcedural('shift_lever_v1', (d) => grp('',
  mesh(rbox(d, 0.05, 0.02, 0.04, 0.005), M.castAl()),
  mesh(cylY(d, 0.006, 0.2), M.steel(), 0, 0.11, 0),
  mesh(new THREE.SphereGeometry(0.02, segs(d, 16, 10, 6), segs(d, 10, 6, 4)), M.glossPlastic(), 0, 0.22, 0),
  mesh(rbox(d, 0.06, 0.01, 0.015, 0.003), M.steel(), -0.03, 0.01, 0),
))

registerProcedural('shift_forks_v1', (d) => {
  const g = new THREE.Group()
  for (const [i, x] of [-0.2, -0.33, -0.46].entries()) {
    g.add(mesh(cylX(d, 0.005, 0.36), M.steel(), -0.33 - (-0.33), 0.03 + i * 0.012, 0.03 - i * 0.02))
    // 叉：半圓弧
    const fork = new THREE.TorusGeometry(0.045, 0.004, 6, segs(d, 20, 12, 8), Math.PI).rotateY(Math.PI / 2).rotateX(Math.PI)
    g.add(mesh(fork, M.darkSteel(), x + 0.33, -0.06, 0))
    g.add(mesh(rbox(d, 0.008, 0.07, 0.01, 0.002), M.darkSteel(), x + 0.33, -0.015 + i * 0.006, 0.03 - i * 0.02))
  }
  return g
})

/** 同步器：中間輪轂 + 可滑動套筒 + 兩側同步環 + 兩側齒輪（齒輪空套，動畫時各自轉） */
registerProcedural('synchro_v1', (d) => {
  const g = new THREE.Group()
  const hub = grp('spin', mesh(sprocket(d, 0.03, 24, 0.024), M.steel()))
  const sleeve = grp('sleeve', mesh(ringX(d, 0.04, 0.03, 0.022), M.darkSteel()))
  hub.add(sleeve)
  g.add(hub)
  for (const [name, s] of [['l', 1], ['r', -1]] as const) {
    const ring = mesh(new THREE.CylinderGeometry(0.028, 0.036, 0.008, segs(d, 32, 16, 8)).rotateZ(s * Math.PI / 2), M.copper(), s * 0.018, 0, 0)
    ring.name = `ring_${name}`
    g.add(ring)
    const gear = grp(`gear_${name}`, mesp(d, 0.048 + (name === 'l' ? 0.006 : -0.006), 30, 0.02), mesh(sprocket(d, 0.03, 20, 0.006), M.darkSteel(), s * -0.013, 0, 0))
    gear.position.x = s * 0.038
    g.add(gear)
  }
  return g
})
const mesp = (d: Detail, r: number, teeth: number, thick: number) => mesh(sprocket(d, r, teeth, thick), M.steel())

/** 輸出軸 + 六個檔位齒輪（空套） */
const MAIN_GEARS: Array<[number, number]> = [[-0.17, 0.062], [-0.23, 0.052], [-0.3, 0.045], [-0.36, 0.04], [-0.43, 0.036], [-0.49, 0.03]]  // 1..6：[x, r]
registerProcedural('mainshaft_v1', (d) => {
  const spin = grp('spin', mesh(cylX(d, 0.014, 0.5), M.steel(), -0.33 - (-0.33) - 0.12, 0, 0))
  const g = grp('', spin)
  MAIN_GEARS.forEach(([x, r], i) => {
    const gear = grp(`gear_${i + 1}`, mesp(d, r, Math.round(r * 500), 0.018))
    gear.position.x = x + 0.33
    g.add(gear)
  })
  // 倒檔惰輪
  g.add(grp('gear_R', mesp(d, 0.025, 12, 0.012)).translateX(-0.53 + 0.33).translateY(-0.04).translateZ(0.05))
  return g
})

registerProcedural('countershaft_v1', (d) => {
  const spin = grp('spin', mesh(cylX(d, 0.014, 0.5), M.steel(), -0.12, 0, 0))
  spin.add(mesh(sprocket(d, 0.045, 28, 0.018), M.steel(), 0.13, 0, 0))   // 和輸入軸常嚙合的齒輪
  MAIN_GEARS.forEach(([x, r], i) => {
    const gear = mesp(d, 0.09 - r, Math.round((0.09 - r) * 500), 0.018)
    gear.name = `gear_${i + 1}`
    gear.position.x = x + 0.33
    spin.add(gear)
  })
  return grp('', spin)
})

/** 壓板：外殼 + 膜片彈簧指 + 壓環 */
registerProcedural('pressure_plate_v1', (d) => {
  const spin = grp('spin')
  const cover = M.steel(); cover.side = THREE.DoubleSide
  spin.add(mesh(new THREE.CylinderGeometry(0.115, 0.125, 0.03, segs(d, 40, 20, 10), 1, true).rotateZ(Math.PI / 2), cover, -0.012, 0, 0))
  spin.add(mesh(ringX(d, 0.125, 0.105, 0.004), M.steel(), 0.003, 0, 0))
  const ring = grp('ring', mesh(ringX(d, 0.11, 0.065, 0.012), M.castIron()))
  ring.position.x = 0.006
  spin.add(ring)
  const fingers = grp('fingers')
  const nF = d === 'low' ? 9 : 18
  for (let i = 0; i < nF; i++) {
    const a = (i / nF) * Math.PI * 2
    const f = mesh(rbox(d, 0.003, 0.075, 0.008, 0.001), M.steel(), -0.02, 0, 0)
    f.geometry.translate(0, 0.0475, 0)   // 根部在內圈，往外延伸
    f.rotation.x = a
    f.rotation.z = 0.25                   // 預設略往引擎側凸
    f.name = 'finger'                     // 有名字 = 合併網格時保留成獨立物件（動畫要一根根轉）
    fingers.add(f)
  }
  spin.add(fingers)
  for (let i = 0; i < 6; i++) spin.add(mesh(cylX(d, 0.005, 0.006), M.darkSteel(), 0.004, Math.cos(i * Math.PI / 3) * 0.12, Math.sin(i * Math.PI / 3) * 0.12))
  return grp('', spin)
})

registerProcedural('clutch_disc_v1', (d) => {
  const spin = grp('spin')
  spin.add(mesh(ringX(d, 0.115, 0.07, 0.008), mat(0x4a3a2c, { metalness: 0.1, roughness: 0.95 })))     // 摩擦面
  spin.add(mesh(ringX(d, 0.075, 0.03, 0.006), M.darkSteel()))
  spin.add(mesh(cylX(d, 0.024, 0.03), M.darkSteel()))                                                     // 花鍵轂
  for (let i = 0; i < 6; i++) {   // 扭轉減震彈簧
    const a = (i / 6) * Math.PI * 2
    spin.add(mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.028, segs(d, 12, 8, 6)).rotateZ(Math.PI / 2).rotateX(a), M.steel(), 0, Math.cos(a) * 0.05, Math.sin(a) * 0.05, a, 0, 0))
  }
  return grp('', spin)
})

registerProcedural('dmf_v1', (d) => {
  const spin = grp('spin')
  spin.add(mesh(cylX(d, 0.12, 0.016), M.castIron(), 0.012, 0, 0))                          // 主質量（引擎側）
  spin.add(mesh(sprocket(d, 0.135, 60, 0.01), M.steel(), 0.012, 0, 0))                     // 起動齒圈
  spin.add(mesh(cylX(d, 0.118, 0.012), M.castIron(), -0.008, 0, 0))                        // 次質量（離合器面）
  spin.add(mesh(cylX(d, 0.012, 0.008), M.steel(), -0.016, 0, 0))                           // 導軸承
  for (let i = 0; i < 2; i++) {   // 弧形彈簧示意
    const arc = new THREE.TorusGeometry(0.085, 0.009, segs(d, 8, 6, 4), segs(d, 24, 12, 8), Math.PI * 0.8).rotateY(Math.PI / 2)
    spin.add(mesh(arc, M.steel(), 0.002, 0, 0, i * Math.PI + 0.3, 0, 0))
  }
  for (let i = 0; i < 8; i++) spin.add(mesh(cylX(d, 0.006, 0.006), M.darkSteel(), 0.023, Math.cos(i * Math.PI / 4) * 0.04, Math.sin(i * Math.PI / 4) * 0.04))
  return grp('', spin)
})

registerProcedural('clutch_master_v1', (d) => grp('',
  mesh(cylX(d, 0.016, 0.1), M.castAl()),
  mesh(cylY(d, 0.02, 0.04), M.glossPlastic(), -0.03, 0.04, 0),
  mesh(rbox(d, 0.01, 0.22, 0.03, 0.004), M.darkSteel(), 0.06, -0.1, 0, 0, 0, -0.3),
  mesh(rbox(d, 0.06, 0.012, 0.05, 0.004), M.rubber(), 0.1, -0.2, 0),
))

// ───────────────────────── 自排 ─────────────────────────
registerProcedural('gearbox_auto_v1', (d) => {
  const g = new THREE.Group()
  const n = segs(d, 40, 20, 10)
  g.add(shell(mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.17, n, 1, true).rotateZ(Math.PI / 2), M.castAl(), -0.085, 0, 0)))
  const front = M.castAl(); front.side = THREE.DoubleSide
  g.add(shell(mesh(ringX(d, 0.183, 0.1, 0.012), front, -0.002, 0, 0)))
  g.add(shell(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.44, n).rotateZ(Math.PI / 2), M.castAl(), -0.39, 0, 0)))
  for (const x of [-0.25, -0.33, -0.41, -0.49, -0.57]) g.add(shell(mesh(ringX(d, 0.125, 0.1, 0.01), M.castAl(), x, 0, 0)))
  g.add(shell(mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.07, n).rotateZ(Math.PI / 2), M.castAl(), -0.645, 0, 0)))
  // 油底殼安裝面、ATF 接頭、電氣接頭
  g.add(mesh(rbox(d, 0.3, 0.02, 0.2, 0.006), M.castAl(), -0.38, -0.1, 0))
  g.add(mesh(rbox(d, 0.05, 0.03, 0.04, 0.005), M.blackPlastic(), -0.3, 0.0, -0.12))
  g.add(mesh(tube(d, [[-0.2, -0.05, 0.11], [-0.1, -0.03, 0.15], [0.05, 0.02, 0.17]], 0.006), M.steel()))   // 油冷管
  g.add(mesh(rbox(d, 0.08, 0.03, 0.12, 0.006), M.castAl(), -0.56, -0.12, 0))
  g.add(mesh(rbox(d, 0.05, 0.03, 0.05, 0.006), M.rubber(), -0.56, -0.14, 0))
  return g
})

registerProcedural('torque_converter_v1', (d) => {
  const g = new THREE.Group()
  const n = segs(d, 40, 20, 10)
  const housing = M.steel(); housing.side = THREE.DoubleSide
  // 泵輪（和外殼一體，引擎側）：半個甜甜圈
  const pump = grp('pump', mesh(new THREE.TorusGeometry(0.075, 0.05, segs(d, 14, 8, 5), n, Math.PI).rotateY(-Math.PI / 2).rotateX(Math.PI / 2), housing, 0.0, 0, 0))
  pump.add(mesh(cylX(d, 0.125, 0.008), M.steel(), 0.045, 0, 0))
  for (let i = 0; i < 4; i++) pump.add(mesh(cylX(d, 0.006, 0.012), M.darkSteel(), 0.052, Math.cos(i * Math.PI / 2) * 0.11, Math.sin(i * Math.PI / 2) * 0.11))
  g.add(pump)
  // 渦輪（變速箱側）：另外半個，葉片
  const turbine = grp('turbine')
  const tm = mat(0x9ea3aa, { metalness: 1, roughness: 0.35 }); tm.side = THREE.DoubleSide
  turbine.add(mesh(new THREE.TorusGeometry(0.075, 0.046, segs(d, 14, 8, 5), n, Math.PI).rotateY(Math.PI / 2).rotateX(Math.PI / 2), tm, 0, 0, 0))
  const nb = d === 'low' ? 8 : 16
  for (let i = 0; i < nb; i++) {
    const b = mesh(rbox(d, 0.012, 0.04, 0.004, 0.001), M.steel(), -0.02, 0, 0)
    b.geometry.translate(0, 0.075, 0); b.rotation.x = (i / nb) * Math.PI * 2; b.rotation.y = 0.5
    turbine.add(b)
  }
  turbine.add(mesh(cylX(d, 0.03, 0.05), M.darkSteel(), -0.04, 0, 0))   // 渦輪轂（花鍵接輸入軸）
  g.add(turbine)
  // 導輪（中間小葉輪）
  const stator = grp('stator', mesh(cylX(d, 0.04, 0.02), M.copper()))
  for (let i = 0; i < 10; i++) { const b = mesh(rbox(d, 0.016, 0.02, 0.003, 0.001), M.copper()); b.geometry.translate(0, 0.045, 0); b.rotation.x = (i / 10) * Math.PI * 2; b.rotation.y = -0.6; stator.add(b) }
  g.add(stator)
  // 鎖定離合器：渦輪側的一片環，往泵輪殼貼上去
  const lockup = grp('lockup', mesh(ringX(d, 0.11, 0.07, 0.006), mat(0x5a4632, { metalness: 0.2, roughness: 0.9 })))
  lockup.position.x = 0.02
  g.add(lockup)
  return g
})

registerProcedural('atf_pump_v1', (d) => grp('',
  mesh(cylX(d, 0.07, 0.03), M.castAl()),
  mesh(sprocket(d, 0.03, 12, 0.012), M.steel(), 0.0, 0, 0),
  mesh(sprocket(d, 0.045, 18, 0.01), M.steel(), 0.018, 0, 0),
))

registerProcedural('atf_pan_v1', (d) => {
  const g = grp('', mesh(rbox(d, 0.3, 0.045, 0.2, 0.012), M.blackPlastic()))
  g.add(mesh(rbox(d, 0.31, 0.006, 0.21, 0.003), M.blackPlastic(), 0, 0.024, 0))
  for (const x of [-0.12, -0.04, 0.04, 0.12]) for (const z of [-0.085, 0.085]) g.add(mesh(cylY(d, 0.005, 0.008), M.machinedAl(), x, 0.03, z))
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 6), M.steel(), 0.08, -0.025, 0.05))   // 油位 / 洩油螺絲
  g.add(mesh(rbox(d, 0.12, 0.02, 0.1, 0.008), M.filter(), 0, 0.03, 0))                          // 內建濾網（示意）
  return g
})

registerProcedural('mechatronic_v1', (d) => {
  const g = grp('', mesh(rbox(d, 0.26, 0.035, 0.17, 0.006), M.machinedAl()))
  for (const [x, z] of [[-0.09, -0.05], [-0.03, -0.05], [0.03, -0.05], [0.09, -0.05], [-0.06, 0.05], [0.0, 0.05], [0.06, 0.05]]) g.add(mesh(cylZ(d, 0.011, 0.04), M.darkSteel(), x, 0, z))
  g.add(mesh(rbox(d, 0.12, 0.012, 0.08, 0.004), M.blackPlastic(), 0, 0.023, 0))                   // 電腦
  g.add(mesh(cylZ(d, 0.014, 0.04), M.blackPlastic(), 0.12, 0, -0.09))                            // 接頭套筒
  return g
})

/** 離合器與煞車組 A–E：沿軸線五疊，A、B 貼殼（煞車），C、D、E 在轉動件上 */
registerProcedural('clutch_packs_v1', (d) => {
  const g = new THREE.Group()
  const spec: Array<[string, number, number, number]> = [['A', 0.06, 0.095, 0.075], ['B', 0.0, 0.095, 0.075], ['C', -0.06, 0.07, 0.045], ['D', -0.12, 0.08, 0.055], ['E', -0.18, 0.065, 0.04]]
  for (const [name, x, ro, ri] of spec) {
    const p = plateStack(d, ro, ri, d === 'low' ? 4 : 7, 0.006, `pack_${name}`)
    p.position.x = x
    g.add(p)
    const piston = mesh(ringX(d, ro, ri, 0.008), M.machinedAl(), x + 0.03, 0, 0)
    piston.name = `piston_${name}`
    g.add(piston)
  }
  g.add(mesh(cylX(d, 0.02, 0.3), M.steel(), -0.06, 0, 0))
  return g
})

/** 四組行星齒輪：太陽 + 三顆行星 + 外圈 */
registerProcedural('planetary_v1', (d) => {
  const g = new THREE.Group()
  for (let s = 0; s < 4; s++) {
    const set = grp(`set_${s + 1}`)
    const sun = grp('sun', mesp(d, 0.022, 12, 0.024))
    set.add(sun)
    const carrier = grp('carrier')
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      const planet = grp('planet', mesp(d, 0.016, 9, 0.024))
      planet.position.set(0, Math.cos(a) * 0.04, Math.sin(a) * 0.04)
      carrier.add(planet)
      carrier.add(mesh(cylX(d, 0.004, 0.036), M.darkSteel(), 0, Math.cos(a) * 0.04, Math.sin(a) * 0.04))
    }
    carrier.add(mesh(ringX(d, 0.05, 0.03, 0.004), M.darkSteel(), 0.016, 0, 0))
    set.add(carrier)
    const ring = grp('ring', mesh(ringX(d, 0.068, 0.056, 0.024), M.steel()))
    set.add(ring)
    set.position.x = 0.09 - s * 0.06
    g.add(set)
  }
  g.add(mesh(cylX(d, 0.012, 0.3), M.steel(), -0.03, 0, 0))
  return g
})

registerProcedural('flexplate_v1', (d) => {
  const spin = grp('spin', mesh(cylX(d, 0.12, 0.004), M.steel()), mesh(sprocket(d, 0.135, 60, 0.008), M.steel()))
  spin.add(mesh(cylX(d, 0.04, 0.012), M.steel(), 0.004, 0, 0))
  for (let i = 0; i < 8; i++) spin.add(mesh(cylX(d, 0.006, 0.006), M.darkSteel(), -0.005, Math.cos(i * Math.PI / 4) * 0.04, Math.sin(i * Math.PI / 4) * 0.04))
  for (let i = 0; i < 4; i++) spin.add(mesh(cylX(d, 0.006, 0.008), M.darkSteel(), -0.005, Math.cos(i * Math.PI / 2 + 0.4) * 0.11, Math.sin(i * Math.PI / 2 + 0.4) * 0.11))
  for (let i = 0; i < 6; i++) { const h = mesh(cylX(d, 0.012, 0.01), M.dark(), 0, Math.cos(i * Math.PI / 3) * 0.08, Math.sin(i * Math.PI / 3) * 0.08); spin.add(h) }
  return grp('', spin)
})
