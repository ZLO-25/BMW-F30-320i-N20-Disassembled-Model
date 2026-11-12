/**
 * R6-B 實車照片疊圖：純邏輯（鏡頭焦距換算、標準視角、讀 EXIF 焦距）。
 *
 * 想法：照片本身就是一台「相機」拍出來的。只要 3D 鏡頭的視角（FOV）和拍照的手機一樣，
 * 再把 3D 鏡頭擺到拍照的位置，模型就會和照片裡的車完全重疊。
 *
 *   手機照片 ──► EXIF「35mm 等效焦距」（Pixel 主鏡頭 = 24 mm）
 *                   │  換算
 *                   ▼
 *              垂直視角 vfov ──► 3D 鏡頭用同一個 vfov
 *                                   │  照片高度 = 畫面高度
 *                                   ▼
 *              使用者轉動、拉近拉遠 3D 鏡頭（= 走到拍照的位置）→ 輪廓重疊
 *
 * 35mm 等效焦距是用「對角線」定義的（全片幅對角線 43.27 mm），所以不管照片是直的還是橫的，
 * 都先算對角線視角，再依照片長寬比例換成垂直視角。
 */

/** 全片幅（36 × 24 mm）對角線的一半，單位 mm */
const HALF_DIAG_35 = Math.hypot(36, 24) / 2

/** 車身外形（與 bodyShell 的 BODY_X、規格一致；bodyShell.test.ts 會互相檢查） */
export const CAR = {
  /** 前軸 1.5 + 前懸 0.79 到 後軸 −1.31 − 後懸 1.044（官方前後懸，bmw_press_f30_us_2017） */
  length: 4.644,
  width: 1.811,
  height: 1.429,
  /** 車身前後中點的 X（BODY_X.front = 2.29、BODY_X.rear = −2.354） */
  centerX: (2.29 + -2.354) / 2,
} as const

export type OverlayView = 'left' | 'right' | 'front' | 'rear'
export const OVERLAY_VIEWS: OverlayView[] = ['left', 'right', 'front', 'rear']

/** 手機主鏡頭（1×）常見的 35mm 等效焦距；讀不到 EXIF 時的預設 */
export const DEFAULT_FOCAL35 = 24
export const FOCAL_RANGE = [12, 240] as const

/** 35mm 等效焦距 + 照片寬高 → 垂直視角（度） */
export function vfovFromFocal35(focal35: number, w: number, h: number): number {
  const f = Math.min(Math.max(focal35, FOCAL_RANGE[0]), FOCAL_RANGE[1])
  const tanHalfDiag = HALF_DIAG_35 / f
  const tanHalfV = tanHalfDiag * h / Math.hypot(w, h)
  return 2 * Math.atan(tanHalfV) * 180 / Math.PI
}

/**
 * 照片放大 scale 倍顯示時，3D 鏡頭的視角要跟著變窄，模型才會一起放大：
 *   tan(鏡頭 vfov / 2) = tan(照片 vfov / 2) / scale
 */
export function cameraVfov(photoVfovDeg: number, scale: number): number {
  const t = Math.tan((photoVfovDeg * Math.PI) / 360) / Math.max(scale, 0.05)
  return 2 * Math.atan(t) * 180 / Math.PI
}

export interface Pose { position: [number, number, number]; target: [number, number, number] }

/**
 * 標準視角：鏡頭放在車身中間高度、水平看過去，距離剛好讓整台車佔畫面約 fill 的比例。
 * 座標：+X 車頭、+Z 右側。左側照（ZL 的側面照）鏡頭在 −Z，畫面上車頭朝左。
 */
export function presetPose(view: OverlayView, vfovDeg: number, aspect: number, fill = 0.8): Pose {
  const halfV = Math.tan((vfovDeg * Math.PI) / 360)
  const halfH = halfV * aspect
  const side = view === 'left' || view === 'right'
  const across = side ? CAR.length : CAR.width   // 畫面左右方向的長度
  const depth = side ? CAR.width : CAR.length    // 沿視線方向的長度
  const d = Math.max(across / 2 / (fill * halfH), CAR.height / 2 / (fill * halfV)) + depth / 2
  const y = CAR.height / 2
  const target: [number, number, number] = [CAR.centerX, y, 0]
  const dir: Record<OverlayView, [number, number]> = { left: [0, -1], right: [0, 1], front: [1, 0], rear: [-1, 0] }
  const [dx, dz] = dir[view]
  return { position: [CAR.centerX + dx * d, y, dz * d], target }
}

