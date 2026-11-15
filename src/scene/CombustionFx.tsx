/**
 * F1 缸內燃燒特效（React.lazy，只在「引擎運轉」動畫開著時掛載）。
 *
 *          火星塞
 *            ║
 *      ┌─────╨─────┐  ← 燃燒室頂（ROOF_Y）
 *      │     ✦     │  ① 火花：朝向鏡頭的小方片，藍白色，跳火後亮一下
 *      │   ( ◯ )   │  ② 火焰鋒面：以火星塞為圓心的球，半徑跟著「已燒體積」長大，碰到缸壁 / 活塞頂就被切掉
 *      │░░░░░░░░░░░│  ③ 高溫氣體：活塞頂到燃燒室頂之間的圓柱，顏色跟著溫度（黃白 → 橘 → 暗紅）
 *      ├───────────┤
 *      │   活塞    │
 *
 * 成本：兩個 InstancedMesh（各 4 個實例）= +2 draw call、0 盞燈、0 張貼圖。火球與溫度在片段著色器裡
 * 沿視線走幾步（L0 4 步一層雜訊、其餘 7 步兩層），用「離火星塞多遠」算出來。
 *
 * 注意：
 *  - 不能掛在零件模型底下：PartNode.applyVisibility 會覆寫底下所有 mesh 的透明度與 depthWrite。
 *    這裡是場景層級的群組，每格複製 eng.block.piston_rod_set 的 matrixWorld（爆炸檢視時跟著走）。
 *  - 活塞組或缸頭被拆下 / 隱藏時不畫。
 *  - 不參與射線偵測、不投影、不建 BVH。群組名 combustion_fx 給 e2e 找。
 *  - 數值全部來自 core/combustion.ts（示意模型），這裡只負責畫。
 */
import { useContext, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PartRegistryCtx } from './PartNode'
import { fx, engineCrank } from './animations'
import { CYL_X, CRANK_Y, STROKE_R, ROD_L, CRANK_ANGLE, BORE_R, CROWN_ABOVE_PIN, ROOF_Y, SPARK_Y } from './procedural/engineGeom'
import { slider } from '../core/engineCycle'
import { firePulse } from './engineSound'
import { redraw } from './redraw'
import { useAppStore } from '../store/useAppStore'
import type { QualityProfile } from '../core/quality'

const noop = () => {}
/**
 * 亮度補償：沒有後處理時，著色器最後一步就做色調映射 + sRGB 編碼，再「加」到畫面上（等於在 sRGB 空間相加，暗的火光會被放大很多）；
 * 有後處理（L3 以上）時是在線性空間相加，最後才整體色調映射。同樣的火焰在後者會暗很多，所以有後處理時把增益調高，兩邊看起來才接近。
 */
const GAIN = { plain: 11, postfx: 36 }
const SPARK_GAIN = { plain: 1, postfx: 2.5 }

const GAS_VERT = /* glsl */ `
attribute vec4 iParams;          // front, rate, heat, spark
varying vec3 vPosM;              // 這個片段在汽缸區域座標（公尺）
varying vec3 vCamM;              // 鏡頭在汽缸區域座標（公尺）
varying vec4 vParams;
varying vec2 vRH;                // 半徑、高度
#include <common>
#include <clipping_planes_pars_vertex>
void main() {
  vec3 S = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  mat4 m = modelMatrix * instanceMatrix;
  vec3 camL = (inverse(m) * vec4(cameraPosition, 1.0)).xyz;
  vPosM = position * S;
  vCamM = camL * S;
  vParams = iParams;
  vRH = S.xy;
  vec4 mvPosition = viewMatrix * m * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`

