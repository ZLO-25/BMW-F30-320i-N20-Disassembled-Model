import { useContext, useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAppStore } from '../store/useAppStore'
import { ANIM_BY_ID, resetAnim } from './animations'
import { PartRegistryCtx } from './PartNode'

/** 每格畫面套用目前的動畫；播放中會自動推滑桿（來回） */
export function AnimationDriver() {
  const registry = useContext(PartRegistryCtx)
  const animId = useAppStore(s => s.anim)
  const dir = useRef(1)
  const lastSet = useRef(0)
  const t0 = useRef(0)

  // 換動畫或關掉：先把上一個動畫動過的東西歸零
  useEffect(() => {
    resetAnim(id => registry.get(id))
    t0.current = performance.now() / 1000
  }, [animId, registry])

  useFrame((_, dt) => {
    const s = useAppStore.getState()
    const def = s.anim ? ANIM_BY_ID.get(s.anim) : undefined
    if (!def || !s.variant) return
    let t = s.animT
    if (s.animPlaying && def.control === 'slider') {
      t += dir.current * dt * 0.22
      if (t >= 1) { t = 1; dir.current = -1 } else if (t <= 0) { t = 0; dir.current = 1 }
      if (Math.abs(t - lastSet.current) > 0.01) { lastSet.current = t; s.setAnimT(t) }
    }
    def.apply({ get: id => registry.get(id), t, gear: s.gear, time: performance.now() / 1000 - t0.current, variant: s.variant })
  })
  return null
}
