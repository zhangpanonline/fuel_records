import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  createCategory,
  updateCategory,
  deleteCategory,
  fetchExpenseStats,
  type ExpenseCategory,
  type BreakdownItem,
} from '../services/api'
import './BottomPanel.css'

interface BottomPanelProps {
  categories: ExpenseCategory[]
  onCategoriesChange: () => void
  onClose: () => void
}

type PanelTab = 'categories' | 'stats'

/* ================================================================
   CategoryNode — 可展开分类节点（支持内联编辑/添加子分类/删除）
   ================================================================ */
function CategoryNode({
  cat,
  depth,
  onRefresh,
}: {
  cat: ExpenseCategory
  depth: number
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(cat.name)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  async function handleSaveEdit() {
    if (!editName.trim() || editName === cat.name) {
      setEditing(false)
      return
    }
    try {
      await updateCategory(cat.id, { name: editName.trim() })
      setEditing(false)
      onRefresh()
    } catch (err: unknown) {
      let msg = '修改失败'
      if (axios.isAxiosError(err) && err.response?.data?.detail) msg = err.response.data.detail
      alert(msg)
    }
  }

  async function handleAddChild() {
    if (!newName.trim()) return
    try {
      await createCategory({ name: newName.trim(), parent_id: cat.id })
      setAdding(false)
      setNewName('')
      onRefresh()
    } catch (err: unknown) {
      let msg = '创建失败'
      if (axios.isAxiosError(err) && err.response?.data?.detail) msg = err.response.data.detail
      alert(msg)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`确定要删除分类"${cat.name}"吗？`)) return
    try {
      await deleteCategory(cat.id)
      onRefresh()
    } catch (err: unknown) {
      let msg = '删除失败'
      if (axios.isAxiosError(err) && err.response?.data?.detail) msg = err.response.data.detail
      alert(msg)
    }
  }

  const canAddChild = cat.level < 3

  return (
    <div className="category-node">
      <div className="category-node-header">
        <span className="category-node-expand" onClick={() => setExpanded(!expanded)}>
          {cat.children.length > 0 ? (expanded ? '▼' : '▶') : '  '}
        </span>
        {editing ? (
          <div className="inline-edit">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit()
                if (e.key === 'Escape') setEditing(false)
              }}
              autoFocus
            />
            <button className="inline-edit-save" onClick={handleSaveEdit}>保存</button>
            <button className="inline-edit-cancel" onClick={() => setEditing(false)}>取消</button>
          </div>
        ) : (
          <>
            <span className="category-node-name">{cat.name}</span>
            <div className="category-node-actions">
              <button onClick={() => { setEditName(cat.name); setEditing(true) }}>重命名</button>
              <button onClick={handleDelete}>删除</button>
            </div>
          </>
        )}
      </div>
      {expanded && (
        <div className="category-children">
          {cat.children.map((child) => (
            <CategoryNode key={child.id} cat={child} depth={depth + 1} onRefresh={onRefresh} />
          ))}
          {adding && (
            <div className="inline-edit">
              <input
                placeholder="子分类名称"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddChild()
                  if (e.key === 'Escape') setAdding(false)
                }}
                autoFocus
              />
              <button className="inline-edit-save" onClick={handleAddChild}>添加</button>
              <button className="inline-edit-cancel" onClick={() => setAdding(false)}>取消</button>
            </div>
          )}
          {canAddChild && !adding && (
            <button className="add-category-btn" onClick={() => setAdding(true)}>
              + 添加子分类
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* ================================================================
   CategoryManager — 分类管理面板
   ================================================================ */
function CategoryManager({
  categories,
  loading,
  onRefresh,
  onAddRoot,
}: {
  categories: ExpenseCategory[]
  loading: boolean
  onRefresh: () => void
  onAddRoot: () => void
}) {
  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>加载中...</div>

  return (
    <div className="category-tree">
      {categories.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontSize: 14 }}>
          还没有分类
        </div>
      )}
      {categories.map((cat) => (
        <CategoryNode key={cat.id} cat={cat} depth={0} onRefresh={onRefresh} />
      ))}
      <button className="add-category-btn" onClick={onAddRoot}>
        + 添加一级分类
      </button>
    </div>
  )
}

/* ================================================================
   StatsPanel — 统计面板
   ================================================================ */