const GAS_FRAG = /* glsl */ `
uniform float uSeed;
uniform float uGain;
varying vec3 vPosM;
varying vec3 vCamM;
varying vec4 vParams;
varying vec2 vRH;
#include <common>
#include <clipping_planes_pars_fragment>

float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float n = vnoise(p);
#if OCTAVES > 1
  n = n * 0.65 + vnoise(p * 2.3 + 7.1) * 0.35;
#endif
  return n;
}
// 溫度 → 顏色：暗紅 → 橘 → 黃白（風格 B：位置與順序照實，暖色與亮度加強）
vec3 heatColor(float t) {
  vec3 a = vec3(0.35, 0.03, 0.0), b = vec3(1.0, 0.28, 0.02), c = vec3(1.0, 0.55, 0.1), d = vec3(1.0, 0.78, 0.38);
  return t < 0.35 ? mix(a, b, t / 0.35) : t < 0.7 ? mix(b, c, (t - 0.35) / 0.35) : mix(c, d, (t - 0.7) / 0.3);
}
void main() {
  #include <clipping_planes_fragment>
  float R = vRH.x, H = vRH.y;
  float front = vParams.x, rate = vParams.y, heat = vParams.z;
  if (front <= 0.001 && heat <= 0.001) discard;
  vec3 ro = vPosM;
  vec3 rd = normalize(vPosM - vCamM);
  // 視線離開圓柱的距離（側面、上下底取最近的）
  float a = dot(rd.xz, rd.xz), b = dot(ro.xz, rd.xz), c = dot(ro.xz, ro.xz) - R * R;
  float tSide = a > 1e-6 ? (-b + sqrt(max(b * b - a * c, 0.0))) / a : 1e3;
  float tCap = rd.y > 1e-5 ? (H - ro.y) / rd.y : (rd.y < -1e-5 ? -ro.y / rd.y : 1e3);
  float tEnd = clamp(min(tSide, tCap), 0.0, 2.0 * (R + H));
  vec3 plug = vec3(0.0, H - 0.002, 0.0);
  float rad = length(vec2(R, H)) * sqrt(front) * 1.03;
  float dt = tEnd / float(STEPS);
  vec3 col = vec3(0.0);
  vec3 frontCol = mix(vec3(0.55, 0.72, 1.0), vec3(1.0, 0.76, 0.36), clamp(front * 2.0, 0.0, 1.0));   // 剛點著的火核偏藍
  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * (dt * (float(i) + 0.5));
    float n = fbm(p * 140.0 + vec3(uSeed));
    float dd = length(p - plug) + (n - 0.5) * 0.014;
    float inside = smoothstep(rad + 0.002, rad - 0.006, dd);
    float shell = exp(-pow((dd - rad) / 0.0045, 2.0)) * rate;
    float flicker = 0.75 + 0.5 * n;
    col += (heatColor(heat) * pow(heat, 1.5) * 1.2 * inside * flicker + frontCol * shell * 2.2) * dt;
  }
  gl_FragColor = vec4(col * uGain, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const SPARK_VERT = /* glsl */ `
