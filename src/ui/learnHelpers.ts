/**
 * 學習分頁的小幫手，獨立成檔是為了讓 LearnPanel 可以延遲載入（審查 S3）：
 * MistakeModal 只需要 triggerText，之前直接 import LearnPanel 會把整個面板拉進首包。
 */
import type { DataBundle } from '../core/loadData'
import { ui, fmt, partName } from '../core/i18n'

export function triggerText(trigger: string, data: DataBundle, lang: 'zh' | 'en'): string {
  const [kind, ref] = trigger.split(':')
  if (kind === 'remove_without_tool') { const tl = data.tools.get(ref); return fmt(ui('mistakeTool', lang), { t: tl ? partName(tl.name) : ref }) }
  if (kind === 'remove_before') { const p = data.parts.find(x => x.id === ref); return fmt(ui('mistakeBefore', lang), { p: p ? partName(p.name) : ref }) }
  return trigger
}