function StatsPanel() {
  const [period, setPeriod] = useState('month')
  const [data, setData] = useState<{
    total_amount?: number
    record_count?: number
    avg_daily?: number
    category_breakdown?: BreakdownItem[]
  } | null>(null)
  const [loading, setLoading] = useState(true)

  function getDateRange(p: string): [string, string] {
    const now = new Date()
    const end = now.toISOString().slice(0, 10)
    let start = end
    if (p === 'month') {
      start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    } else if (p === 'year') {
      start = `${now.getFullYear()}-01-01`
    } else if (p === 'week') {
      const d = new Date(now)
      d.setDate(d.getDate() - 7)
      start = d.toISOString().slice(0, 10)
    }
    return [start, end]
  }

  async function loadStats() {
    setLoading(true)
    try {
      const [start, end] = getDateRange(period)
      const stats = await fetchExpenseStats(start, end, 'none')
      setData({
        total_amount: stats.total_amount ? Number(stats.total_amount) : 0,
        record_count: stats.record_count || 0,
        avg_daily: stats.avg_daily || 0,
        category_breakdown: stats.category_breakdown || [],
      })
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStats()
  }, [period])

  const periods = [
    { key: 'month', label: '本月' },
    { key: 'year', label: '本年' },
    { key: 'week', label: '近一周' },
  ]

  // 构建树形数据用于饼图展示（仅 L1 汇总）
  const l1Breakdown = (data?.category_breakdown || []).filter(
    (b) => b.category_l2 === null && b.category_l3 === null,
  )

  return (
    <div>
      <div className="stats-time-row">
        {periods.map((p) => (
          <button
            key={p.key}
            className={`stats-time-btn ${period === p.key ? 'active' : ''}`}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading && <div className="chart-placeholder">加载中...</div>}

      {!loading && data && (
        <>
          <div className="stats-summary">
            <div className="stats-card">
              <div className="stats-card-value">¥{data.total_amount?.toFixed(2)}</div>
              <div className="stats-card-label">总支出</div>
            </div>
            <div className="stats-card">
              <div className="stats-card-value">{data.record_count}</div>
              <div className="stats-card-label">笔数</div>
            </div>
            <div className="stats-card">
              <div className="stats-card-value">¥{data.avg_daily?.toFixed(2)}</div>
              <div className="stats-card-label">日均</div>
            </div>
            <div className="stats-card">
              <div className="stats-card-value">
                {data.category_breakdown && data.category_breakdown.length > 0
                  ? data.category_breakdown.filter((b) => b.category_l1).length
                  : 0}
              </div>
              <div className="stats-card-label">分类项</div>
            </div>
          </div>

          {/* L1 分类饼图文本版（等后面安装 recharts 完善） */}
          {l1Breakdown.length > 0 && (
            <>
              <h4 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
                一级分类占比
              </h4>
              {l1Breakdown.map((item) => (
                <div
                  key={item.category_l1}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                    {item.category_l1}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    ¥{Number(item.total).toFixed(2)} ({item.percentage}%)
                  </span>
                </div>
              ))}
            </>
          )}

          {l1Breakdown.length === 0 && (
            <div className="chart-placeholder">暂无数据</div>
          )}
        </>
      )}

      {!loading && !data && (
        <div className="chart-placeholder">加载失败，请重试</div>
      )}
    </div>
  )
}

/* ================================================================
   BottomPanel — 主容器
   ================================================================ */
export default function BottomPanel({
  categories,
  onCategoriesChange,
  onClose,
}: BottomPanelProps) {
  const [tab, setTab] = useState<PanelTab>('stats')
  const [addingRoot, setAddingRoot] = useState(false)
  const [newRootName, setNewRootName] = useState('')

  async function handleAddRoot() {
    if (!newRootName.trim()) return
    try {
      await createCategory({ name: newRootName.trim() })
      setNewRootName('')
      setAddingRoot(false)
      onCategoriesChange()
    } catch (err: unknown) {
      let msg = '创建失败'
      if (axios.isAxiosError(err) && err.response?.data?.detail) msg = err.response.data.detail
      alert(msg)
    }
  }

  // 锁定 body 滚动
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <div className="bottom-panel-overlay" onClick={onClose}>
      <div className="bottom-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <div className="panel-tabs">
            <button
              className={`panel-tab ${tab === 'stats' ? 'active' : ''}`}
              onClick={() => setTab('stats')}
            >
              统计
            </button>
            <button
              className={`panel-tab ${tab === 'categories' ? 'active' : ''}`}
              onClick={() => setTab('categories')}
            >
              分类管理
            </button>
          </div>
          <button className="panel-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="panel-body">
          {tab === 'categories' && (
            <CategoryManager
              categories={categories}
              loading={false}
              onRefresh={onCategoriesChange}
              onAddRoot={() => {
                setAddingRoot(true)
                setNewRootName('')
              }}
            />
          )}
          {tab === 'stats' && <StatsPanel />}
        </div>

        {/* 添加根分类弹窗 */}
        {addingRoot && (
          <div style={{ padding: '0 20px 20px' }} className="inline-edit">
            <input
              placeholder="一级分类名称"
              value={newRootName}
              onChange={(e) => setNewRootName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddRoot()
                if (e.key === 'Escape') setAddingRoot(false)
              }}
              autoFocus
            />
            <button className="inline-edit-save" onClick={handleAddRoot}>添加</button>
            <button className="inline-edit-cancel" onClick={() => setAddingRoot(false)}>取消</button>
          </div>
        )}
      </div>
    </div>
  )
}
