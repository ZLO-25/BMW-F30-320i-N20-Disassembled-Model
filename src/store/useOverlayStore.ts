import { create } from 'zustand'
import { sanitizeOverlay, DEFAULT_OVERLAY, type OverlaySettings, type OverlayView } from '../core/photoOverlay'

/**
 * R6-B 實車照片疊圖的狀態。和主 store 分開：只有打開疊圖時才會用到，也不影響拆裝邏輯。
 *
 *   photo（只在記憶體，關掉網頁就沒了）    settings（存 localStorage，下次打開沿用）
 *   └ url = URL.createObjectURL(檔案)     └ 透明度、縮放、位移、旋轉、鏡像、疊加方式、焦距
 */
export interface OverlayPhoto { url: string; name: string; w: number; h: number; exifFocal: number | null }

interface OverlayState {
  panelOpen: boolean
  visible: boolean
  photo: OverlayPhoto | null
  settings: OverlaySettings
  /** 按下標準視角時加一，Scene 裡的 OverlayCamera 依此移動鏡頭 */
  view: { view: OverlayView; token: number } | null
  setPanelOpen: (b: boolean) => void
  setVisible: (b: boolean) => void
  setPhoto: (p: OverlayPhoto | null) => void
  patch: (p: Partial<OverlaySettings>) => void
  resetSettings: () => void
  goView: (v: OverlayView) => void
}

const KEY = 'n20.overlay.v1'
const load = (): OverlaySettings => {
  try { return sanitizeOverlay(JSON.parse(localStorage.getItem(KEY) ?? 'null')) } catch { return { ...DEFAULT_OVERLAY } }
}
const save = (s: OverlaySettings) => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* 無痕模式等，忽略 */ } }

export const useOverlayStore = create<OverlayState>((set, get) => ({
  panelOpen: false,
  visible: true,
  photo: null,
  settings: load(),
  view: null,
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setVisible: (visible) => set({ visible }),
  setPhoto: (photo) => {
    const old = get().photo
    if (old && old.url !== photo?.url) URL.revokeObjectURL(old.url)
    set({ photo, visible: true })
  },
  patch: (p) => { const settings = sanitizeOverlay({ ...get().settings, ...p }); save(settings); set({ settings }) },
  resetSettings: () => { save(DEFAULT_OVERLAY); set({ settings: { ...DEFAULT_OVERLAY } }) },
  goView: (view) => set((s) => ({ view: { view, token: (s.view?.token ?? 0) + 1 } })),
}))

/** 照片是否疊在畫面上（有照片、面板開著、勾了顯示） */
export const overlayActive = (s: Pick<OverlayState, 'panelOpen' | 'visible' | 'photo'>) => s.panelOpen && s.visible && s.photo !== null
/** 3D 鏡頭是否改用照片的視角：只看有沒有照片、面板開著；暫時隱藏照片時視角不變，模型才不會跳 */
export const overlayCamera = (s: Pick<OverlayState, 'panelOpen' | 'photo'>) => s.panelOpen && s.photo !== null
