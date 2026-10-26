/**
 * modelRef 解析：
 *   "procedural:<name>"            → 註冊表產生器
 *   "glb:/models/x.glb#NodeName"   → 載入 GLB，取指定節點（沒有 # 就整個場景）
 * 兩者都回傳 THREE.Object3D，PartNode 不在乎它從哪來。
 */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { getProcedural, mergeStaticMeshes, type Detail } from './procedural'

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
    const src = node ? gltf.scene.getObjectByName(node) : gltf.scene
    const cloned = (src ?? gltf.scene).clone(true)
    // 複製材質，才能單獨高亮
    cloned.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh
        m.material = Array.isArray(m.material) ? m.material.map(x => x.clone()) : m.material.clone()
      }
    })
    return cloned
  }, [gltf, node])
  useEffect(() => { onObject(obj) }, [obj]) // eslint-disable-line react-hooks/exhaustive-deps
  return <primitive object={obj} />
}
