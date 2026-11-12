import { EffectComposer, N8AO, ToneMapping, Bloom } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import type { QualityProfile } from '../core/quality'

/** 後處理：AO / Bloom / 抗鋸齒取樣數都由畫質設定檔（core/quality.ts）決定 */
export function PostFX({ profile }: { profile: QualityProfile }) {
  const full = profile.ao === 'full'
  return (
    <EffectComposer multisampling={profile.msaa}>
      {/* 半徑單位是公尺：0.15 m ≈ 零件之間的縫隙、螺栓座、凹槽這種尺度 */}
      <N8AO aoRadius={0.15} distanceFalloff={0.6} intensity={full ? 3 : 2.5} quality={full ? 'medium' : 'low'} halfRes={!full} />
      {/* R1：只有真的很亮的地方（燈管在鍍鉻、車漆上的反光）才會微微泛光，像相機拍到的那樣；只在 L5 */}
      {profile.bloom ? <Bloom luminanceThreshold={1.1} luminanceSmoothing={0.3} intensity={0.35} mipmapBlur radius={0.55} /> : null}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}
