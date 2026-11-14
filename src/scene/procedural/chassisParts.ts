/**
 * P4：傳動、排氣、底盤懸吊、煞車、轉向、電系、車身蓋板的程式化產生器。
 * 座標慣例同 engineParts：+X 車頭、+Y 上、+Z 副駕側。每個產生器的原點 = 資料裡 position 指的那一點。
 * 桿件類（控制臂、連桿）一律沿 +X 畫，長度固定，實際方向用資料的 rotation 轉。
 */
import * as THREE from 'three'
import { registerProcedural, segs, mat, M, mesh, rbox, cylX, cylY, cylZ, tube, at, type Detail } from './registry'

const grp = (name = '', ...objs: THREE.Object3D[]) => { const g = new THREE.Group(); g.name = name; if (objs.length) g.add(...objs); return g }
const shell = <T extends THREE.Object3D>(o: T): T => { o.userData.shell = true; return o }
/** 沿 X 的桿子，兩端有襯套眼 */
const rod = (d: Detail, len: number, r: number, eye = r * 2.2, m: THREE.Material = M.forged()) => {
  const g = grp()
  g.add(mesh(cylX(d, r, len - eye), m))
  for (const s of [-1, 1]) g.add(mesh(cylZ(d, eye, eye * 1.1), m, s * (len / 2 - eye * 0.6), 0, 0), mesh(cylZ(d, eye * 0.45, eye * 1.5), M.rubber(), s * (len / 2 - eye * 0.6), 0, 0))
  return g
}
/** 螺旋彈簧（沿 Y） */
const spring = (d: Detail, r: number, h: number, turns: number, wire: number) => {
  const pts: [number, number, number][] = []
  const n = segs(d, 160, 80, 32)
  for (let i = 0; i <= n; i++) { const t = i / n; const a = t * turns * Math.PI * 2; pts.push([Math.cos(a) * r, -h / 2 + t * h, Math.sin(a) * r]) }
  return new THREE.Mesh(tube(d, pts, wire), M.darkSteel())
}

// ───────────────────────── 輪胎與輪圈 ─────────────────────────
/** E5：輪圈、碟盤這種「一眼就看得出是圓的」東西，low 也至少 16 邊（以前是 8 邊，看起來像壞掉）；mid / high 照舊 */
const roundZ = (d: Detail, r: number, len: number) => {
  if (d !== 'low') return cylZ(d, r, len)
  const g = new THREE.CylinderGeometry(r, r, len, 16)
  g.rotateX(Math.PI / 2)
  return g
}
registerProcedural('wheel_v1', (d) => {
  const g = grp('spin')
  const tyre = new THREE.TorusGeometry(0.275, 0.07, segs(d, 16, 10, 8), segs(d, 48, 24, 20))
  g.add(mesh(tyre, M.rubber()))
  g.add(mesh(roundZ(d, 0.22, 0.2), mat(0x9ea3aa, { metalness: 0.9, roughness: 0.25 })))
  const spokeGeo = new THREE.BoxGeometry(0.035, 0.2, 0.02)
  for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(spokeGeo, mat(0x9ea3aa, { metalness: 0.9, roughness: 0.3 })); sp.rotation.z = (i / 5) * Math.PI * 2; sp.position.z = 0.1; g.add(sp) }
  g.add(mesh(cylZ(d, 0.05, 0.03), M.darkSteel(), 0, 0, 0.11))
  for (let i = 0; i < 5; i++) g.add(mesh(cylZ(d, 0.008, 0.012), M.darkSteel(), Math.cos(i * Math.PI * 2 / 5 + 0.3) * 0.055, Math.sin(i * Math.PI * 2 / 5 + 0.3) * 0.055, 0.115))
  return grp('', g)
})

