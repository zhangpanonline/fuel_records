import { useState } from 'react'
import axios from 'axios'
import {
  createCategory,
  updateCategory,
  deleteCategory,
  type ExpenseCategory,
} from '../services/api'
import CategoryModal, { type ModalMode } from './CategoryModal'

/* 可展开的分类树节点，含重命名/添加子级/添加同级/删除 */

interface CategoryNodeProps {
  cat: ExpenseCategory
  depth: number
  onRefresh: () => void
  prefix?: string
  isLast?: boolean
}

export default function CategoryNode({
  cat,
  depth,
  onRefresh,
  prefix = '',
  isLast = false,
}: CategoryNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2)

  // ── 弹框状态 ──
  const [modalMode, setModalMode] = useState<ModalMode | null>(null)
  const [modalValue, setModalValue] = useState('')
  const [modalError, setModalError] = useState('')

  function closeModal() {
    setModalMode(null)
    setModalError('')
  }

  const canAddChild = cat.level < 3
  const showSiblingAdd = depth === 0 && cat.level === 1
  const childPrefix = depth === 0 ? '' : `${prefix}${isLast ? '  ' : '│ '}`
  const childBranch = showSiblingAdd ? '├' : '└'

  async function handleModalConfirm(name: string) {
    if (modalMode === 'rename') {
      if (name === cat.name) {
        closeModal()
        return
      }
      try {
        await updateCategory(cat.id, { name })
        closeModal()
        onRefresh()
      } catch (err: unknown) {
        let msg = '修改失败'
        if (axios.isAxiosError(err) && err.response?.data?.detail)
          msg = err.response.data.detail
        setModalError(msg)
      }
    } else if (modalMode === 'addChild') {
      try {
        await createCategory({ name, parent_id: cat.id })
        closeModal()
        onRefresh()
      } catch (err: unknown) {
        let msg = '创建失败'
        if (axios.isAxiosError(err) && err.response?.data?.detail)
          msg = err.response.data.detail
        setModalError(msg)
      }
    } else if (modalMode === 'addSibling') {
      try {
        await createCategory({ name })
        closeModal()
        onRefresh()
      } catch (err: unknown) {
        let msg = '创建失败'
        if (axios.isAxiosError(err) && err.response?.data?.detail)
          msg = err.response.data.detail
        setModalError(msg)
      }
    }
  }

  async function handleDelete() {
    if (!window.confirm(`确定要删除分类"${cat.name}"吗？`)) return
    try {
      await deleteCategory(cat.id)
      onRefresh()
    } catch (err: unknown) {
      let msg = '删除失败'
      if (axios.isAxiosError(err) && err.response?.data?.detail)
        msg = err.response.data.detail
      alert(msg)
    }
  }

  return (
    <div className="category-node">
      <div className="category-node-header">
        {depth > 0 && (
          <span className="category-node-lines">
            {prefix}
            {isLast ? '└── ' : '├── '}
          </span>
        )}
        <span
          className="category-node-expand"
          onClick={() => setExpanded(!expanded)}
        >
          {cat.children.length > 0 ? (expanded ? '▼' : '▶') : ''}
        </span>
        <span className="category-node-name">{cat.name}</span>
        <div className="category-node-actions">
          <button
            onClick={() => {
              setModalValue(cat.name)
              setModalMode('rename')
            }}
          >
            重命名
          </button>
          <button onClick={handleDelete}>删除</button>
        </div>
      </div>
      {expanded && (
        <div className="category-children">
          {cat.children.map((child, i) => (
            <CategoryNode
              key={child.id}
              cat={child}
              depth={depth + 1}
              onRefresh={onRefresh}
              prefix={childPrefix}
              isLast={
                i === cat.children.length - 1 &&
                !canAddChild &&
                !showSiblingAdd
              }
            />
          ))}
          {canAddChild && (
            <div className="category-add-row">
              <span className="category-node-lines">{childPrefix}</span>
              <span className="category-node-branch">{childBranch}</span>
              <span className="category-add-line" />
              <button
                className="add-category-btn"
                onClick={() => {
                  setModalValue('')
                  setModalMode('addChild')
                }}
                data-add-level={cat.level + 1}
              >
                + 添加{cat.level + 1}级分类
              </button>
            </div>
          )}
          {showSiblingAdd && (
            <div className="category-add-row">
              <span className="category-node-lines">{childPrefix}</span>
              <span className="category-node-branch">└</span>
              <span className="category-add-line" />
              <button
                className="add-category-btn"
                data-add-level="1"
                onClick={() => {
                  setModalValue('')
                  setModalMode('addSibling')
                }}
              >
                + 添加1级分类
              </button>
            </div>
          )}
        </div>
      )}

      {modalMode && (
        <CategoryModal
          title={
            modalMode === 'rename'
              ? '重命名分类'
              : modalMode === 'addSibling'
                ? '添加1级分类'
                : `添加${cat.level + 1}级分类`
          }
          initialValue={modalValue}
          error={modalError}
          onClose={closeModal}
          onConfirm={handleModalConfirm}
        />
      )}
    </div>
  )
}