attribute float iSpark;
uniform float uSize;
varying vec2 vUv2;
varying float vSpark;
#include <common>
#include <clipping_planes_pars_vertex>
void main() {
  vec4 mvPosition = viewMatrix * modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mvPosition.xy += position.xy * uSize * (0.6 + 0.4 * iSpark);
  vUv2 = position.xy * 2.0;
  vSpark = iSpark;
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`

const SPARK_FRAG = /* glsl */ `
uniform float uGain;
varying vec2 vUv2;
varying float vSpark;
#include <common>
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  if (vSpark <= 0.001) discard;
  float r2 = dot(vUv2, vUv2);
  float core = exp(-r2 * 40.0);
  float halo = exp(-r2 * 5.0) * 0.45;
  vec3 col = vec3(1.0) * core * 2.2 + vec3(0.45, 0.65, 1.0) * halo;
  gl_FragColor = vec4(col * vSpark * uGain, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

/** 這個零件（含所有上層）有沒有在畫面上：被拆下（群組 visible=false）或隱藏（mesh visible=false）都算沒有 */
function shown(o: THREE.Object3D | undefined): boolean {
  if (!o) return false
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false
  let any = false
  o.traverse(m => { if (!any && (m as THREE.Mesh).isMesh && m.visible) any = true })
  return any
}

export function CombustionFx({ profile }: { profile: QualityProfile }) {
  const registry = useContext(PartRegistryCtx)
  const simple = profile.combustion === 'simple'
  const postfx = useAppStore(s => s.postfx)

  const { group, gas, spark, params, sparkAttr, gasMat, sparkMat } = useMemo(() => {
    const group = new THREE.Group()
    group.name = 'combustion_fx'
    group.matrixAutoUpdate = false

    const gasGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, false).translate(0, 0.5, 0)
    const params = new THREE.InstancedBufferAttribute(new Float32Array(16), 4)
    params.setUsage(THREE.DynamicDrawUsage)
    gasGeo.setAttribute('iParams', params)
    const gasMat = new THREE.ShaderMaterial({
      vertexShader: GAS_VERT, fragmentShader: GAS_FRAG,
      defines: { STEPS: simple ? 4 : 7, OCTAVES: simple ? 1 : 2 },
      uniforms: { uSeed: { value: 0 }, uGain: { value: GAIN.plain } },
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, clipping: true, toneMapped: true,
    })
    const gas = new THREE.InstancedMesh(gasGeo, gasMat, 4)
    gas.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

    const sparkGeo = new THREE.PlaneGeometry(1, 1)
    const sparkAttr = new THREE.InstancedBufferAttribute(new Float32Array(4), 1)
    sparkAttr.setUsage(THREE.DynamicDrawUsage)
    sparkGeo.setAttribute('iSpark', sparkAttr)
    const sparkMat = new THREE.ShaderMaterial({
      vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG,
      uniforms: { uSize: { value: 0.024 }, uGain: { value: 1 } },
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, clipping: true, toneMapped: true,
    })
    const spark = new THREE.InstancedMesh(sparkGeo, sparkMat, 4)
    const m = new THREE.Matrix4()
    CYL_X.forEach((x, i) => spark.setMatrixAt(i, m.makeTranslation(x, SPARK_Y - 0.002, 0)))

    for (const o of [gas, spark]) {
      o.raycast = noop
      o.castShadow = false; o.receiveShadow = false
      o.frustumCulled = false
      o.renderOrder = 5
      o.matrixAutoUpdate = false
      group.add(o)
    }
    group.visible = false
    return { group, gas, spark, params, sparkAttr, gasMat, sparkMat }
  }, [simple])

  useEffect(() => {
    gasMat.uniforms.uGain.value = postfx ? GAIN.postfx : GAIN.plain
    sparkMat.uniforms.uGain.value = postfx ? SPARK_GAIN.postfx : SPARK_GAIN.plain
    redraw()
  }, [postfx, gasMat, sparkMat])

  useEffect(() => {
    redraw()
    return () => {
      for (const o of [gas, spark]) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); o.dispose() }
      redraw()
    }
  }, [gas, spark])

  const m4 = useMemo(() => new THREE.Matrix4(), [])
  const seq = useMemo(() => ({ last: fx.sparkSeq }), [])

  useFrame(() => {
    // 點火聲（慢動作逐次時每跳火一次一聲悶響；只有面板勾了「引擎聲」、聲音正在響才會出聲）
    if (fx.sparkSeq !== seq.last) {
      seq.last = fx.sparkSeq
      if (fx.playing && fx.mix > 0.9) firePulse()
    }
    const pistons = registry.get('eng.block.piston_rod_set')
    const vis = shown(pistons) && shown(registry.get('eng.head.cylinder_head'))
    group.visible = vis
    if (!vis || !pistons) return
    group.matrix.copy(pistons.matrixWorld)
    group.matrixWorldNeedsUpdate = true

    const a = engineCrank()
    for (let i = 0; i < 4; i++) {
      const crown = CRANK_Y + slider(CRANK_ANGLE[i] + a, STROKE_R, ROD_L).pistonY + CROWN_ABOVE_PIN
      const h = Math.max(0.004, ROOF_Y - crown)
      m4.makeScale(BORE_R - 0.0008, h, BORE_R - 0.0008).setPosition(CYL_X[i], crown, 0)
      gas.setMatrixAt(i, m4)
      params.setXYZW(i, fx.front[i], fx.rate[i], fx.heat[i], fx.spark[i])
      sparkAttr.setX(i, fx.spark[i])
    }
    gas.instanceMatrix.needsUpdate = true
    params.needsUpdate = true
    sparkAttr.needsUpdate = true
    gasMat.uniforms.uSeed.value = ((a * 180) / Math.PI) * 0.013   // 雜訊跟著曲軸角走：暫停時火焰也停住
  })

  return <primitive object={group} />
}