/**
 * 外觀重做：wheel_v2。輪胎用「斷面旋轉」（lathe）做，所以有胎壁鼓起、胎肩圓角、胎面溝槽；
 * 輪圈是 18 吋五組雙輻（ZL 實車是原廠 18 吋黑色雙輻），輻條之間是空的，看得到後面的碟盤和卡鉗。
 *
 *   輪胎斷面（右半，Z = 寬度方向，R = 半徑）          正面（+Z 朝車外）
 *        胎面 ┌──╥──╥──╥──┐  R 0.330               ╭─────────╮
 *        胎肩 ╭╯         ╰╮                          │ ╲╲  ╱╱  │  ← 5 組雙輻
 *        胎壁 │  鼓起      │  最寬 ≈ 0.23 m           │──  ◉  ──│  ← 中心蓋 + 5 顆螺絲
 *        胎唇 ╰╮         ╭╯  R 0.229（18 吋）        │ ╱╱  ╲╲  │
 *             └─ 輪圈 ──┘                            ╰─────────╯
 *
 * 尺寸：225/45 R18（米其林泰國 F30 320i 適用胎表，michelin_f30_320i_sizes）→ 外徑 2×(0.45×225)+18×25.4 = 659.7 mm。
 * 輪圈寬度、ET、ZL 實車前後是否不同寬（255/40 R18）都還沒查到：寬度用 8 吋示意（標在 shape）。
 * 輪心高 0.345 是照片量的，比自由半徑 0.330 高 1.5 cm：輪子在零件內下移 1.5 cm 貼地，不動其他底盤零件。
 */
