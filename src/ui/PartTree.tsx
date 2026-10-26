import { useEffect, useMemo } from 'react'
import type { DataBundle } from '../core/loadData'
import type { Part } from '../core/schema'
import { ancestorsPath, searchParts } from '../core/partGraph'
import { partName, ui } from '../core/i18n'
import { useAppStore } from '../store/useAppStore'

export function PartTree({ data }: { data: DataBundle }) {
  const lang = useAppStore(s => s.lang)
  const search = useAppStore(s => s.search)
  const setSearch = useAppStore(s => s.setSearch)
  const expanded = useAppStore(s => s.expanded)
  const expandMany = useAppStore(s => s.expandMany)
  const selectedId = useAppStore(s => s.selectedId)

  const { matches, expand } = useMemo(() => searchParts(data.graph, search), [data.graph, search])

  // 搜尋時展開到符合的零件；選到零件時展開到它
  useEffect(() => { if (expand.size) expandMany(expand) }, [expand, expandMany])
  useEffect(() => { if (selectedId) expandMany(ancestorsPath(data.graph, selectedId)) }, [selectedId, data.graph, expandMany])

  const filtering = search.trim().length > 0
  const visible = (p: Part) => !filtering || matches.has(p.id) || expand.has(p.id)

  return (
    <div className="tree">
      <input className="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={ui('search', lang)} />
      <ul>
        {data.graph.roots.map(r => <TreeNode key={r.id} part={r} data={data} visible={visible} matches={matches} expandedSet={expanded} />)}
      </ul>
    </div>
  )
}

function TreeNode({ part, data, visible, matches, expandedSet }: {
  part: Part; data: DataBundle; visible: (p: Part) => boolean; matches: Set<string>; expandedSet: Set<string>
}) {
  const selectedId = useAppStore(s => s.selectedId)
  const hoveredId = useAppStore(s => s.hoveredId)
  const select = useAppStore(s => s.select)
  const hover = useAppStore(s => s.hover)
  const toggle = useAppStore(s => s.toggleExpanded)
  const removed = useAppStore(s => s.removedIds.has(part.id))
  if (!visible(part)) return null
  const kids = (data.graph.children.get(part.id) ?? []).filter(visible)
  const hasKids = (data.graph.children.get(part.id) ?? []).length > 0
  const open = expandedSet.has(part.id)
  const cls = ['node', selectedId === part.id ? 'selected' : '', hoveredId === part.id ? 'hovered' : '', matches.has(part.id) ? 'match' : '', removed ? 'removed' : ''].join(' ')
  return (
    <li>
      <div className={cls} onMouseEnter={() => hover(part.id)} onMouseLeave={() => hover(null)}>
        <button className="twisty" onClick={() => toggle(part.id)} disabled={!hasKids} aria-label="expand">{hasKids ? (open ? '▾' : '▸') : '·'}</button>
        <button className="label" onClick={() => select(part.id)}>
          <span className={`lvl lvl${part.level}`}>L{part.level}</span>
          {partName(part.name)}
          {removed && <span className="tag-removed">📦</span>}
        </button>
      </div>
      {open && kids.length > 0 && <ul>{kids.map(k => <TreeNode key={k.id} part={k} data={data} visible={visible} matches={matches} expandedSet={expandedSet} />)}</ul>}
    </li>
  )
}
