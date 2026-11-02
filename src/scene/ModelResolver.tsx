/**
 * modelRef 解析：
 *   "procedural:<name>"            → 註冊表產生器
 *   "glb:/models/x.glb#NodeName"   → 載入 GLB，取指定節點（沒有 # 就整個場景）
 * 兩者都回傳 THREE.Object3D，PartNode 不在乎它從哪來。
 */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { getProcedural, mergeStaticMeshes, M, type Detail } from './procedural'
import { presetForMaterial } from './procedural/materialMatch'

// ?merge=0 關掉合併網格（除錯、比較效能用）
const MERGE = typeof location === 'undefined' || new URLSearchParams(location.search).get('merge') !== '0'

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