const TYRE = { r: 0.33, bead: 0.2286, w: 0.225, rimW: 0.203, axleY: 0.345 } as const
function lathe(d: Detail, pts: [number, number][], n: number) {
  const g = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), n)
  g.rotateX(Math.PI / 2)        // lathe 的軸是 Y，轉成 Z（輪軸）
  void d
  return g
}
/** 輪胎斷面（r, z），z 由內側（−）到外側（+） */
function tyreProfile(grooves: boolean): [number, number][] {
  const { r, bead, w } = TYRE, hw = w / 2, rimHalf = TYRE.rimW / 2 + 0.012
  const side = (s: 1 | -1): [number, number][] => [
    [bead, s * rimHalf], [bead + 0.012, s * (rimHalf + 0.004)], [0.255, s * (hw + 0.004)], [0.28, s * (hw + 0.006)],
    [0.30, s * (hw + 0.002)], [0.314, s * (hw - 0.008)], [0.323, s * (hw - 0.022)], [r, s * (hw - 0.038)],
  ]
  const tread: [number, number][] = []
  const zs = [-(hw - 0.038), -0.07, -0.062, -0.026, -0.018, 0.018, 0.026, 0.062, 0.07, hw - 0.038]
  if (grooves) {
    // 四條縱向溝：溝底比胎面低 7 mm
    tread.push([r, zs[0]], [r, zs[1]], [r - 0.007, zs[1] + 0.001], [r - 0.007, zs[2] - 0.001], [r, zs[2]], [r, zs[3]], [r - 0.007, zs[3] + 0.001], [r - 0.007, zs[4] - 0.001], [r, zs[4]],
      [r, zs[5]], [r - 0.007, zs[5] + 0.001], [r - 0.007, zs[6] - 0.001], [r, zs[6]], [r, zs[7]], [r - 0.007, zs[7] + 0.001], [r - 0.007, zs[8] - 0.001], [r, zs[8]], [r, zs[9]])
  } else tread.push([r, zs[0]], [r, zs[9]])
  // lathe 的點要沿斷面走一圈：內側胎唇 → 胎面 → 外側胎唇（再回到內側時不用封，輪圈會擋住）
  return [...side(-1), ...tread.slice(1, -1), ...side(1).reverse()]
}
/** 胎面橫向花紋 + 胎底壓平：直接改 lathe 的頂點（只有 high / mid） */
function treadBlocks(g: THREE.BufferGeometry, n: number, every: number) {
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const rr = Math.hypot(v.x, v.y)
    let a = Math.atan2(v.y, v.x); if (a < 0) a += Math.PI * 2
    const seg = Math.round(a / (Math.PI * 2) * n)
    let nr = rr
    // 胎肩那兩排花紋塊之間的橫溝（中間兩排不切，像常見的運動胎）
    if (every > 0 && rr > TYRE.r - 0.0005 && Math.abs(v.z) > 0.066 && seg % every === 0) nr -= 0.006
    if (nr !== rr) { v.x *= nr / rr; v.y *= nr / rr }
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  pos.needsUpdate = true
  g.computeVertexNormals()
  return g
}
/** 一根輻條：從輪轂（半徑 r0、角度 a0、深 z0）到輪圈（r1、a1、z1）的梯形長條，寬 w0→w1、厚 t */
function spokeGeo(r0: number, a0: number, z0: number, r1: number, a1: number, z1: number, w0: number, w1: number, t: number) {
  const P0 = new THREE.Vector2(Math.cos(a0) * r0, Math.sin(a0) * r0), P1 = new THREE.Vector2(Math.cos(a1) * r1, Math.sin(a1) * r1)
  const dir = P1.clone().sub(P0).normalize(), nrm = new THREE.Vector2(-dir.y, dir.x)
  const c = (P: THREE.Vector2, w: number, s: number, z: number) => [P.x + nrm.x * w / 2 * s, P.y + nrm.y * w / 2 * s, z]
  const p = [
    c(P0, w0, -1, z0), c(P1, w1, -1, z1), c(P1, w1, 1, z1), c(P0, w0, 1, z0),
    c(P0, w0, -1, z0 - t), c(P1, w1, -1, z1 - t), c(P1, w1, 1, z1 - t), c(P0, w0, 1, z0 - t),
  ]
  const quads = [[0, 1, 2, 3], [7, 6, 5, 4], [4, 5, 1, 0], [3, 2, 6, 7]]
  const arr: number[] = []
  for (const [a, b, cc, e] of quads) for (const k of [a, b, cc, a, cc, e]) arr.push(...p[k])
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
  g.computeVertexNormals()
  return g
}
registerProcedural('wheel_v2', (d) => {
  const g = grp('spin')
  const n = segs(d, 120, 48, 28)
  // 輪胎
  const tyre = lathe(d, tyreProfile(d !== 'low'), n)
  if (d !== 'low') treadBlocks(tyre, n, d === 'high' ? 2 : 4)
  const rubber = mat(0x17181a, { metalness: 0, roughness: 0.88 })
  g.add(mesh(tyre, rubber))

  // 輪圈：桶身（lathe）+ 外緣唇 + 5 組雙輻 + 輪轂盤 + 中心蓋 + 螺絲
  const rimMat = mat(0x24272b, { metalness: 0.7, roughness: 0.3 })   // 亮黑（ZL 實車）
  const lipMat = mat(0x2a2d31, { metalness: 0.85, roughness: 0.22 })
  const hz = TYRE.rimW / 2
  const barrel: [number, number][] = [
    [0.236, -hz - 0.006], [0.236, -hz + 0.004], [0.222, -hz + 0.012], [0.205, -hz + 0.03], [0.205, hz - 0.03],
    [0.222, hz - 0.012], [0.229, hz], [0.239, hz + 0.006], [0.241, hz + 0.012],
  ]
  g.add(mesh(lathe(d, barrel, n), rimMat))
  const lip = lathe(d, [[0.241, hz + 0.012], [0.236, hz + 0.016], [0.222, hz + 0.013], [0.212, hz + 0.004]], n)
  g.add(mesh(lip, lipMat))
  // 雙輻：每組兩根在輪轂處靠近、到輪圈分開成 V；輪轂比外緣深（凹面）
  const zHub = hz - 0.045, zRim = hz + 0.004, t = d === 'low' ? 0.02 : 0.03
  for (let i = 0; i < 5; i++) {
    const ac = Math.PI / 2 + (i / 5) * Math.PI * 2
    for (const s of [-1, 1]) g.add(mesh(spokeGeo(0.066, ac + s * 0.2, zHub, 0.214, ac + s * 0.15, zRim, 0.034, 0.032, t), rimMat))
  }
  // 輪轂盤、螺絲、中心蓋
  g.add(mesh(cylZ(d, 0.078, 0.03), rimMat, 0, 0, zHub - 0.01))
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + Math.PI / 5 + Math.PI / 2
    g.add(mesh(cylZ(d, 0.0085, 0.012), M.darkSteel(), Math.cos(a) * 0.06, Math.sin(a) * 0.06, zHub + 0.009))
  }
  g.add(mesh(cylZ(d, 0.03, 0.01), mat(0x0f1012, { metalness: 0.3, roughness: 0.4 }), 0, 0, zHub + 0.008))
  if (d !== 'low') g.add(mesh(cylZ(d, 0.02, 0.003), mat(0xd6d9dd, { metalness: 1, roughness: 0.2 }), 0, 0, zHub + 0.014))
  // 輪圈內側（桶身內面）暗一點，從輻條縫看進去才有深度
  const inner = lathe(d, [[0.2, hz - 0.03], [0.2, -hz + 0.03]], n)
  g.add(mesh(inner, mat(0x0c0d0e, { metalness: 0.4, roughness: 0.6, side: THREE.BackSide })))
  // 輪心高（照片量的 0.345）比 225/45 R18 自由半徑 0.330 高 1.5 cm：整個輪子在零件裡下移 1.5 cm 貼地
  return grp('', at(g, 0, TYRE.r - TYRE.axleY, 0))
})

