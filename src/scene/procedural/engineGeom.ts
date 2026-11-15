/**
 * 引擎幾何常數（產生器與運轉動畫共用）。原點在缸體中心，曲軸沿 X 軸。
 * 汽缸編號：BMW 從正時鏈那端（車頭，+X）算起是 1 缸，所以 CYL_X 的索引 3 = 1 缸、索引 0 = 4 缸。
 */
export const PITCH = 0.091
export const CYL_X = [-1.5, -0.5, 0.5, 1.5].map(i => i * PITCH)
/** CYL_X 索引 → 汽缸編號 */
export const CYL_NO = [4, 3, 2, 1]
export const CRANK_Y = -0.09
export const STROKE_R = 0.045                     // 行程 90.1 mm 的一半
export const ROD_L = 0.19                         // 示意
/** 曲柄銷角度：1、4 缸在上死點；2、3 在下死點 */
export const CRANK_ANGLE = [0, Math.PI, Math.PI, 0]

// ───── F0：燃燒室（燃燒特效用，引擎座標）─────
/** 缸徑半徑（缸徑 84 mm 的一半，wiki_n20）；缸體產生器的缸孔也用這個 */
export const BORE_R = 0.042
/** 活塞頂到活塞銷的高度（piston_rod_set_v1：活塞本體中心 +0.01、高 0.05） */
export const CROWN_ABOVE_PIN = 0.035
/** 活塞銷高度在上死點時 = 曲軸 + 曲柄半徑 + 連桿長；活塞頂最高 ≈ 0.18 */
export const PIN_TDC_Y = CRANK_Y + STROKE_R + ROD_L
/** 燃燒室頂（氣門頭的高度，缸頭 0.183 + 氣門組 0.06 − 0.048） */
export const ROOF_Y = 0.195
/** 火星塞側電極（缸頭 0.183 + 火星塞組 0.04 − 0.025），略高於燃燒室頂、在缸頭的火星塞孔裡 */
export const SPARK_Y = 0.198
