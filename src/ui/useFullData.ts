import { useEffect, useState } from 'react'
import { loadLearnData, type DataBundle, type FullData } from '../core/loadData'

/** E3：學習／保養面板用。教學資料載入完成前回傳 null（面板顯示「載入中」） */
export function useFullData(data: DataBundle): FullData | null {
  const [learn, setLearn] = useState<Awaited<ReturnType<typeof loadLearnData>> | null>(null)
  useEffect(() => { let alive = true; loadLearnData().then(l => { if (alive) setLearn(l) }); return () => { alive = false } }, [])
  return learn ? { ...data, ...learn } : null
}