// ───────────────────────── 前懸吊 ─────────────────────────
/** 麥花臣支柱：阻尼筒 + 彈簧 + 上座，原點在下端（夾進轉向節的地方） */
registerProcedural('front_strut_v1', (d) => {
  const g = grp()
  g.add(mesh(cylY(d, 0.028, 0.34), M.darkSteel(), 0, 0.17, 0))          // 阻尼筒
  g.add(mesh(cylY(d, 0.011, 0.2), M.machinedAl(), 0, 0.44, 0))           // 活塞桿
  g.add(mesh(cylY(d, 0.085, 0.012), M.darkSteel(), 0, 0.3, 0))           // 下彈簧座
  const sp = spring(d, 0.075, 0.26, 5, 0.012); sp.position.y = 0.43; g.add(sp)
  g.add(mesh(cylY(d, 0.09, 0.02), M.rubber(), 0, 0.57, 0))               // 上座
  g.add(mesh(rbox(d, 0.06, 0.1, 0.05, 0.01), M.darkSteel(), 0, 0.03, 0)) // 夾持腳
  return g
})
/** 轉向節 / 羽臂：含輪轂與軸承 */
registerProcedural('knuckle_front_v1', (d) => {
  const g = grp()
  g.add(mesh(rbox(d, 0.07, 0.2, 0.06, 0.015), M.castIron()))
  g.add(mesh(cylZ(d, 0.07, 0.06), M.castIron(), 0, 0, -0.04))           // 軸承座（向車內）
  g.add(mesh(cylZ(d, 0.06, 0.05), M.machinedAl(), 0, 0, 0.045))          // 輪轂法蘭（向車外）
  for (let i = 0; i < 5; i++) g.add(mesh(cylZ(d, 0.006, 0.03), M.darkSteel(), Math.cos(i * Math.PI * 2 / 5) * 0.04, Math.sin(i * Math.PI * 2 / 5) * 0.04, 0.075))
  g.add(mesh(rbox(d, 0.05, 0.03, 0.12, 0.01), M.castIron(), -0.03, -0.08, -0.03)) // 下球接頭座
  g.add(mesh(rbox(d, 0.12, 0.025, 0.04, 0.008), M.castIron(), 0.06, 0.03, -0.03))  // 轉向臂
  return g
})
registerProcedural('control_arm_v1', (d) => {
  // 下控制臂（F30 雙關節：後臂彎的）；從球接頭（原點）往車內後方
  const g = rod(d, 0.42, 0.014, 0.03, mat(0x8f9399, { metalness: 0.8, roughness: 0.5 }))
  g.add(mesh(rbox(d, 0.12, 0.02, 0.05, 0.006), M.forged(), 0.05, 0, 0.02))
  return g
})
registerProcedural('tension_strut_v1', (d) => rod(d, 0.42, 0.013, 0.028, M.forged()))
registerProcedural('sway_bar_v1', (d) => {
  const g = grp()
  g.add(new THREE.Mesh(tube(d, [[0.1, 0, -0.6], [0, 0, -0.5], [0, 0, 0.5], [0.1, 0, 0.6]], 0.012), M.darkSteel()))
  for (const z of [-0.6, 0.6]) g.add(mesh(cylY(d, 0.006, 0.16), M.steel(), 0.1, 0.08, z))  // 連桿（end link）
  for (const z of [-0.3, 0.3]) g.add(mesh(rbox(d, 0.05, 0.035, 0.04, 0.008), M.rubber(), 0, 0, z))  // 襯套座
  return g
})
registerProcedural('subframe_front_v1', (d) => {
  const g = grp()
  for (const z of [-0.42, 0.42]) g.add(mesh(rbox(d, 0.85, 0.07, 0.07, 0.015), M.darkSteel(), 0, 0, z))
  for (const x of [-0.35, 0.3]) g.add(mesh(rbox(d, 0.07, 0.07, 0.9, 0.015), M.darkSteel(), x, 0, 0))
  for (const x of [-0.4, 0.4]) for (const z of [-0.42, 0.42]) g.add(mesh(cylY(d, 0.02, 0.1), M.darkSteel(), x, 0.05, z))  // 固定螺栓塔
  return g
})
registerProcedural('engine_mount_v1', (d) => grp('',
  mesh(rbox(d, 0.1, 0.06, 0.1, 0.012), M.castAl(), 0, 0.03, 0),
  mesh(cylY(d, 0.045, 0.05), M.rubber(), 0, 0.08, 0),
  mesh(rbox(d, 0.12, 0.012, 0.08, 0.004), M.darkSteel(), 0, 0.11, 0),
))

