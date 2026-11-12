import { describe, it, expect } from 'vitest'
import { vfovFromFocal35, cameraVfov, presetPose, readFocal35, sanitizeOverlay, DEFAULT_OVERLAY, CAR } from './photoOverlay'

/** 做一個最小的 JPEG：SOI + APP1(Exif) + SOS，EXIF 裡只有 0xA405 = focal */
function fakeJpeg(focal: number, le = true): ArrayBuffer {
  const tiff: number[] = []
  const u16 = (x: number) => le ? [x & 0xff, x >> 8] : [x >> 8, x & 0xff]
  const u32 = (x: number) => le ? [x & 0xff, (x >> 8) & 0xff, (x >> 16) & 0xff, x >>> 24] : [x >>> 24, (x >> 16) & 0xff, (x >> 8) & 0xff, x & 0xff]
  tiff.push(...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8))
  // IFD0（offset 8）：一筆 0x8769 → Exif IFD 在 26
  tiff.push(...u16(1), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(26), ...u32(0))
  // Exif IFD（offset 26）：一筆 0xA405 SHORT
  tiff.push(...u16(1), ...u16(0xa405), ...u16(3), ...u32(1), ...u16(focal), 0, 0, ...u32(0))
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
  const bytes = [0xff, 0xd8, 0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 0xff, ...app1, 0xff, 0xda, 0, 2]
  return new Uint8Array(bytes).buffer
}

describe('photoOverlay', () => {
  it('焦距換算視角：24 mm 直拍 4:3 ≈ 垂直 72°、橫拍 ≈ 57°', () => {
    expect(vfovFromFocal35(24, 3, 4)).toBeCloseTo(71.6, 0)
    expect(vfovFromFocal35(24, 4, 3)).toBeCloseTo(56.8, 0)
    // 焦距加倍，視角大約減半（窄角時）
    expect(vfovFromFocal35(240, 4, 3) / vfovFromFocal35(120, 4, 3)).toBeCloseTo(0.5, 1)
  })

  it('照片放大兩倍，鏡頭的 tan(視角/2) 減半', () => {
    const v = cameraVfov(50, 2)
    expect(Math.tan(v * Math.PI / 360)).toBeCloseTo(Math.tan(25 * Math.PI / 180) / 2, 6)
    expect(cameraVfov(50, 1)).toBeCloseTo(50, 6)
  })

  it('標準視角：左側照鏡頭在 −Z、正前在 +X，整台車都在畫面裡', () => {
    const vf = 54, aspect = 4 / 3
    const L = presetPose('left', vf, aspect)
    expect(L.position[2]).toBeLessThan(-3)
    expect(L.position[0]).toBeCloseTo(CAR.centerX, 6)
    const F = presetPose('front', vf, aspect)
    expect(F.position[0]).toBeGreaterThan(CAR.centerX + CAR.length / 2)
    // 車長在畫面裡的半角 < 半個水平視角
    const half = Math.atan(CAR.length / 2 / (-L.position[2] - CAR.width / 2))
    const halfH = Math.atan(Math.tan(vf * Math.PI / 360) * aspect)
    expect(half).toBeLessThan(halfH)
    // 視角越窄，鏡頭離越遠
    expect(-presetPose('left', 20, aspect).position[2]).toBeGreaterThan(-L.position[2])
  })

  it('讀 EXIF 35mm 等效焦距（Intel / Motorola 位元組順序）', () => {
    expect(readFocal35(fakeJpeg(24))).toBe(24)
    expect(readFocal35(fakeJpeg(49, false))).toBe(49)
    expect(readFocal35(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeNull()
    expect(readFocal35(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer)).toBeNull()
    expect(readFocal35(new ArrayBuffer(0))).toBeNull()
  })

  it('壞掉的設定回到預設、超出範圍會夾住', () => {
    expect(sanitizeOverlay(null)).toEqual(DEFAULT_OVERLAY)
    expect(sanitizeOverlay('x')).toEqual(DEFAULT_OVERLAY)
    const s = sanitizeOverlay({ opacity: 5, scale: -1, rot: 99, blend: 'weird', focal: 1000, flip: 'yes' })
    expect(s.opacity).toBe(1)
    expect(s.scale).toBe(0.3)
    expect(s.rot).toBe(15)
    expect(s.blend).toBe('normal')
    expect(s.focal).toBe(240)
    expect(s.flip).toBe(false)
  })
})
