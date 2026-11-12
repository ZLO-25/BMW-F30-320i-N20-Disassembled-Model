import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { cameraVfov, vfovFromFocal35, presetPose, DEFAULT_FOCAL35 } from '../core/photoOverlay'
import { useOverlayStore, overlayCamera } from '../store/useOverlayStore'

export const DEFAULT_FOV = 42

/**
 * R6-B：疊圖作用時，3D 鏡頭的視角改成和照片一樣（由焦距算出來）；關掉就回到 42°。
 * 按下標準視角（左側／右側／正前／正後）時，把鏡頭擺到水平看車身的位置。
 */
export function OverlayCamera() {
  const { camera, controls, size } = useThree()
  const active = useOverlayStore(overlayCamera)
  const photo = useOverlayStore(s => s.photo)
  const focal = useOverlayStore(s => s.settings.focal)
  const scale = useOverlayStore(s => s.settings.scale)
  const view = useOverlayStore(s => s.view)

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    if (!cam.isPerspectiveCamera) return
    cam.fov = active && photo
      ? cameraVfov(vfovFromFocal35(focal ?? photo.exifFocal ?? DEFAULT_FOCAL35, photo.w, photo.h), scale)
      : DEFAULT_FOV
    cam.updateProjectionMatrix()
  }, [camera, active, photo, focal, scale])

  useEffect(() => {
    if (!view) return
    const cam = camera as THREE.PerspectiveCamera
    const pose = presetPose(view.view, cam.fov, size.width / Math.max(size.height, 1))
    cam.position.set(...pose.position)
    const c = controls as unknown as { target: THREE.Vector3; update: () => void } | null
    if (c) { c.target.set(...pose.target); c.update() } else cam.lookAt(...pose.target)
  }, [view?.token]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