// ───────────────────────── 後懸吊（五連桿） ─────────────────────────
registerProcedural('knuckle_rear_v1', (d) => {
  const g = grp()
  g.add(mesh(rbox(d, 0.08, 0.26, 0.05, 0.015), M.castAl()))
  g.add(mesh(cylZ(d, 0.065, 0.06), M.castAl(), 0, 0, -0.04))
  g.add(mesh(cylZ(d, 0.06, 0.05), M.machinedAl(), 0, 0, 0.045))
  for (let i = 0; i < 5; i++) g.add(mesh(cylZ(d, 0.006, 0.03), M.darkSteel(), Math.cos(i * Math.PI * 2 / 5) * 0.04, Math.sin(i * Math.PI * 2 / 5) * 0.04, 0.075))
  g.add(mesh(cylZ(d, 0.02, 0.06), M.darkSteel(), 0, 0, -0.08))         // 半軸穿過的花鍵孔
  return g
})
registerProcedural('coil_spring_v1', (d) => {
  const g = grp()
  const sp = spring(d, 0.07, 0.24, 5, 0.013); g.add(sp)
  g.add(mesh(cylY(d, 0.08, 0.01), M.rubber(), 0, -0.125, 0), mesh(cylY(d, 0.08, 0.01), M.rubber(), 0, 0.125, 0))
  return g
})
registerProcedural('damper_v1', (d) => grp('',
  mesh(cylY(d, 0.024, 0.3), M.darkSteel(), 0, 0.15, 0),
  mesh(cylY(d, 0.009, 0.22), M.machinedAl(), 0, 0.4, 0),
  mesh(cylY(d, 0.04, 0.02), M.rubber(), 0, 0.52, 0),
  mesh(cylZ(d, 0.02, 0.04), M.darkSteel(), 0, 0.0, 0),
))
registerProcedural('link_v1', (d) => rod(d, 0.36, 0.011, 0.026, M.forged()))
registerProcedural('wishbone_v1', (d) => {
  const g = grp()
  g.add(new THREE.Mesh(tube(d, [[-0.2, 0, -0.1], [0, 0, 0], [-0.2, 0, 0.1]], 0.012), M.castAl()))
  g.add(mesh(cylY(d, 0.03, 0.04), M.castAl(), 0.0, 0, 0))
  for (const z of [-0.1, 0.1]) g.add(mesh(cylZ(d, 0.026, 0.03), M.castAl(), -0.2, 0, z))
  return g
})
registerProcedural('trailing_arm_v1', (d) => {
  const g = rod(d, 0.5, 0.012, 0.03, M.castAl())
  g.add(mesh(rbox(d, 0.2, 0.03, 0.04, 0.008), M.castAl(), -0.08, -0.02, 0))
  return g
})
registerProcedural('subframe_rear_v1', (d) => {
  const g = grp()
  for (const z of [-0.5, 0.5]) g.add(mesh(rbox(d, 0.7, 0.07, 0.07, 0.015), M.darkSteel(), 0, 0, z))
  for (const x of [-0.3, 0.3]) g.add(mesh(rbox(d, 0.07, 0.07, 1.05, 0.015), M.darkSteel(), x, 0, 0))
  for (const x of [-0.3, 0.3]) for (const z of [-0.5, 0.5]) g.add(mesh(cylY(d, 0.03, 0.08), M.rubber(), x, 0.05, z))
  return g
})

