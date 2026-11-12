/**
 * modelRef 解析：
 *   "procedural:<name>"            → 註冊表產生器
 *   "glb:/models/x.glb#NodeName"   → 載入 GLB，取指定節點（沒有 # 就整個場景）
 * 兩者都回傳 THREE.Object3D，PartNode 不在乎它從哪來。
 */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh'
import { getProcedural, mergeStaticMeshes, M, type Detail } from './procedural'
import { presetForMaterial } from './procedural/materialMatch'

// ?merge=0 關掉合併網格（除錯、比較效能用）
const MERGE = typeof location === 'undefined' || new URLSearchParams(location.search).get('merge') !== '0'

// E4：射線加速。滑鼠每動一下 R3F 都要問「射線打到哪個零件」，沒有加速結構時是對 60 萬個三角形逐一比對（實測約 16 ms）。
// 給每個夠大的 mesh 建一棵 BVH，查詢變成對數時間。?bvh=0 可以關掉（比較前後用）。
const BVH = typeof location === 'undefined' || new URLSearchParams(location.search).get('bvh') !== '0'
type BvhGeometry = THREE.BufferGeometry & { computeBoundsTree?: () => void; disposeBoundsTree?: () => void }
const BVH_MIN_TRIANGLES = 100
export const bvhStats = { built: 0, ms: 0, queued: 0 }

/**
 * 建樹很貴（high 約 250 ms，全部同步做會讓載入多卡一下），所以排隊、在瀏覽器閒的時候每次做一小段（約 6 ms）。
 * 還沒輪到的 mesh 用原本的逐三角形檢查，行為一樣、只是慢一點，所以任何時候都正確。
 */
const queue: THREE.Mesh[] = []
let scheduled = false
const idle: (cb: () => void) => void = typeof requestIdleCallback === 'function' ? (cb) => requestIdleCallback(cb, { timeout: 500 }) : (cb) => setTimeout(cb, 16)
function buildOne(m: THREE.Mesh) {
  const g = m.geometry as BvhGeometry
  if (!g || (g as { boundsTree?: unknown }).boundsTree) return
  ;(g as unknown as { computeBoundsTree: typeof computeBoundsTree }).computeBoundsTree = computeBoundsTree
  ;(g as unknown as { disposeBoundsTree: typeof disposeBoundsTree }).disposeBoundsTree = disposeBoundsTree
  g.computeBoundsTree?.()
  m.raycast = acceleratedRaycast
  bvhStats.built++
}
function pump() {
  scheduled = false
  const t0 = performance.now()
  while (queue.length && performance.now() - t0 < 6) {
    const m = queue.shift()!
    if (m.geometry && (m.userData.disposed !== true)) buildOne(m)
  }
  bvhStats.ms += performance.now() - t0
  bvhStats.queued = queue.length
  if (queue.length) { scheduled = true; idle(pump) }
}
function buildBounds(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const g = m.geometry as BvhGeometry
    const tris = (g.index ? g.index.count : g.attributes.position.count) / 3
    if (tris >= BVH_MIN_TRIANGLES) queue.push(m)
  })
  bvhStats.queued = queue.length
  if (!scheduled && queue.length) { scheduled = true; idle(pump) }
}

export function parseModelRef(ref: string): { kind: 'procedural'; name: string } | { kind: 'glb'; url: string; node?: string } {
  if (ref.startsWith('procedural:')) return { kind: 'procedural', name: ref.slice('procedural:'.length) }
  const rest = ref.slice('glb:'.length)
  const [url, node] = rest.split('#')
  // base './' 部署時，絕對路徑要轉成相對 base
  const resolved = url.startsWith('/') ? `${import.meta.env.BASE_URL}${url.slice(1)}` : url
  return { kind: 'glb', url: resolved, node }
}

/**
 * 釋放一個零件物件的 GPU 資源（審查 S1）。R3F 不會自動 dispose 用 <primitive> 掛上去的物件，
 * 切換變速箱重建場景時舊零件會留在顯示卡記憶體裡（實測切 6 次 geometry 370 → 856）。
 * 共用的雜訊貼圖（registry 的 noiseTex）不在這裡 dispose：material.dispose() 不會動到 texture。
 */
export function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.userData.disposed = true   // 還在 BVH 建樹排隊的就跳過
    ;(m.geometry as BvhGeometry | undefined)?.disposeBoundsTree?.()
    m.geometry?.dispose()
    for (const mm of Array.isArray(m.material) ? m.material : [m.material]) mm?.dispose()
  })
}

export function useProceduralObject(name: string, detail: Detail): THREE.Group {
  return useMemo(() => {
    let gen = getProcedural(name)
    if (!gen) {
      console.warn(`[model] 找不到程式化模型 ${name}，用方塊代替`)
      gen = getProcedural('box')!
    }
    const obj = gen(detail)
    if (MERGE) mergeStaticMeshes(obj)
    if (BVH) buildBounds(obj)
    return obj
  }, [name, detail])
}

export function GlbObject({ url, node, onObject }: { url: string; node?: string; onObject: (o: THREE.Object3D) => void }) {
  const gltf = useGLTF(url)
  const obj = useMemo(() => {
    // GLTFLoader 會把節點名稱裡的 . : / [ ] 拿掉（例如 eng.head.valve_cover → enghead...），兩種都找
    const src = node ? (gltf.scene.getObjectByName(node) ?? gltf.scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(node))) : gltf.scene
    const cloned = (src ?? gltf.scene).clone(true)
    // U6：材質換成 App 的 M.* 預設（和程式化零件同一套質感）；對不上的才保留原材質。
    // 不論哪一種都是新的材質實例，才能單獨高亮。
    const swap = (x: THREE.Material): THREE.Material => {
      const s = x as THREE.MeshStandardMaterial
      const preset = s.color ? presetForMaterial({ name: x.name, color: s.color, metalness: s.metalness ?? 0, transparent: x.transparent }) : null
      return preset ? M[preset]() : x.clone()
    }
    cloned.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh
        m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material)
      }
    })
    return cloned
  }, [gltf, node])
  useEffect(() => { onObject(obj); return () => disposeObject(obj) }, [obj]) // eslint-disable-line react-hooks/exhaustive-deps
  return <primitive object={obj} />
}