/**
 * 從 JPEG 讀「35mm 等效焦距」（EXIF 標籤 0xA405）。不是 JPEG、沒有 EXIF、或沒有這個標籤 → null。
 *
 *   JPEG: FFD8 ─ APP1(FFE1) "Exif\0\0" ─ TIFF 標頭（II/MM 位元組順序）─ IFD0 ─ 0x8769 指到 Exif IFD ─ 0xA405
 */
export function readFocal35(buf: ArrayBuffer): number | null {
  const v = new DataView(buf)
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null
  let p = 2
  while (p + 4 <= v.byteLength) {
    const marker = v.getUint16(p)
    if ((marker & 0xff00) !== 0xff00) return null
    const len = v.getUint16(p + 2)
    if (marker === 0xffe1 && p + 10 <= v.byteLength && v.getUint32(p + 4) === 0x45786966 /* "Exif" */) {
      return focalFromTiff(v, p + 10, len - 8)
    }
    if (marker === 0xffda) return null   // 影像資料開始，後面不會有 EXIF 了
    p += 2 + len
  }
  return null
}

function focalFromTiff(v: DataView, base: number, size: number): number | null {
  if (base + 8 > v.byteLength) return null
  const le = v.getUint16(base) === 0x4949
  const u16 = (o: number) => v.getUint16(base + o, le)
  const u32 = (o: number) => v.getUint32(base + o, le)
  const inRange = (o: number, n: number) => o >= 0 && o + n <= size && base + o + n <= v.byteLength
  const find = (ifd: number, tag: number): number | null => {
    if (!inRange(ifd, 2)) return null
    const n = u16(ifd)
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12
      if (!inRange(e, 12)) return null
      if (u16(e) === tag) {
        const type = u16(e + 2)
        return type === 3 ? u16(e + 8) : type === 4 ? u32(e + 8) : null
      }
    }
    return null
  }
  if (!inRange(4, 4)) return null
  const exifIfd = find(u32(4), 0x8769)
  if (exifIfd == null) return null
  const f = find(exifIfd, 0xa405)
  return f && f > 0 ? f : null
}

/** 照片疊在畫面上的調整（不含照片本身；照片只存在瀏覽器記憶體，不存檔、不上傳） */
export interface OverlaySettings {
  opacity: number
  /** 1 = 照片高度剛好等於畫面高度（此時 3D 視角才和照片一致） */
  scale: number
  /** 位移，單位 = 照片寬 / 高的百分比 */
  dx: number
  dy: number
  /** 旋轉（度），修正拍照時手機沒拿正 */
  rot: number
  flip: boolean
  /** difference：重疊處變暗，輪廓對不上的地方會亮起來 */
  blend: 'normal' | 'difference'
  /** 35mm 等效焦距；null = 用照片 EXIF（讀不到就用 DEFAULT_FOCAL35） */
  focal: number | null
}

export const DEFAULT_OVERLAY: OverlaySettings = { opacity: 0.5, scale: 1, dx: 0, dy: 0, rot: 0, flip: false, blend: 'normal', focal: null }

const clamp = (x: unknown, lo: number, hi: number, d: number) =>
  typeof x === 'number' && Number.isFinite(x) ? Math.min(Math.max(x, lo), hi) : d

/** 從 localStorage 讀回的設定可能是舊版或壞掉的，逐欄檢查 */
export function sanitizeOverlay(raw: unknown): OverlaySettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_OVERLAY
  return {
    opacity: clamp(o.opacity, 0, 1, d.opacity),
    scale: clamp(o.scale, 0.3, 3, d.scale),
    dx: clamp(o.dx, -50, 50, d.dx),
    dy: clamp(o.dy, -50, 50, d.dy),
    rot: clamp(o.rot, -15, 15, d.rot),
    flip: o.flip === true,
    blend: o.blend === 'difference' ? 'difference' : 'normal',
    focal: o.focal == null ? null : clamp(o.focal, FOCAL_RANGE[0], FOCAL_RANGE[1], DEFAULT_FOCAL35),
  }
}
