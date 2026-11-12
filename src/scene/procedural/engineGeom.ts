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
