/**
 * R1 光與環境：「修車廠」環境。純 three，不連網、不需要任何圖檔，所以 GitHub Pages、離線都能用。
 *
 * 為什麼不用真的 HDRI 照片？
 *   - 容器與 Pages 都不保證連得到 Poly Haven 之類的網站，而且要多帶好幾 MB 的檔案。
 *   - 金屬與車漆看起來「真」，靠的是反射裡有「真實場景的形狀」：天花板一排排的日光燈管、
 *     捲門外的天光、牆邊的工具櫃。這些用幾十個方塊就能做出來，效果和照片 HDRI 很接近。
 *
 *   這個小房間 ──(PMREM 一次算好)──► 環境貼圖 ──► 所有 PBR 材質的反射與環境光
 *                                         └────► 工作室模式的背景（模糊、調暗）
 *
 * 房間座標和場景一樣（+X 車頭、+Y 上、+Z 右側）。發光物用 MeshBasicMaterial，顏色乘上倍數 = 亮度。
 * 只在載入時算一次，之後每個畫面都不會再花時間。
 */
import * as THREE from 'three'

type Box = { size: [number, number, number]; pos: [number, number, number]; color: [number, number, number]; k?: number }

/** 修車廠的配置：數字是公尺；k = 發光倍數（> 1 才會在反射裡亮起來） */
const ROOM = { w: 18, h: 5.2, d: 13 }   // X 長 18、高 5.2、Z 寬 13
const TUBE_COLOR: [number, number, number] = [1, 0.98, 0.94]   // 日光燈：微暖的白

function layout(): Box[] {
  const out: Box[] = []
  // 天花板日光燈：3 排 × 4 支，沿車身前後方向（X）擺，車漆上會映出一條條平行的亮線
  for (const z of [-3.2, 0, 3.2]) for (const x of [-6, -2, 2, 6]) {
    out.push({ size: [2.4, 0.05, 0.16], pos: [x, ROOM.h - 0.25, z], color: TUBE_COLOR, k: 16 })
  }
  // 車頭前方的捲門開口：戶外天光（偏冷、面積大但沒有燈管亮）
  out.push({ size: [0.05, 3.6, 5.2], pos: [ROOM.w / 2 - 0.05, 1.8, 0.6], color: [0.86, 0.92, 1], k: 4.5 })
  // 右側牆上方一排氣窗
  out.push({ size: [9, 0.6, 0.05], pos: [-1, 4.1, ROOM.d / 2 - 0.05], color: [0.9, 0.95, 1], k: 3 })
  // 左側牆邊：紅色工具櫃、灰色層架（反射裡打破單調的牆面，不發光；面積小，背景才不會整片偏紅）
  out.push({ size: [1.2, 0.9, 0.5], pos: [-3, 0.45, -ROOM.d / 2 + 0.3], color: [0.3, 0.06, 0.05] })
  out.push({ size: [3.2, 2.2, 0.5], pos: [3.5, 1.1, -ROOM.d / 2 + 0.3], color: [0.16, 0.17, 0.18] })
  // 車尾後方的牆：深色的零件架與一塊白板（中等亮度）
  out.push({ size: [0.5, 2.4, 4], pos: [-ROOM.w / 2 + 0.3, 1.2, -2.5], color: [0.14, 0.15, 0.16] })
  out.push({ size: [0.05, 1.2, 2.4], pos: [-ROOM.w / 2 + 0.06, 1.8, 2.6], color: [0.85, 0.85, 0.82], k: 0.9 })
  // 地上的黃色安全線（從上方的反射看得到一點）
  for (const z of [-2.6, 2.6]) out.push({ size: [7, 0.01, 0.1], pos: [0, 0.005, z], color: [0.75, 0.55, 0.05], k: 0.6 })
  return out
}

/** 建出修車廠房間（給 PMREMGenerator.fromScene 用）。呼叫端用完要 disposeWorkshop() */
export function buildWorkshop(): THREE.Scene {
  const scene = new THREE.Scene()
  const shared = new THREE.BoxGeometry(1, 1, 1)
  // 房間：內面朝內的盒子。牆是中灰的水泥漆，地板較暗（油污水泥），天花板偏暗
  const room = new THREE.BoxGeometry(ROOM.w, ROOM.h, ROOM.d)
  room.translate(0, ROOM.h / 2, 0)
  const faces = [0.7, 0.62, 0.32, 0.24, 0.66, 0.66] // +X -X +Y(天花板) -Y(地板) +Z -Z
  const roomMats = faces.map(v => new THREE.MeshBasicMaterial({ color: new THREE.Color(v, v, v * 1.02), side: THREE.BackSide }))
  scene.add(new THREE.Mesh(room, roomMats))
  for (const b of layout()) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(...b.color).multiplyScalar(b.k ?? 1) })
    const mesh = new THREE.Mesh(shared, m)
    mesh.scale.set(...b.size)
    mesh.position.set(...b.pos)
    scene.add(mesh)
  }
  return scene
}