// ───────────────────────── 煞車 ─────────────────────────
registerProcedural('rotor_v1', (d) => {
  const g = grp('spin')
  g.add(mesh(roundZ(d, 0.155, 0.022), M.steel()))
  g.add(mesh(cylZ(d, 0.085, 0.045), M.darkSteel(), 0, 0, 0.02))   // 帽（hat）
  for (let i = 0; i < 5; i++) g.add(mesh(cylZ(d, 0.007, 0.01), M.darkSteel(), Math.cos(i * Math.PI * 2 / 5) * 0.06, Math.sin(i * Math.PI * 2 / 5) * 0.06, 0.045))
  return grp('', g)
})
registerProcedural('rotor_rear_v1', (d) => {
  const g = grp('spin')
  g.add(mesh(roundZ(d, 0.145, 0.018), M.steel()))
  g.add(mesh(cylZ(d, 0.09, 0.05), M.darkSteel(), 0, 0, 0.02))      // 帽裡面有手煞車鼓
  return grp('', g)
})
registerProcedural('caliper_v1', (d) => {
  const g = grp()
  g.add(mesh(rbox(d, 0.12, 0.09, 0.07, 0.015), M.castIron()))                       // 卡鉗本體（跨過碟盤）
  g.add(mesh(cylX(d, 0.028, 0.03), M.castIron(), 0, 0.02, -0.04))                    // 活塞缸（單活塞浮動）
  g.add(mesh(rbox(d, 0.14, 0.03, 0.09, 0.008), M.darkSteel(), 0, -0.05, 0))          // 支架
  g.add(mesh(cylY(d, 0.005, 0.12), M.rubber(), -0.05, 0.08, -0.03))                   // 油管
  return g
})
registerProcedural('pads_v1', (d) => grp('',
  mesh(rbox(d, 0.1, 0.05, 0.012, 0.003), M.darkSteel(), 0, 0, -0.02), mesh(rbox(d, 0.1, 0.05, 0.012, 0.003), M.darkSteel(), 0, 0, 0.02),
  mesh(rbox(d, 0.095, 0.045, 0.008, 0.002), mat(0x4a4038, { roughness: 0.95, metalness: 0.1 }), 0, 0, -0.01),
  mesh(rbox(d, 0.095, 0.045, 0.008, 0.002), mat(0x4a4038, { roughness: 0.95, metalness: 0.1 }), 0, 0, 0.01),
))
registerProcedural('master_cylinder_v1', (d) => grp('',
  mesh(cylX(d, 0.11, 0.07), M.dark(), -0.05, 0, 0),              // 真空倍力器
  mesh(cylX(d, 0.016, 0.1), M.machinedAl(), 0.04, 0, 0),         // 總泵
  mesh(rbox(d, 0.07, 0.07, 0.05, 0.01), mat(0xf4f1e8, { roughness: 0.7, metalness: 0 }), 0.05, 0.06, 0),  // 油壺
))
registerProcedural('abs_module_v1', (d) => grp('',
  mesh(rbox(d, 0.09, 0.07, 0.09, 0.01), M.machinedAl()),
  mesh(cylX(d, 0.035, 0.06), M.dark(), -0.07, 0, 0),             // 泵馬達
  mesh(rbox(d, 0.08, 0.04, 0.09, 0.008), M.blackPlastic(), 0, 0.055, 0),  // 控制電腦
))

// ───────────────────────── 轉向 ─────────────────────────
registerProcedural('steering_rack_v1', (d) => {
  const g = grp()
  g.add(mesh(cylZ(d, 0.03, 0.75), M.castAl()))                                   // 齒條殼
  g.add(mesh(cylZ(d, 0.012, 1.3), M.machinedAl()))                               // 齒條（露出兩端接內拉桿）
  g.add(mesh(cylY(d, 0.05, 0.1), M.dark(), 0.0, 0.0, -0.22), mesh(cylX(d, 0.02, 0.12), M.castAl(), -0.06, 0.02, -0.22))  // 電動馬達 + 小齒輪殼
  for (const z of [-0.3, 0.3]) g.add(mesh(cylZ(d, 0.045, 0.08), M.rubber(), 0, 0, z))  // 防塵套
  return g
})
registerProcedural('tie_rod_end_v1', (d) => grp('',
  mesh(cylZ(d, 0.009, 0.18), M.steel(), 0, 0, 0),
  mesh(cylY(d, 0.022, 0.04), M.forged(), 0, 0, 0.09), mesh(cylY(d, 0.007, 0.05), M.steel(), 0, 0.03, 0.09),
))
registerProcedural('steering_column_v1', (d) => grp('',
  mesh(cylX(d, 0.03, 0.5), M.dark(), 0, 0, 0),
  mesh(cylX(d, 0.012, 0.3), M.steel(), -0.35, 0, 0),
  mesh(rbox(d, 0.08, 0.06, 0.12, 0.01), M.blackPlastic(), 0.1, -0.02, 0),
))

