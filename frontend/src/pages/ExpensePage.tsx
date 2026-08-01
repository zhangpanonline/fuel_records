import { useState, useCallback, useRef, type FormEvent } from 'react'
import axios from 'axios'
import {
  createExpense,
  updateExpense,
  deleteExpense,
  createCategory,
  type Expense,
  type ExpenseCategory,
  type CreateExpensePayload,
} from '../services/api'
import { useExpenseData } from '../context/ExpenseDataContext'
import CategoryPicker, {
  recordCategorySelected,
  incrementCategoryCount,
  decrementCategoryCount,
} from '../components/CategoryPicker'
import ExpenseSummaryCards from '../components/ExpenseSummaryCards'
import PullToRefresh from '../components/PullToRefresh'
import ExpensePageSkeleton from '../components/ExpensePageSkeleton'
import './ExpensePage.css'

export default function ExpensePage() {
  const {
    categories,
    expenses,
    total,
    page,
    loading,
    multiSummary,
    refreshCategories,
    refreshExpenses,
    refreshMultiSummary,
    loadMoreExpenses,
  } = useExpenseData()

  // ── 表单状态 ──
  const [amount, setAmount] = useState('')
  const [selectedL1, setSelectedL1] = useState('')
  const [selectedL2, setSelectedL2] = useState('')
  const [selectedL3, setSelectedL3] = useState('')
  const [selectedL1Id, setSelectedL1Id] = useState(0)
  const [selectedL2Id, setSelectedL2Id] = useState(0)
  const [selectedL3Id, setSelectedL3Id] = useState(0)
  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().slice(0, 10),
  )
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  // ── 快速创建分类弹窗 ──
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)

  // ── 首次加载追踪 ──
  const firstLoadDone = useRef(false)
  if (!loading && !firstLoadDone.current) {
    firstLoadDone.current = true
  }

  const showSkeleton = loading && !firstLoadDone.current

  const handlePullRefresh = useCallback(async () => {
    await refreshExpenses(1)
    refreshMultiSummary()
  }, [refreshExpenses, refreshMultiSummary])
  const [quickCreateName, setQuickCreateName] = useState('')
  const [quickCreateParentId, setQuickCreateParentId] = useState<number | null>(null)
  const [quickCreateLabel, setQuickCreateLabel] = useState('')

  // ── 左滑状态 ──
  const [swipedId, setSwipedId] = useState<number | null>(null)
  const [touchStartX, setTouchStartX] = useState(0)
  const [touchTranslateX, setTouchTranslateX] = useState(0)

  // CategoryPicker 回调
  function handleCategorySelect(l1: string, l2: string, l3: string) {
    setSelectedL1(l1)
    setSelectedL2(l2)
    setSelectedL3(l3)
  }

  function handleCategorySelected(sel: { l1: string; l2: string; l3: string; l1Id: number; l2Id: number; l3Id: number }) {
    setSelectedL1Id(sel.l1Id)
    setSelectedL2Id(sel.l2Id)
    setSelectedL3Id(sel.l3Id)
    recordCategorySelected(sel)
  }

  // 根据分类名称查找 ID（用于删除时 -1 计数）
  const findCategoryIds = useCallback(
    (l1: string, l2: string, l3: string): { l1Id: number; l2Id: number; l3Id: number } | null => {
      const c1 = categories.find((c) => c.name === l1)
      if (!c1) return null
      const c2 = c1.children?.find((c) => c.name === l2)
      if (!c2) return null
      const c3 = c2.children?.find((c) => c.name === l3)
      if (!c3) return null
      return { l1Id: c1.id, l2Id: c2.id, l3Id: c3.id }
    },
    [categories],
  )

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
      await refreshCategories()
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
    setSelectedL1Id(0)
    setSelectedL2Id(0)
    setSelectedL3Id(0)
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
        // 仅新建时 +1 计数
        incrementCategoryCount(selectedL1Id, selectedL2Id, selectedL3Id)
      }
      handleCancelEdit()
      await refreshExpenses()
      refreshMultiSummary()
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
  async function handleDelete(id: number, exp: Expense) {
    if (!window.confirm('确定要删除这条记录吗？')) return
    try {
      // 先查找分类 ID（删除成功后再 -1）
      const ids = findCategoryIds(exp.category_l1, exp.category_l2, exp.category_l3)
      await deleteExpense(id)
      if (ids) {
        decrementCategoryCount(ids.l1Id, ids.l2Id, ids.l3Id)
      }
      await refreshExpenses()
      refreshMultiSummary()
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
    loadMoreExpenses()
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

  if (showSkeleton) {
    return <ExpensePageSkeleton />
  }

  return (
    <PullToRefresh onRefresh={handlePullRefresh} skeleton={<ExpensePageSkeleton />}>
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

      {/* 分类选择 */}
      <div className="category-section">
        <CategoryPicker
          categories={categories}
          selectedL1={selectedL1}
          selectedL2={selectedL2}
          selectedL3={selectedL3}
          onSelect={handleCategorySelect}
          onCategorySelected={handleCategorySelected}
          onCreateNew={openQuickCreate}
        />
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

      {/* 统计卡片 */}
      <ExpenseSummaryCards data={multiSummary} />

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
            <div
              className="expense-swipe-bg"
              style={{
                transform:
                  swipedId === exp.id
                    ? `translateX(${80 + touchTranslateX}px)`
                    : 'translateX(80px)',
              }}
              onClick={() => handleDelete(exp.id, exp)}
            >删除</div>
            <div
              className="expense-item-inner"
              style={{
                transform:
                  swipedId === exp.id
                    ? `translateX(${touchTranslateX}px)`
                    : 'translateX(0)',
              }}
            >
              {/* 第一行：分类 */}
              <div className="expense-item-category">
                <span className="cat-l1">{exp.category_l1}</span>
                <span className="cat-sep"> / </span>
                <span className="cat-l2">{exp.category_l2}</span>
                <span className="cat-sep"> / </span>
                <span className="cat-l3">{exp.category_l3}</span>
              </div>

              {/* 第二行：金额 + 编辑 */}
              <div className="expense-item-row2">
                <span className="expense-item-amount">
                  -¥{Number(exp.amount).toFixed(2)}
                </span>
                <button
                  className="expense-edit-btn"
                  onClick={() => handleEdit(exp)}
                >
                  编辑
                </button>
              </div>

              {/* 第三行：日期 + 备注 */}
              <div className="expense-item-row3">
                <span>{formatDate(exp.expense_date)}</span>
                {exp.note && <span>{exp.note}</span>}
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
    </div>
    </PullToRefresh>
  )
}
