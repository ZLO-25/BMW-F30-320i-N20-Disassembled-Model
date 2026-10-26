import type { Confidence } from '../core/schema'
import { ui, type Lang } from '../core/i18n'

export function ConfidenceBadge({ c, lang }: { c: Confidence; lang: Lang }) {
  const key = c === 'verified' ? 'confVerified' : c === 'community' ? 'confCommunity' : 'confUnverified'
  return <span className={`badge badge-${c}`}>{ui(key, lang)}</span>
}

export function ConfidenceLegend({ lang }: { lang: Lang }) {
  return (
    <div className="legend">
      <span>{ui('legend', lang)}：</span>
      <ConfidenceBadge c="verified" lang={lang} />
      <ConfidenceBadge c="community" lang={lang} />
      <ConfidenceBadge c="unverified" lang={lang} />
    </div>
  )
}