// ───────────────────────── 傳動 ─────────────────────────
registerProcedural('driveshaft_v1', (d) => {
  const g = grp('spin')
  // 兩截各 0.53 m：變速箱輸出法蘭（x≈0.09）到差速器法蘭（x≈-1.01），軸距 2.81 m 時全長約 1.1 m
  g.add(mesh(cylX(d, 0.038, 0.53), M.steel(), 0.285, 0, 0), mesh(cylX(d, 0.034, 0.53), M.steel(), -0.285, 0, 0))
  g.add(mesh(cylX(d, 0.045, 0.06), M.darkSteel(), 0, 0, 0))                          // 中間滑套
  g.add(mesh(cylX(d, 0.06, 0.03), M.darkSteel(), 0.56, 0, 0), mesh(cylX(d, 0.06, 0.03), M.darkSteel(), -0.56, 0, 0))  // 法蘭
  return grp('', g)
})
registerProcedural('center_bearing_v1', (d) => grp('',
  mesh(cylX(d, 0.06, 0.03), M.rubber()), mesh(rbox(d, 0.03, 0.02, 0.18, 0.006), M.darkSteel(), 0, 0.055, 0),
))
registerProcedural('flex_disc_v1', (d) => {
  const g = grp()
  g.add(mesh(cylX(d, 0.085, 0.03), M.rubber()))
  for (let i = 0; i < 6; i++) g.add(mesh(cylX(d, 0.012, 0.04), M.darkSteel(), 0, Math.cos(i * Math.PI / 3) * 0.06, Math.sin(i * Math.PI / 3) * 0.06))
  return g
})
registerProcedural('rear_diff_v1', (d) => {
  const g = grp()
  g.add(shell(mesh(rbox(d, 0.26, 0.24, 0.3, 0.05), M.castAl())))
  g.add(mesh(cylX(d, 0.06, 0.12), M.castAl(), 0.18, 0.0, 0))                        // 小齒輪頸
  g.add(mesh(cylX(d, 0.055, 0.025), M.darkSteel(), 0.25, 0, 0))                     // 輸入法蘭
  for (const z of [-0.18, 0.18]) g.add(mesh(cylZ(d, 0.04, 0.06), M.castAl(), 0, 0, z))  // 輸出法蘭
  g.add(mesh(rbox(d, 0.14, 0.02, 0.2, 0.004), M.castAl(), -0.08, 0.13, 0))         // 上蓋肋
  return g
})
registerProcedural('axle_shaft_v1', (d) => grp('',
  mesh(cylZ(d, 0.016, 0.44), M.steel()),
  mesh(cylZ(d, 0.045, 0.08), M.rubber(), 0, 0, -0.2), mesh(cylZ(d, 0.045, 0.08), M.rubber(), 0, 0, 0.2),  // 兩端 CV 防塵套
  mesh(cylZ(d, 0.05, 0.05), M.darkSteel(), 0, 0, -0.245), mesh(cylZ(d, 0.05, 0.05), M.darkSteel(), 0, 0, 0.245),
))
registerProcedural('trans_crossmember_v1', (d) => grp('',
  mesh(rbox(d, 0.08, 0.04, 0.9, 0.01), M.darkSteel()),
  mesh(rbox(d, 0.1, 0.06, 0.12, 0.012), M.rubber(), 0, 0.04, 0),   // 變速箱腳
))

// ───────────────────────── 排氣 ─────────────────────────
registerProcedural('downpipe_v1', (d) => {
  const g = grp()
  g.add(mesh(cylY(d, 0.07, 0.16), M.steel(), 0, 0.3, 0))                                   // 觸媒
  g.add(new THREE.Mesh(tube(d, [[0, 0.46, 0], [0, 0.4, 0]], 0.035), M.steel()))
  g.add(new THREE.Mesh(tube(d, [[0, 0.22, 0], [0, 0.05, 0], [-0.2, -0.02, -0.05], [-0.5, -0.02, -0.08]], 0.03), M.steel()))
  g.add(mesh(cylY(d, 0.075, 0.012), M.darkSteel(), 0, 0.47, 0))                            // 法蘭
  return g
})
registerProcedural('exhaust_mid_v1', (d) => {
  const g = grp()
  g.add(mesh(cylX(d, 0.03, 1.6), M.steel()))
  g.add(mesh(cylX(d, 0.07, 0.4), M.steel(), 0.3, 0, 0))     // 共鳴箱
  g.add(mesh(cylX(d, 0.04, 0.05), M.darkSteel(), 0.8, 0, 0), mesh(cylX(d, 0.04, 0.05), M.darkSteel(), -0.8, 0, 0))  // 束環
  return g
})
registerProcedural('muffler_v1', (d) => {
  const g = grp()
  g.add(mesh(rbox(d, 0.45, 0.2, 0.9, 0.06), M.steel()))
  g.add(mesh(cylX(d, 0.03, 0.4), M.steel(), 0.4, 0, 0.3))                                 // 進口
  g.add(mesh(cylX(d, 0.035, 0.18), M.machinedAl(), -0.3, 0, -0.3))  // 單支尾管在左側（-Z，駕駛座側），依 ZL 實車車尾照片
  for (const z of [-0.2, 0.2]) g.add(mesh(cylY(d, 0.004, 0.12), M.rubber(), 0, 0.14, z))  // 吊耳
  return g
})

