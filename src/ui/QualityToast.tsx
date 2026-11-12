import { useEffect, useState } from 'react'
import { ui } from '../core/i18n'
import { useAppStore } from '../store/useAppStore'

/** E2：自動降低畫質時告訴使用者一聲（不然會以為模型變粗糙是壞了），6 秒後自己消失 */
export function QualityToast() {
  const lang = useAppStore(s => s.lang)
  const token = useAppStore(s => s.qualityNotice)
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (!token) return
    setShown(token)
    const id = setTimeout(() => setShown(0), 6000)
    return () => clearTimeout(id)
  }, [token])
  if (!shown) return null
  return (
    <div className="toast ok quality-toast" role="status">
      {ui('qualityDowngraded', lang)}
      <button className="toast-x" onClick={() => setShown(0)} aria-label="close">×</button>
    </div>
  )
}
