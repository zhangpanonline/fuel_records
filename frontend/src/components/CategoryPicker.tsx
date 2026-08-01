import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { type ExpenseCategory } from '../services/api'
import './CategoryPicker.css'

const LAST_KEY = 'expense_last_category'
const FREQ_KEY = 'expense_category_counts'

interface FreqEntry {
  count: number
  last_used: string
}

interface SelectedCategory {
  l1: string
  l2: string
  l3: string
  l1Id: number
  l2Id: number
  l3Id: number
}

interface CategoryPickerProps {
  categories: ExpenseCategory[]
  selectedL1: string
  selectedL2: string
  selectedL3: string
  onSelect: (l1: string, l2: string, l3: string) => void
  onCreateNew: (parentId: number | null, label: string) => void
  onCategorySelected?: (selection: SelectedCategory) => void
  onDeleteRecord?: () => void
}

/* ================================================================
   序列化 key: "l1Id|l2Id|l3Id"
   ================================================================ */
function makeKey(l1Id: number, l2Id: number, l3Id: number): string {
  return `${l1Id}|${l2Id}|${l3Id}`
}

function parseCounts(): Record<string, FreqEntry> {
  try {
    const raw = localStorage.getItem(FREQ_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function recordCategorySelected(selection: SelectedCategory) {
  localStorage.setItem(LAST_KEY, JSON.stringify({
    l1: selection.l1,
    l2: selection.l2,
    l3: selection.l3,
  }))
}

export function incrementCategoryCount(l1Id: number, l2Id: number, l3Id: number) {
  const counts = parseCounts()
  const key = makeKey(l1Id, l2Id, l3Id)
  if (!counts[key]) {
    counts[key] = { count: 0, last_used: '' }
  }
  counts[key].count += 1
  counts[key].last_used = new Date().toISOString().slice(0, 10)
  localStorage.setItem(FREQ_KEY, JSON.stringify(counts))
}

export function decrementCategoryCount(l1Id: number, l2Id: number, l3Id: number) {
  const counts = parseCounts()
  const key = makeKey(l1Id, l2Id, l3Id)
  if (counts[key]) {
    counts[key].count -= 1
    if (counts[key].count <= 0) {
      delete counts[key]
    }
    localStorage.setItem(FREQ_KEY, JSON.stringify(counts))
  }
}

/* ================================================================
   树节点
   ================================================================ */
interface TreeNode {
  l1: { id: number; name: string }
  l2: { id: number; name: string }
  l3: { id: number; name: string }
}

function flattenTree(categories: ExpenseCategory[]): TreeNode[] {
  const result: TreeNode[] = []
  for (const l1 of categories) {
    for (const l2 of l1.children || []) {
      for (const l3 of l2.children || []) {
        result.push({
          l1: { id: l1.id, name: l1.name },
          l2: { id: l2.id, name: l2.name },
          l3: { id: l3.id, name: l3.name },
        })
      }
    }
  }
  return result
}

function matchNode(node: TreeNode, search: string): boolean {
  const s = search.toLowerCase()
  return (
    node.l1.name.toLowerCase().includes(s) ||
    node.l2.name.toLowerCase().includes(s) ||
    node.l3.name.toLowerCase().includes(s)
  )
}

/* ================================================================
   CategoryPicker
   ================================================================ */
export default function CategoryPicker({
  categories,
  selectedL1,
  selectedL2,
  selectedL3,
  onSelect,
  onCreateNew,
  onCategorySelected,
}: CategoryPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedL1, setExpandedL1] = useState<string | null>(null)
  const [expandedL2, setExpandedL2] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 关闭面板（点击外部）
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
        setSearch('')
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [open])

  // 面板打开时锁定背景滚动
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [open])

  // ── 扁平化树 ──
  const flatTree = useMemo(() => flattenTree(categories), [categories])

  // ── 搜索过滤 ──
  const filterSearch = search.trim().toLowerCase()
  const searchResults = useMemo(() => {
    if (!filterSearch) return null
    return flatTree.filter((n) => matchNode(n, filterSearch))
  }, [flatTree, filterSearch])

  // ── Top 5 常用 ──
  const top5 = useMemo(() => {
    const counts = parseCounts()
    const entries = Object.entries(counts)
    if (entries.length === 0) return []

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    // 过滤 7 天内 + 懒清理过期
    const valid = entries.filter(([key, v]) => {
      if (v.last_used < cutoffStr) {
        delete counts[key]
        return false
      }
      return true
    })

    if (valid.length < entries.length) {
      localStorage.setItem(FREQ_KEY, JSON.stringify(counts))
    }

    // 排序取 Top 5
    valid.sort((a, b) => b[1].count - a[1].count)
    return valid.slice(0, 5).map(([key]) => {
      const [l1Id, l2Id, l3Id] = key.split('|').map(Number)
      // 在树中查找对应节点
      const node = flatTree.find(
        (n) => n.l1.id === l1Id && n.l2.id === l2Id && n.l3.id === l3Id,
      )
      return node
        ? { key, node }
        : null
    }).filter(Boolean) as { key: string; node: TreeNode }[]
  }, [flatTree])

  // ── 记忆上次选择 ──
  useEffect(() => {
    if (!open) return
    if (selectedL1) {
      setExpandedL1(selectedL1)
      setExpandedL2(selectedL2 || null)
    } else {
      try {
        const raw = localStorage.getItem(LAST_KEY)
        if (raw) {
          const last = JSON.parse(raw) as { l1: string; l2: string; l3: string }
          // 回填上次选择（含 ID）
          if (!selectedL1 && !selectedL2 && !selectedL3) {
            onSelect(last.l1, last.l2, last.l3)
            const node = flatTree.find(
              (n) => n.l1.name === last.l1 && n.l2.name === last.l2 && n.l3.name === last.l3,
            )
            if (node) {
              onCategorySelected?.({
                l1: node.l1.name,
                l2: node.l2.name,
                l3: node.l3.name,
                l1Id: node.l1.id,
                l2Id: node.l2.id,
                l3Id: node.l3.id,
              })
            }
          }
          setExpandedL1(last.l1)
          setExpandedL2(last.l2 || null)
        }
      } catch {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleSelect(node: TreeNode) {
    onSelect(node.l1.name, node.l2.name, node.l3.name)
    const selection: SelectedCategory = {
      l1: node.l1.name,
      l2: node.l2.name,
      l3: node.l3.name,
      l1Id: node.l1.id,
      l2Id: node.l2.id,
      l3Id: node.l3.id,
    }
    recordCategorySelected(selection)
    onCategorySelected?.(selection)
    setOpen(false)
    setSearch('')
  }

  function handleToggleL1(name: string) {
    setExpandedL1(expandedL1 === name ? null : name)
    setExpandedL2(null)
  }

  function handleToggleL2(name: string) {
    setExpandedL2(expandedL2 === name ? null : name)
  }

  function handlePanelClick(e: React.MouseEvent) {
    e.stopPropagation()
  }

  function handleOpen() {
    setOpen(true)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearch(e.target.value)
    if (!open) setOpen(true)
  }

  const displayText = selectedL1
    ? `${selectedL1} / ${selectedL2} / ${selectedL3}`
    : ''

  const triggerClass = `cp-trigger ${open ? 'cp-trigger-open' : ''}`

  const l1List = categories
  const l2List = expandedL1
    ? l1List.find((c) => c.name === expandedL1)?.children || []
    : []
  const l3List = expandedL1 && expandedL2
    ? l2List.find((c) => c.name === expandedL2)?.children || []
    : []

  return (
    <div className="cp-wrapper" ref={containerRef}>
      {open ? (
        <input
          ref={inputRef}
          type="text"
          className={triggerClass}
          placeholder="搜索分类..."
          value={search}
          onChange={handleInputChange}
          autoComplete="off"
        />
      ) : (
        <div className={triggerClass} onClick={handleOpen}>
          {displayText || <span className="cp-placeholder">选择分类</span>}
        </div>
      )}

      {open && (
        <div className="cp-panel" onClick={handlePanelClick}>
          {/* 面板内容 */}
          <div className="cp-panel-body">
            {filterSearch ? (
              /* ── 搜索结果 ── */
              <div className="cp-search-results">
                {searchResults && searchResults.length > 0 ? (
                  searchResults.map((node) => (
                    <div
                      key={`${node.l1.id}-${node.l2.id}-${node.l3.id}`}
                      className="cp-search-item"
                      onClick={() => handleSelect(node)}
                    >
                      <span className="cp-search-path">
                        {node.l1.name} / {node.l2.name} / {node.l3.name}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="cp-empty">无匹配分类</div>
                )}
              </div>
            ) : (
              <>
                {/* ── Top 5 常用 ── */}
                {top5.length > 0 && (
                  <div className="cp-top5">
                    <div className="cp-top5-label">常用分类</div>
                    {top5.map(({ node }) => (
                      <div
                        key={`top-${node.l1.id}-${node.l2.id}-${node.l3.id}`}
                        className="cp-top5-item"
                        onClick={() => handleSelect(node)}
                      >
                        <span className="cp-top5-count">{node.l1.name}</span>
                        <span className="cp-search-path">
                          {node.l1.name} / {node.l2.name} / {node.l3.name}
                        </span>
                      </div>
                    ))}
                    <div className="cp-tree-divider" />
                  </div>
                )}

                {/* ── 级联树 ── */}
                <div className="cp-tree">
                  {l1List.map((l1) => {
                    const isExpanded = expandedL1 === l1.name
                    const hasChildren = (l1.children || []).length > 0
                    return (
                      <div key={l1.id} className="cp-tree-group">
                        <div
                          className="cp-tree-l1"
                          onClick={() => hasChildren ? handleToggleL1(l1.name) : null}
                        >
                          <span className={`cp-tree-expand ${isExpanded ? 'expanded' : ''}`}>
                            {hasChildren ? '▶' : ''}
                          </span>
                          <span className="cp-tree-name">{l1.name}</span>
                        </div>

                        {isExpanded && (
                          <div className="cp-tree-l2-list">
                            {l2List.map((l2) => {
                              const isL2Expanded = expandedL2 === l2.name
                              const hasL3 = (l2.children || []).length > 0
                              return (
                                <div key={l2.id}>
                                  <div
                                    className="cp-tree-l2"
                                    onClick={() => hasL3 ? handleToggleL2(l2.name) : null}
                                  >
                                    <span className={`cp-tree-expand ${isL2Expanded ? 'expanded' : ''}`}>
                                      {hasL3 ? '▶' : ''}
                                    </span>
                                    <span className="cp-tree-name">{l2.name}</span>
                                  </div>

                                  {isL2Expanded && (
                                    <div className="cp-tree-l3-list">
                                      {l3List.map((l3) => (
                                        <div
                                          key={l3.id}
                                          className="cp-tree-l3"
                                          onClick={() =>
                                            handleSelect({
                                              l1: { id: l1.id, name: l1.name },
                                              l2: { id: l2.id, name: l2.name },
                                              l3: { id: l3.id, name: l3.name },
                                            })
                                          }
                                        >
                                          <span className="cp-tree-selectable">{l3.name}</span>
                                        </div>
                                      ))}
                                      {/* + 新建三级 */}
                                      <div
                                        className="cp-tree-new"
                                        onClick={() => onCreateNew(l2.id, `「${l1.name} / ${l2.name}」下的分类`)}
                                      >
                                        + 新建
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                            {/* + 新建二级 */}
                            <div
                              className="cp-tree-new cp-tree-new-l2"
                              onClick={() => onCreateNew(l1.id, `「${l1.name}」下的分类`)}
                            >
                              + 新建
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {/* + 新建一级 */}
                  <div
                    className="cp-tree-new"
                    onClick={() => onCreateNew(null, '一级分类')}
                  >
                    + 新建
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
