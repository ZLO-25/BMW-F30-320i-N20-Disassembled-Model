/**
 * P4：傳動、排氣、底盤懸吊、煞車、轉向、電系、車身蓋板的程式化產生器。
 * 座標慣例同 engineParts：+X 車頭、+Y 上、+Z 副駕側。每個產生器的原點 = 資料裡 position 指的那一點。
 * 桿件類（控制臂、連桿）一律沿 +X 畫，長度固定，實際方向用資料的 rotation 轉。
 */
import * as THREE from 'three'
import { registerProcedural, segs, mat, M, mesh, rbox, cylX, cylY, cylZ, tube, type Detail } from './registry'

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
registerProcedural('wheel_v1', (d) => {
  const g = grp('spin')
  const tyre = new THREE.TorusGeometry(0.275, 0.07, segs(d, 16, 10, 6), segs(d, 48, 24, 12))
  g.add(mesh(tyre, M.rubber()))
  g.add(mesh(cylZ(d, 0.22, 0.2), mat(0x9ea3aa, { metalness: 0.9, roughness: 0.25 })))
  const spokeGeo = new THREE.BoxGeometry(0.035, 0.2, 0.02)
  for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(spokeGeo, mat(0x9ea3aa, { metalness: 0.9, roughness: 0.3 })); sp.rotation.z = (i / 5) * Math.PI * 2; sp.position.z = 0.1; g.add(sp) }
  g.add(mesh(cylZ(d, 0.05, 0.03), M.darkSteel(), 0, 0, 0.11))
  for (let i = 0; i < 5; i++) g.add(mesh(cylZ(d, 0.008, 0.012), M.darkSteel(), Math.cos(i * Math.PI * 2 / 5 + 0.3) * 0.055, Math.sin(i * Math.PI * 2 / 5 + 0.3) * 0.055, 0.115))
  return grp('', g)
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
  g.add(mesh(cylZ(d, 0.155, 0.022), M.steel()))
  g.add(mesh(cylZ(d, 0.085, 0.045), M.darkSteel(), 0, 0, 0.02))   // 帽（hat）
  for (let i = 0; i < 5; i++) g.add(mesh(cylZ(d, 0.007, 0.01), M.darkSteel(), Math.cos(i * Math.PI * 2 / 5) * 0.06, Math.sin(i * Math.PI * 2 / 5) * 0.06, 0.045))
  return grp('', g)
})
registerProcedural('rotor_rear_v1', (d) => {
  const g = grp('spin')
  g.add(mesh(cylZ(d, 0.145, 0.018), M.steel()))
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
  g.add(mesh(cylX(d, 0.038, 0.68), M.steel(), 0.36, 0, 0), mesh(cylX(d, 0.034, 0.68), M.steel(), -0.36, 0, 0))
  g.add(mesh(cylX(d, 0.045, 0.06), M.darkSteel(), 0, 0, 0))                          // 中間滑套
  g.add(mesh(cylX(d, 0.06, 0.03), M.darkSteel(), 0.71, 0, 0), mesh(cylX(d, 0.06, 0.03), M.darkSteel(), -0.71, 0, 0))  // 法蘭
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
  for (const z of [-0.3, 0.3]) g.add(mesh(cylX(d, 0.035, 0.18), M.machinedAl(), -0.3, 0, z))  // 兩邊尾管
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
registerProcedural('bumper_front_v1', (d) => {
  const g = grp()
  g.add(new THREE.Mesh(tube(d, [[-0.15, 0, -0.95], [0.05, 0, -0.7], [0.1, 0, 0], [0.05, 0, 0.7], [-0.15, 0, 0.95]], 0.17), M.paint()))
  g.add(mesh(rbox(d, 0.08, 0.14, 0.7, 0.03), M.dark(), 0.06, -0.08, 0))   // 下進氣口
  return g
})
registerProcedural('bumper_rear_v1', (d) => {
  const g = grp()
  g.add(new THREE.Mesh(tube(d, [[0.15, 0, -0.95], [-0.05, 0, -0.7], [-0.1, 0, 0], [-0.05, 0, 0.7], [0.15, 0, 0.95]], 0.17), M.paint()))
  return g
})
registerProcedural('trunk_lid_v1', (d) => grp('',
  mesh(rbox(d, 0.75, 0.025, 1.4, 0.015), M.paint()),
  mesh(rbox(d, 0.03, 0.12, 1.36, 0.01), M.paint(), -0.37, -0.07, 0),
))
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
