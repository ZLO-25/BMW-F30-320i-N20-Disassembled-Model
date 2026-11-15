/**
 * 排氣系統幾何常數（三個產生器與 exhaust.test.ts 共用）。整車座標：+X 車頭、+Y 上、+Z 副駕側。
 * 零件原點必須等於 data/parts/exhaust.json 的 position（exhaust.test.ts 會檢查）；改原點時兩邊一起改。
 * 產生器用「世界座標 − 原點」算區域座標，不要再手打區域數字。
 */
export type V3 = readonly [number, number, number]

export const PIPE_R = 0.03                       // 主管半徑

// 零件原點（= exhaust.json position）
export const ORIGIN_DOWNPIPE: V3 = [1.15, 0.17, 0.22]
export const ORIGIN_MID: V3 = [-0.48, 0.15, 0.2]
export const ORIGIN_MUFFLER: V3 = [-1.96, 0.25, 0]

// 接點（整車座標）
export const J0: V3 = [1.09, 0.468, 0.27]        // 渦輪出口 ↔ 下導管
export const J1: V3 = [0.4, 0.15, 0.2]           // 下導管 ↔ 中段
export const J2: V3 = [-1.36, 0.15, 0.2]         // 中段 ↔ 消音器進口

/** 車底段高度 / 側向位置：副車架與後軸（底面 y ≥ 0.215）下方的走廊 */
export const RUN_Y = 0.15
export const RUN_Z = 0.2

/** 消音器箱體前面（x），進口管終點必須在箱體內 */
export const MUFFLER_BOX_FRONT_X = -1.735

// 中心線路徑（整車座標）
const addV = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
/** 下導管：渦輪出口往下 → 觸媒 → 前傾彎 → 沿車底往後到 J1（本來寫成區域座標，這裡換成整車座標） */
export const DOWNPIPE_PATH: V3[] = ([
  [-0.06, 0.1, 0.05], [-0.06, 0.04, 0.05], [-0.16, -0.01, 0.0], [-0.3, -0.02, -0.02], [-0.75, -0.02, -0.02],
] as V3[]).map(p => addV(ORIGIN_DOWNPIPE, p))
export const DOWNPIPE_TOP_PATH: V3[] = [[J0[0], J0[1] - 0.008, J0[2]], [J0[0], J0[1] - 0.098, J0[2]]]
/** 中段：J1 → J2 一根直管 */
export const MID_PATH: V3[] = [J1, J2]
/** 消音器進口管：J2 → 貼地走過副車架下方 → 爬升進箱體 */
export const MUFFLER_INLET_PATH: V3[] = [J2, [-1.67, RUN_Y, RUN_Z], [-1.72, 0.19, RUN_Z], [-1.78, 0.21, RUN_Z]]

/** 世界座標 → 該零件的區域座標 */
export const toLocal = (o: V3, p: V3): [number, number, number] => [p[0] - o[0], p[1] - o[1], p[2] - o[2]]
export const pathLocal = (o: V3, path: readonly V3[]) => path.map(p => toLocal(o, p))
