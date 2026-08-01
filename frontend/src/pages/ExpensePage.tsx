import { useState, useEffect, useCallback, type FormEvent } from 'react'
import axios from 'axios'
import {
  fetchExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  fetchCategories,
  createCategory,
  type Expense,
  type ExpenseCategory,
  type CreateExpensePayload,
} from '../services/api'
import BottomPanel from '../components/BottomPanel'
import './ExpensePage.css'

const PAGE_SIZE = 20

export default function ExpensePage() {
  // ── 表单状态 ──
  const [amount, setAmount] = useState('')
  const [selectedL1, setSelectedL1] = useState('')
  const [selectedL2, setSelectedL2] = useState('')
  const [selectedL3, setSelectedL3] = useState('')
  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().slice(0, 10),
  )
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  // ── 分类数据 ──
  const [categories, setCategories] = useState<ExpenseCategory[]>([])

  // ── 列表数据 ──
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  // ── 快速创建分类弹窗 ──
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [quickCreateName, setQuickCreateName] = useState('')
  const [quickCreateParentId, setQuickCreateParentId] = useState<number | null>(null)
  const [quickCreateLabel, setQuickCreateLabel] = useState('')

  // ── 底部面板 ──
  const [showPanel, setShowPanel] = useState(false)

  // ── 左滑状态 ──
  const [swipedId, setSwipedId] = useState<number | null>(null)
  const [touchStartX, setTouchStartX] = useState(0)
  const [touchTranslateX, setTouchTranslateX] = useState(0)

  // 加载分类
  const loadCategories = useCallback(async () => {
    try {
      const cats = await fetchCategories()
      setCategories(cats)
    } catch {
      // 静默失败
    }
  }, [])

  // 加载列表
  const loadExpenses = useCallback(
    async (pageNum = 1) => {
      setLoading(true)
      try {
        const data = await fetchExpenses(pageNum, PAGE_SIZE)
        setTotal(data.total)
        if (pageNum === 1) {
          setExpenses(data.items)
        } else {
          setExpenses((prev) => [...prev, ...data.items])
        }
        setPage(pageNum)
      } catch {
        // 静默
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    loadCategories()
    loadExpenses()
  }, [loadCategories, loadExpenses])

  // 派生选项
  const l1Options = categories

  const l2Options =
    selectedL1
      ? categories.find((c) => c.name === selectedL1)?.children || []
      : []

  const l3Options =
    selectedL1 && selectedL2
      ? categories
          .find((c) => c.name === selectedL1)
          ?.children.find((c) => c.name === selectedL2)?.children || []
      : []

  // 选择分类时重置下级
  function handleL1Change(val: string) {
    if (val === '__new__') {
      openQuickCreate(null, '一级分类')
      return
    }
    setSelectedL1(val)
    setSelectedL2('')
    setSelectedL3('')
  }

  function handleL2Change(val: string) {
    if (val === '__new__') {
      const parent = categories.find((c) => c.name === selectedL1)
      if (parent) openQuickCreate(parent.id, '二级分类')
      return
    }
    setSelectedL2(val)
    setSelectedL3('')
  }

  function handleL3Change(val: string) {
    if (val === '__new__') {
      const parent = categories.find((c) => c.name === selectedL1)
      const l2 = parent?.children.find((c) => c.name === selectedL2)
      if (l2) openQuickCreate(l2.id, '三级分类')
      return
    }
    setSelectedL3(val)
  }

  function openQuickCreate(parentId: number | null, label: string) {
    setQuickCreateParentId(parentId)
    setQuickCreateLabel(label)
    setQuickCreateName('')
    setQuickCreateOpen(true)
  }

  async function handleQuickCreate() {
    if (!quickCreateName.trim()) return
    try {
      await createCategory({
        name: quickCreateName.trim(),
        parent_id: quickCreateParentId ?? undefined,
      })
      setQuickCreateOpen(false)
      await loadCategories()
    } catch (err: unknown) {
      let msg = '创建失败'
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        msg = err.response.data.detail
      }
      alert(msg)
    }
  }

  // 编辑：回填表单
  function handleEdit(exp: Expense) {
    setEditingId(exp.id)
    setAmount(exp.amount.toString())
    setSelectedL1(exp.category_l1)
    setSelectedL2(exp.category_l2)
    setSelectedL3(exp.category_l3)
    setExpenseDate(exp.expense_date)
    setNote(exp.note || '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCancelEdit() {
    setEditingId(null)
    setAmount('')
    setSelectedL1('')
    setSelectedL2('')
    setSelectedL3('')
    setNote('')
    setExpenseDate(new Date().toISOString().slice(0, 10))
  }

  // 提交
  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const numAmount = Number(amount)
    if (!numAmount || numAmount <= 0) {
      alert('请输入有效金额')
      return
    }
    if (!selectedL1 || !selectedL2 || !selectedL3) {
      alert('请选择完整的三级分类')
      return
    }

    setSubmitting(true)
    try {
      const payload: CreateExpensePayload = {
        amount: numAmount,
        category_l1: selectedL1,
        category_l2: selectedL2,
        category_l3: selectedL3,
        expense_date: expenseDate,
        note: note || undefined,
      }
      if (editingId !== null) {
        await updateExpense(editingId, payload)
      } else {
        await createExpense(payload)
      }
      handleCancelEdit()
      await loadExpenses()
    } catch (err: unknown) {
      let msg = '操作失败'
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        msg = err.response.data.detail
      }
      alert(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // 删除
  async function handleDelete(id: number) {
    if (!window.confirm('确定要删除这条记录吗？')) return
    try {
      await deleteExpense(id)
      await loadExpenses()
    } catch (err: unknown) {
      let msg = '删除失败'
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        msg = err.response.data.detail
      }
      alert(msg)
    }
  }

  // 加载更多
  function handleLoadMore() {
    if (loading) return
    loadExpenses(page + 1)
  }

  // 左滑手势
  function handleTouchStart(e: React.TouchEvent, id: number) {
    setTouchStartX(e.touches[0].clientX)
    setSwipedId(id)
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (swipedId === null) return
    const dx = e.touches[0].clientX - touchStartX
    if (dx < 0) {
      setTouchTranslateX(Math.max(dx, -80))
    } else {
      setTouchTranslateX(0)
    }
  }

  function handleTouchEnd() {
    if (touchTranslateX < -40) {
      setTouchTranslateX(-80)
    } else {
      setTouchTranslateX(0)
      setSwipedId(null)
    }
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    return `${d.getMonth() + 1}月${d.getDate()}日`
  }

  const hasCategories = categories.length > 0

  return (
    <div className="expense-page">
      {/* 金额 */}
      <div className="amount-section">
        <div className="amount-input-wrapper">
          <span className="amount-yuan">¥</span>
          <input
            type="number"
            inputMode="decimal"
            className="amount-input"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      </div>

      {/* 分类级联 */}
      <div className="category-section">
        {!hasCategories ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p style={{ color: 'var(--text-dim)', fontSize: 14, marginBottom: 12 }}>
              还没有分类，先创建你的第一个分类吧
            </p>
            <button
              className="submit-btn-expense"
              style={{ width: 'auto', padding: '10px 24px' }}
              onClick={() => openQuickCreate(null, '一级分类')}
            >
              创建分类
            </button>
          </div>
        ) : (
          <>
            <div className="category-row">
              <select
                className="category-select"
                value={selectedL1}
                onChange={(e) => handleL1Change(e.target.value)}
              >
                <option value="">一级分类</option>
                {l1Options.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
                <option value="__new__">+ 新建</option>
              </select>
            </div>
            <div className="category-row">
              <select
                className="category-select"
                value={selectedL2}
                onChange={(e) => handleL2Change(e.target.value)}
                disabled={!selectedL1}
              >
                <option value="">二级分类</option>
                {l2Options.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
                {selectedL1 && <option value="__new__">+ 新建</option>}
              </select>
              <select
                className="category-select"
                value={selectedL3}
                onChange={(e) => handleL3Change(e.target.value)}
                disabled={!selectedL2}
              >
                <option value="">三级分类</option>
                {l3Options.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
                {selectedL2 && <option value="__new__">+ 新建</option>}
              </select>
            </div>
            {selectedL1 && (
              <div className="category-path">
                {selectedL1}
                {selectedL2 ? ` / ${selectedL2}` : ''}
                {selectedL3 ? ` / ${selectedL3}` : ''}
              </div>
            )}
          </>
        )}
      </div>

      {/* 日期 + 备注 */}
      <div className="meta-row">
        <input
          type="date"
          className="date-input"
          value={expenseDate}
          onChange={(e) => setExpenseDate(e.target.value)}
        />
        <input
          type="text"
          className="note-input"
          placeholder="备注（可选）"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {/* 提交 */}
      <div className="submit-section">
        <button
          className="submit-btn-expense"
          disabled={submitting}
          onClick={handleSubmit}
        >
          {submitting ? '提交中...' : editingId !== null ? '更新记录' : '记一笔'}
        </button>
        {editingId !== null && (
          <button className="cancel-edit-btn" onClick={handleCancelEdit}>
            取消编辑
          </button>
        )}
      </div>

      {/* 记录列表 */}
      <section className="expense-list-section">
        {!loading && expenses.length === 0 && (
          <div className="empty-state">还没记过账</div>
        )}

        {expenses.map((exp) => (
          <div
            key={exp.id}
            className="expense-item"
            onTouchStart={(e) => handleTouchStart(e, exp.id)}
            onTouchMove={handleTouchMove}
            onTouchEnd={() => handleTouchEnd()}
          >
            {swipedId === exp.id && touchTranslateX < 0 && (
              <div className="expense-swipe-bg">删除</div>
            )}
            <div
              className="expense-item-inner"
              style={{
                transform:
                  swipedId === exp.id
                    ? `translateX(${touchTranslateX}px)`
                    : 'translateX(0)',
              }}
            >
              <div className="expense-item-left">
                <div className="expense-item-category">
                  <span className="cat-l1">{exp.category_l1}</span>
                  <span className="cat-sep"> / </span>
                  <span className="cat-l2">{exp.category_l2}</span>
                  <span className="cat-sep"> / </span>
                  <span className="cat-l3">{exp.category_l3}</span>
                </div>
                <div className="expense-item-bottom">
                  <span>{formatDate(exp.expense_date)}</span>
                  {exp.note && <span>{exp.note}</span>}
                </div>
              </div>
              <span className="expense-item-amount">
                -¥{Number(exp.amount).toFixed(2)}
              </span>
              <div className="expense-item-actions">
                <button
                  className="expense-edit-btn"
                  onClick={() => handleEdit(exp)}
                >
                  编辑
                </button>
                <button
                  className="expense-delete-btn"
                  onClick={() => handleDelete(exp.id)}
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        ))}

        {loading && <div className="load-more-row">加载中...</div>}

        {expenses.length < total && !loading && (
          <div className="load-more-row">
            <button className="load-more-btn-expense" onClick={handleLoadMore}>
              加载更多 ({expenses.length}/{total})
            </button>
          </div>
        )}
      </section>

      {/* 快速创建弹窗 */}
      {quickCreateOpen && (
        <div
          className="quick-create-overlay"
          onClick={() => setQuickCreateOpen(false)}
        >
          <div
            className="quick-create-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>新建{quickCreateLabel}</h3>
            <input
              type="text"
              placeholder="输入分类名称"
              value={quickCreateName}
              onChange={(e) => setQuickCreateName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleQuickCreate()
                if (e.key === 'Escape') setQuickCreateOpen(false)
              }}
            />
            <div className="quick-create-actions">
              <button
                className="quick-create-cancel"
                onClick={() => setQuickCreateOpen(false)}
              >
                取消
              </button>
              <button className="quick-create-confirm" onClick={handleQuickCreate}>
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 底部浮动按钮 */}
      {!showPanel && (
        <button className="fab" onClick={() => setShowPanel(true)}>
          📊
        </button>
      )}

      {/* 底部面板 */}
      {showPanel && (
        <BottomPanel
          categories={categories}
          onCategoriesChange={loadCategories}
          onClose={() => setShowPanel(false)}
        />
      )}
    </div>
  )
}
