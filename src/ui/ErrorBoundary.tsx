import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ui, type Lang } from '../core/i18n'

interface Props { lang: Lang; children: ReactNode }
interface State { error: Error | null }

/**
 * 錯誤邊界（審查 S2）：3D 場景或任何面板丟出例外時，不要讓整頁變白，
 * 顯示「載入失敗」與錯誤訊息，並給一個重新整理按鈕。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }
  static getDerivedStateFromError(error: Error): State { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[app] 未攔截的錯誤', error, info.componentStack) }
  render() {
    if (!this.state.error) return this.props.children
    const { lang } = this.props
    return (
      <div className="fatal" role="alert">
        <h2>{ui('errorTitle', lang)}</h2>
        <p>{ui('errorBody', lang)}</p>
        <pre>{String(this.state.error?.message ?? this.state.error)}</pre>
        <button className="primary" onClick={() => location.reload()}>{ui('reload', lang)}</button>
      </div>
    )
  }
}

/** 瀏覽器有沒有 WebGL2（three r16x 需要）。沒有就不要掛 Canvas，改顯示文字提示 */
export function webglSupported(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { return false }
}
