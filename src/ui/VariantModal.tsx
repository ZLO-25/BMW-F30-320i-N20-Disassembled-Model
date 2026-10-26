import { ui } from '../core/i18n'
import { useAppStore } from '../store/useAppStore'

/** 首次進入：選手排或自排。之後從頂列也能再打開 */
export function VariantModal() {
  const open = useAppStore(s => s.variantModalOpen)
  const variant = useAppStore(s => s.variant)
  const lang = useAppStore(s => s.lang)
  const setVariant = useAppStore(s => s.setVariant)
  const close = useAppStore(s => s.setVariantModalOpen)
  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={() => variant && close(false)}>
      <div className="modal variant-modal" onClick={e => e.stopPropagation()}>
        <h2>{ui('chooseVariant', lang)}</h2>
        <p className="muted">{ui('chooseVariantHint', lang)}</p>
        <div className="variant-cards">
          <button className={`variant-card ${variant === 'manual' ? 'on' : ''}`} onClick={() => setVariant('manual')}>
            <span className="big">🦶 {ui('variantManual', lang)}</span>
            <small>{ui('manualBlurb', lang)}</small>
          </button>
          <button className={`variant-card ${variant === 'auto' ? 'on' : ''}`} onClick={() => setVariant('auto')}>
            <span className="big">🅿 {ui('variantAuto', lang)}</span>
            <small>{ui('autoBlurb', lang)}</small>
          </button>
        </div>
        {variant && <button onClick={() => close(false)}>{ui('close', lang)}</button>}
      </div>
    </div>
  )
}
