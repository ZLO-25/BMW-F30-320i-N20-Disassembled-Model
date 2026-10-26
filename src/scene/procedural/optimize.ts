/**
 * P7 效能：合併網格（減少 draw call）。
 *
 * 程式化零件是用很多小 mesh 拼起來的（一個引擎缸頭就有幾十塊），每塊 mesh = GPU 一次 draw call。
 * 手機一個畫面撐不了上千次 draw call，所以載入時把「同一個零件、外觀一樣」的 mesh 合成一塊：
 *
 *   零件 group                       零件 group
 *   ├─ mesh 鋁 ─┐                    ├─ mesh 鋁（合併後 1 塊）
 *   ├─ mesh 鋁 ─┤  合併同材質  ──►   ├─ mesh 鋼（合併後 1 塊）
 *   ├─ mesh 鋼 ─┘                    └─ 'spin'（有名字 → 保留，裡面另外合併）
 *   └─ 'spin'（動畫要轉它）
 *
 * 規則：
 *   - 有名字的節點（動畫用 getObjectByName 找它）是邊界：它自己保留，裡面另外合併
 *   - userData.shell（動畫時半透明的外殼）不和非外殼混在一起
 *   - 多重材質、鏡像（負縮放）、非一般 Mesh 的東西不動
 * 合併後材質沿用其中一塊的材質實例，所以每個零件仍有自己的材質，高亮、透明化照舊。
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const isBoundary = (o: THREE.Object3D) => o.name !== '' || !!o.userData.keep

/** 外觀一樣 = 這些屬性都一樣（貼圖比對 uuid，所以共用的雜訊貼圖算同一張） */
function materialKey(m: THREE.Material): string {
  const a = m as THREE.MeshPhysicalMaterial
  return [
    m.type, a.color?.getHexString(), a.emissive?.getHexString(), a.roughness, a.metalness,
    a.map?.uuid, a.bumpMap?.uuid, a.bumpScale, a.normalMap?.uuid, a.clearcoat, a.clearcoatRoughness,
    m.transparent, m.opacity, m.side, m.depthWrite, a.flatShading, a.vertexColors, a.envMapIntensity,
    m.polygonOffset, a.wireframe,
  ].join('|')
}

/** 只留 position / normal / uv，缺 uv 就補 0，讓不同來源的幾何可以合在一起 */
function normalize(g: THREE.BufferGeometry, nonIndexed: boolean): THREE.BufferGeometry {
  // 先複製：幾何可能被好幾個 mesh 共用，接下來 applyMatrix4 不能改到原本那份
  const out = nonIndexed && g.index ? g.toNonIndexed() : g.clone()
  if (!out.attributes.normal) out.computeVertexNormals()
  const n = out.attributes.position.count
  const clean = new THREE.BufferGeometry()
  clean.setAttribute('position', out.attributes.position)
  clean.setAttribute('normal', out.attributes.normal)
  clean.setAttribute('uv', out.attributes.uv ?? new THREE.BufferAttribute(new Float32Array(n * 2), 2))
  if (out.index) clean.setIndex(out.index)
  return clean
}

/** 這個 mesh 能不能合併 */
function mergeable(m: THREE.Mesh): boolean {
  return m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh
    && !Array.isArray(m.material) && m.visible && !isBoundary(m)
}

/** 把 unit 底下（不跨過有名字的節點）的 mesh 依材質合併。回傳省下幾個 mesh */
function mergeUnit(unit: THREE.Object3D): number {
  unit.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(unit.matrixWorld).invert()
  const buckets = new Map<string, { mat: THREE.Material; shell: boolean; items: { mesh: THREE.Mesh; m: THREE.Matrix4 }[] }>()
  const boundaries: THREE.Object3D[] = []

  const walk = (o: THREE.Object3D) => {
    for (const c of [...o.children]) {
      if (isBoundary(c)) { boundaries.push(c); continue }
      const mesh = c as THREE.Mesh
      if (mesh.isMesh && mergeable(mesh)) {
        const m = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld)
        if (m.determinant() > 0) {
          const shell = !!mesh.userData.shell
          const key = materialKey(mesh.material as THREE.Material) + (shell ? '|shell' : '')
          const b = buckets.get(key) ?? { mat: mesh.material as THREE.Material, shell, items: [] }
          b.items.push({ mesh, m })
          buckets.set(key, b)
        }
      }
      walk(c)
    }
  }
  walk(unit)

  let saved = 0
  for (const b of buckets.values()) {
    if (b.items.length < 2) continue
    const nonIndexed = b.items.some(i => !i.mesh.geometry.index)
    const geos = b.items.map(i => normalize(i.mesh.geometry, nonIndexed).applyMatrix4(i.m))
    const merged = mergeGeometries(geos, false)
    if (!merged) continue
    merged.computeBoundingSphere()
    const out = new THREE.Mesh(merged, b.mat)
    if (b.shell) out.userData.shell = true
    for (const i of b.items) i.mesh.removeFromParent()
    unit.add(out)
    saved += b.items.length - 1
  }

  // 拿掉被搬空的無名 group（但有名字的邊界節點不能動）
  const prune = (o: THREE.Object3D) => {
    for (const c of [...o.children]) {
      if (isBoundary(c)) continue
      prune(c)
      if (!(c as THREE.Mesh).isMesh && c.children.length === 0) c.removeFromParent()
    }
  }
  prune(unit)

  for (const b of boundaries) saved += mergeUnit(b)
  return saved
}

/** 對一個程式化零件做合併。回傳新的 mesh 數量（測試與效能報表用） */
export function mergeStaticMeshes(root: THREE.Object3D): { before: number; after: number } {
  const count = () => { let n = 0; root.traverse(o => { if ((o as THREE.Mesh).isMesh) n++ }); return n }
  const before = count()
  mergeUnit(root)
  return { before, after: count() }
}