// ───────────────────────── 電系 ─────────────────────────
registerProcedural('battery_v1', (d) => {
  const g = grp()
  g.add(mesh(rbox(d, 0.17, 0.19, 0.3, 0.01), M.blackPlastic()))
  for (const z of [-0.1, 0.1]) g.add(mesh(cylY(d, 0.012, 0.02), z < 0 ? M.copper() : M.darkSteel(), 0, 0.105, z))
  g.add(mesh(rbox(d, 0.17, 0.01, 0.3, 0.004), M.greyPlastic(), 0, 0.09, 0))
  return g
})
registerProcedural('ibs_v1', (d) => grp('', mesh(rbox(d, 0.035, 0.03, 0.04, 0.006), M.blackPlastic()), mesh(cylY(d, 0.014, 0.02), M.darkSteel(), 0, 0.02, 0)))
registerProcedural('dme_v1', (d) => grp('',
  mesh(rbox(d, 0.2, 0.05, 0.16, 0.01), M.machinedAl()),
  mesh(rbox(d, 0.17, 0.015, 0.03, 0.004), M.blackPlastic(), 0, 0, 0.09),
  mesh(rbox(d, 0.17, 0.015, 0.03, 0.004), M.blackPlastic(), 0, 0, -0.09),
))
registerProcedural('o2_sensor_v1', (d) => grp('',
  mesh(cylY(d, 0.011, 0.05), M.steel(), 0, 0.02, 0), mesh(cylY(d, 0.009, 0.03), M.darkSteel(), 0, 0.06, 0),
  mesh(cylY(d, 0.004, 0.08), M.blackPlastic(), 0.02, 0.1, 0),
))
registerProcedural('sensor_pair_v1', (d) => grp('',
  mesh(cylZ(d, 0.012, 0.02), M.blackPlastic(), -0.06, 0, 0), mesh(cylZ(d, 0.012, 0.02), M.blackPlastic(), 0.06, 0, 0),
  mesh(rbox(d, 0.14, 0.006, 0.006, 0.002), M.blackPlastic(), 0, 0.01, 0),
))

// ───────────────────────── 車身蓋板 ─────────────────────────
// 前後保桿、行李廂蓋、引擎蓋在 R3 改由 bodyShell.ts 從同一張車皮切出來（*_v2）
registerProcedural('undertray_v1', (d) => grp('',
  mesh(rbox(d, 1.3, 0.01, 1.1, 0.02), M.blackPlastic()),
  mesh(rbox(d, 0.4, 0.01, 0.3, 0.01), M.blackPlastic(), 0, 0.005, 0),
))

// ── P6：保養用到的車身零件 ──
/** 冷氣濾網：長方形框 + 一排摺紙 */
registerProcedural('cabin_filter_v1', (d) => {
  const g = grp('', mesh(rbox(d, 0.24, 0.03, 0.4, 0.004), M.greyPlastic()))
  const n = d === 'low' ? 6 : 14
  for (let i = 0; i < n; i++) g.add(mesh(rbox(d, 0.012, 0.022, 0.38, 0.002), M.filter(), -0.11 + (0.22 * i) / (n - 1), 0.022, 0))
  return g
})
/** 雨刷：左右兩支刷臂 + 刷片（沿擋風玻璃底部擺） */
registerProcedural('wipers_v1', (d) => {
  const arm = (z: number, len: number, rot: number) => {
    const a = grp('')
    a.add(mesh(cylY(d, 0.018, 0.03), M.blackPlastic(), 0, 0.015, 0))
    a.add(mesh(rbox(d, len, 0.012, 0.022, 0.004), M.blackPlastic(), len / 2, 0.03, 0))
    a.add(mesh(rbox(d, len * 1.05, 0.016, 0.012, 0.003), M.rubber(), len / 2 + 0.02, 0.022, 0.03))
    a.position.set(0, 0, z); a.rotation.y = rot
    return a
  }
  return grp('', arm(0.55, 0.6, 2.9), arm(-0.05, 0.5, 2.95))
})
