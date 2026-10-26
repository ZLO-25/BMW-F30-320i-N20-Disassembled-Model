/**
 * 簡化的 F30 四門轎車車殼：用側面輪廓擠出 + 四個輪子。只求比例與位置關係，不求寫實。
 * 之後會換成下載的 GLB（改 data/parts/car.json 的 modelRef 即可）。
 * 車身座標：原點在前後軸中點地面上方 0，+X 車頭。長約 4.6m、寬約 1.8m、高約 1.43m（示意）。
 */
import * as THREE from 'three'
import { registerProcedural, segs, mat, M, at, rbox } from './registry'

registerProcedural('body_shell_v1', (d) => {
  const g = new THREE.Group()
  const W = 1.8
  // 側面輪廓（X 向前，Y 向上），從前保桿底部順時針畫
  const s = new THREE.Shape()
  s.moveTo(2.3, 0.3)
  s.lineTo(2.3, 0.62)    // 前保桿
  s.lineTo(2.12, 0.79)   // 引擎蓋前緣
  s.lineTo(0.9, 0.95)    // 引擎蓋後緣 / 擋風玻璃底
  s.lineTo(0.3, 1.4)     // 擋風玻璃頂（A 柱）
  s.lineTo(-0.7, 1.43)   // 車頂
  s.lineTo(-1.5, 1.15)   // 後擋風玻璃（C 柱）
  s.lineTo(-2.2, 1.05)   // 行李廂蓋
  s.lineTo(-2.3, 0.75)   // 後保桿上緣
  s.lineTo(-2.3, 0.3)
  s.lineTo(-1.95, 0.3)
  s.absarc(-1.5, 0.33, 0.45, Math.PI, 0, true)  // 後輪拱
  s.lineTo(1.05, 0.3)
  s.absarc(1.5, 0.33, 0.45, Math.PI, 0, true)   // 前輪拱
  s.lineTo(2.3, 0.3)

  const geo = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: segs(d, 4, 2, 1), curveSegments: segs(d, 16, 8, 4) })
  geo.translate(0, 0, -W / 2)
  const body = new THREE.Mesh(geo, M.paint())
  body.name = 'bodyShellMain'
  g.add(body)

  // 車窗（深色玻璃貼在側面）
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0d1117, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  const win = new THREE.Shape()
  win.moveTo(0.78, 1.0); win.lineTo(0.3, 1.36); win.lineTo(-0.7, 1.39); win.lineTo(-1.42, 1.14); win.lineTo(-1.42, 1.0); win.closePath()
  for (const z of [W / 2 + 0.081, -W / 2 - 0.081]) {
    const wg = new THREE.ShapeGeometry(win)
    const m = new THREE.Mesh(wg, glass.clone())
    m.position.z = z
    g.add(m)
  }
  // 雙腎型水箱罩（BMW 的招牌）
  for (const z of [0.16, -0.16]) g.add(at(new THREE.Mesh(rbox(d, 0.04, 0.12, 0.22, 0.03), mat(0x111214, { metalness: 0.6, roughness: 0.3 })), 2.37, 0.62, z))
  // 頭燈
  for (const z of [0.6, -0.6]) g.add(at(new THREE.Mesh(rbox(d, 0.05, 0.08, 0.36, 0.02), new THREE.MeshPhysicalMaterial({ color: 0xdfe6ee, metalness: 0.1, roughness: 0.05, clearcoat: 1 })), 2.33, 0.66, z))

  // 輪子從 P4 起是獨立零件（chs.wheel_*，procedural:wheel_v1），車殼不再畫
  return g
})

registerProcedural('hood_v1', (d) => {
  const g = new THREE.Group()
  g.add(new THREE.Mesh(rbox(d, 1.24, 0.025, 1.62, 0.012), M.paint()))
  // 兩條 BMW 引擎蓋上常見的稜線
  for (const z of [0.32, -0.32]) g.add(at(new THREE.Mesh(rbox(d, 1.1, 0.012, 0.05, 0.006), M.paint()), -0.02, 0.016, z))
  return g
})