export function disposeWorkshop(scene: THREE.Scene) {
  scene.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.geometry.dispose()
    for (const mm of Array.isArray(m.material) ? m.material : [m.material]) mm.dispose()
  })
}

/** 測試用：燈管數量（12 支）與發光物件數 */
export const workshopLayout = layout

/**
 * 水泥地貼圖（程式產生，不用圖檔）。一張 = 地上 3 m × 3 m，邊緣是伸縮縫（深色細線）。
 *   R 通道 = 顏色明暗（大片斑駁 + 細小砂點 + 幾塊油漬）
 *   G 通道 = 粗糙度（油漬的地方比較亮滑）
 */
export function concreteData(N = 256): Uint8Array {
  let seed = 11
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  // 低頻斑駁：幾個隨機的大圓疊起來
  const blobs = Array.from({ length: 14 }, () => ({ x: rnd() * N, y: rnd() * N, r: N * (0.08 + rnd() * 0.25), a: (rnd() - 0.5) * 0.18 }))
  const stains = Array.from({ length: 3 }, () => ({ x: N * (0.2 + rnd() * 0.6), y: N * (0.2 + rnd() * 0.6), r: N * (0.04 + rnd() * 0.07) }))
  const data = new Uint8Array(N * N * 4)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0.62
    for (const b of blobs) {
      // 環狀距離（貼圖會重複，邊界要接得起來）
      const dx = Math.min(Math.abs(x - b.x), N - Math.abs(x - b.x)), dy = Math.min(Math.abs(y - b.y), N - Math.abs(y - b.y))
      const d = Math.hypot(dx, dy) / b.r
      if (d < 1) v += b.a * (1 - d * d)
    }
    v += (rnd() - 0.5) * 0.08               // 細砂點
    let rough = 0.88 + (rnd() - 0.5) * 0.06
    for (const s of stains) {
      const d = Math.hypot(x - s.x, y - s.y) / s.r
      if (d < 1) { const w = 1 - d * d; v -= 0.16 * w; rough -= 0.35 * w }
    }
    // 伸縮縫：貼圖邊緣約 1 cm 寬（3 m 的 0.3%）的淡深色線
    const edge = Math.min(x, y, N - 1 - x, N - 1 - y) / N
    if (edge < 0.003) v *= 0.7
    const i = (y * N + x) * 4
    data[i] = Math.max(0, Math.min(255, v * 255))
    data[i + 1] = Math.max(0, Math.min(255, rough * 255))
    data[i + 2] = 0
    data[i + 3] = 255
  }
  return data
}

/** 水泥地材質：同一份資料做顏色與粗糙度貼圖（粗糙度讀 G 通道） */
export function concreteMaterial(tiles: number): THREE.MeshStandardMaterial {
  const N = 256
  const raw = concreteData(N)
  const col = new Uint8Array(N * N * 4)
  for (let i = 0; i < N * N; i++) {
    const v = raw[i * 4]
    // 水泥的顏色：微暖的灰
    col[i * 4] = v * 0.98; col[i * 4 + 1] = v * 0.96; col[i * 4 + 2] = v * 0.92; col[i * 4 + 3] = 255
  }
  const mk = (d: Uint8Array, srgb: boolean) => {
    const tx = new THREE.DataTexture(d, N, N)
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping
    tx.repeat.set(tiles, tiles)
    tx.magFilter = THREE.LinearFilter
    tx.minFilter = THREE.LinearMipmapLinearFilter
    tx.generateMipmaps = true
    tx.anisotropy = 4
    if (srgb) tx.colorSpace = THREE.SRGBColorSpace
    tx.needsUpdate = true
    return tx
  }
  return new THREE.MeshStandardMaterial({ color: 0x8a8884, map: mk(col, true), roughnessMap: mk(raw, false), roughness: 1, metalness: 0 })
}
