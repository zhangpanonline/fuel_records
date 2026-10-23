import { useState, useEffect, useCallback } from 'react'
import {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  type ExpenseCategory,
} from '../services/api'
import CategoryModal from '../components/CategoryModal'
import './CategoryManagePage.css'

type ModalMode = 'rename' | 'addChild' | 'addSibling' | 'addRoot'

interface ModalState {
  mode: ModalMode
  targetId: number | null
  title: string
  initialValue: string
}

/** 取出后端返回的错误详情，便于直接展示给用户 */
function errMsg(err: unknown): string {
  const e = err as { response?: { data?: { detail?: string } } }
  return e?.response?.data?.detail || '操作失败，请稍后重试'
}

/** 在分类树中查找指定节点的父分类 ID，用于「添加同级」 */
function findParentId(tree: ExpenseCategory[], targetId: number): number | null {
  for (const node of tree) {
    if (node.children?.some((c) => c.id === targetId)) return node.id
    const found = findParentId(node.children ?? [], targetId)
    if (found !== null) return found
  }
  return null
}

export default function CategoryManagePage() {
  const [tree, setTree] = useState<ExpenseCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [error, setError] = useState('')
  const [openIds, setOpenIds] = useState<number[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchCategories()
      setTree(data)
      // 首次进入默认展开所有一级分类
      setOpenIds((prev) => (prev.length ? prev : data.map((c) => c.id)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function toggle(id: number) {
    setOpenIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function isOpen(id: number) {
    return openIds.includes(id)
  }

  async function handleConfirm(name: string) {
    if (!modal) return
    setError('')
    try {
      if (modal.mode === 'rename') {
        await updateCategory(modal.targetId!, { name })
      } else if (modal.mode === 'addChild') {
        await createCategory({ name, parent_id: modal.targetId! })
      } else if (modal.mode === 'addSibling') {
        const parentId = findParentId(tree, modal.targetId!)
        await createCategory({ name, parent_id: parentId ?? undefined })
      } else {
        await createCategory({ name })
      }
      setModal(null)
      await load()
    } catch (err) {
      setError(errMsg(err))
    }
  }

  async function handleDelete(cat: ExpenseCategory) {
    const childCount = cat.children?.length ?? 0
    const msg =
      childCount > 0
        ? `「${cat.name}」下还有 ${childCount} 个子分类，删除会一并移除，确定吗？`
        : `确定删除「${cat.name}」吗？`
    if (!window.confirm(msg)) return
    try {
      await deleteCategory(cat.id)
      await load()
    } catch (err) {
      alert(errMsg(err))
    }
  }

  function renderRow(cat: ExpenseCategory) {
    const hasChildren = (cat.children?.length ?? 0) > 0
    return (
      <div key={cat.id} className={`cat-node cat-node--l${cat.level}`}>
        <div className="cat-row">
          <span
            className={`cat-row-name ${hasChildren ? 'cat-row-name--toggle' : ''}`}
            onClick={() => hasChildren && toggle(cat.id)}
          >
            {hasChildren && (
              <span className="cat-caret">{isOpen(cat.id) ? '▾' : '▸'}</span>
            )}
            {cat.name}
          </span>
          <div className="cat-row-actions">
            <button
              className="cat-btn"
              onClick={() =>
                setModal({
                  mode: 'rename',
                  targetId: cat.id,
                  title: `重命名「${cat.name}」`,
                  initialValue: cat.name,
                })
              }
            >
              重命名
            </button>
            {cat.level < 3 && (
              <button
                className="cat-btn"
                onClick={() =>
                  setModal({
                    mode: 'addChild',
                    targetId: cat.id,
                    title: `在「${cat.name}」下新建子分类`,
                    initialValue: '',
                  })
                }
              >
                +子级
              </button>
            )}
            {cat.level > 1 && (
              <button
                className="cat-btn"
                onClick={() =>
                  setModal({
                    mode: 'addSibling',
                    targetId: cat.id,
                    title: `新建与「${cat.name}」同级的分类`,
                    initialValue: '',
                  })
                }
              >
                +同级
              </button>
            )}
            <button
              className="cat-btn cat-btn--danger"
              onClick={() => handleDelete(cat)}
            >
              删除
            </button>
          </div>
        </div>
        {hasChildren && isOpen(cat.id) && (
          <div className="cat-children">{cat.children.map(renderRow)}</div>
        )}
      </div>
    )
  }

  return (
    <div className="cat-manage">
      <div className="cat-manage-toolbar">
        <span className="cat-manage-hint">共 {tree.length} 个一级分类</span>
        <button
          className="cat-btn cat-btn--primary"
          onClick={() =>
            setModal({
              mode: 'addRoot',
              targetId: null,
              title: '新建一级分类',
              initialValue: '',
            })
          }
        >
          + 新建一级分类
        </button>
      </div>

      {loading && <div className="cat-loading">加载中...</div>}
      {!loading && tree.length === 0 && (
        <div className="cat-empty">还没有分类，先新建一个吧</div>
      )}
      {!loading && tree.length > 0 && (
        <div className="cat-tree">{tree.map(renderRow)}</div>
      )}

      {modal && (
        <CategoryModal
          title={modal.title}
          initialValue={modal.initialValue}
          error={error}
          onClose={() => {
            setModal(null)
            setError('')
          }}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  )
}
