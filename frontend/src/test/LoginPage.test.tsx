import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginPage from '../pages/LoginPage'
import { register, login, getCurrentUser } from '../services/api'

// --- Mock axios (must be hoisted for vitest) ---
vi.mock('axios', () => {
  const instance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  }
  return {
    default: {
      create: () => instance,
      isAxiosError: (err: unknown) =>
        typeof err === 'object' && err !== null && 'isAxiosError' in err,
    },
  }
})

// --- Mock api module functions ---
vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    register: vi.fn(),
    login: vi.fn(),
    getCurrentUser: vi.fn(),
  }
})

// Helper: get the submit button (not the tab button)
function getSubmitBtn() {
  return document.querySelector('.submit-btn') as HTMLButtonElement
}

// --- Mock localStorage ---
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// --- Mock react-router-dom ---
vi.mock('react-router-dom', () => ({
  BrowserRouter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe('LoginPage - register 409 duplicate username', () => {
  let alertSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
  })

  it('shows error alert with duplicate username message on 409', async () => {
    render(<LoginPage />)

    // 1. Switch to register tab
    const registerTab = screen.getByText('注册')
    await userEvent.click(registerTab)

    // 2. Fill form
    await userEvent.type(screen.getByPlaceholderText('输入用户名'), 'alice')
    await userEvent.type(screen.getByPlaceholderText('至少 6 位密码'), 'pass123')
    await userEvent.type(screen.getByPlaceholderText('再次输入密码'), 'pass123')

    // 3. Mock 409 response
    vi.mocked(register).mockRejectedValueOnce({
      response: { data: { detail: '用户名 alice 已被注册' }, status: 409 },
      isAxiosError: true,
    })

    const submitBtn = getSubmitBtn()
    await userEvent.click(submitBtn)

    // 4. Verify alert contains the error message
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled()
      const msg = alertSpy.mock.calls[0][0] as string
      expect(msg).toContain('alice')
      expect(msg).toContain('已被注册')
    })
  })

  it('re-enables submit button after 409 error', async () => {
    render(<LoginPage />)

    const registerTab = screen.getByText('注册')
    await userEvent.click(registerTab)

    await userEvent.type(screen.getByPlaceholderText('输入用户名'), 'bob')
    await userEvent.type(screen.getByPlaceholderText('至少 6 位密码'), 'pass123')
    await userEvent.type(screen.getByPlaceholderText('再次输入密码'), 'pass123')

    vi.mocked(register).mockRejectedValueOnce({
      response: { data: { detail: '用户名 bob 已被注册' }, status: 409 },
      isAxiosError: true,
    })

    const submitBtn = getSubmitBtn()
    await userEvent.click(submitBtn)

    await waitFor(() => {
      expect(submitBtn).not.toBeDisabled()
      expect(submitBtn.textContent).toBe('注册')
    })
  })

  it('allows re-registration with different username after 409', async () => {
    render(<LoginPage />)

    const registerTab = screen.getByText('注册')
    await userEvent.click(registerTab)

    // First attempt: 409 conflict
    await userEvent.type(screen.getByPlaceholderText('输入用户名'), 'charlie')
    await userEvent.type(screen.getByPlaceholderText('至少 6 位密码'), 'pass123')
    await userEvent.type(screen.getByPlaceholderText('再次输入密码'), 'pass123')

    vi.mocked(register).mockRejectedValueOnce({
      response: { data: { detail: '用户名 charlie 已被注册' }, status: 409 },
      isAxiosError: true,
    })

    await userEvent.click(getSubmitBtn())
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled()
    })

    // Clear and try a different username
    const usernameInput = screen.getByPlaceholderText('输入用户名')
    await userEvent.clear(usernameInput)
    await userEvent.type(usernameInput, 'dave')

    // Second attempt: success (200)
    vi.mocked(register).mockResolvedValueOnce({ access_token: 'fake-jwt-token', token_type: 'bearer' })
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: 1, username: 'dave', email: 'dave@test.com',
      is_active: true,
    })

    await userEvent.click(getSubmitBtn())

    await waitFor(() => {
      expect(localStorage.getItem('fuel_records_token')).toBe('fake-jwt-token')
    })
  })
})

// ══════════════════════════════════════════════════════════════════
// 登录错误场景
// ══════════════════════════════════════════════════════════════════

describe('LoginPage - login error scenarios', () => {
  let alertSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
  })

  it('shows "用户名或密码错误" on wrong password', async () => {
    render(<LoginPage />)

    await userEvent.type(screen.getByPlaceholderText('输入用户名'), 'zp')
    await userEvent.type(screen.getByPlaceholderText('输入密码'), 'wrong')

    vi.mocked(login).mockRejectedValueOnce({
      response: { data: { detail: '用户名或密码错误' }, status: 400 },
      isAxiosError: true,
    })

    await userEvent.click(getSubmitBtn())

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('用户名或密码错误')
    })
  })

  it('shows "用户名或密码错误" on nonexistent user', async () => {
    render(<LoginPage />)

    await userEvent.type(screen.getByPlaceholderText('输入用户名'), 'nobody')
    await userEvent.type(screen.getByPlaceholderText('输入密码'), 'pass123')

    vi.mocked(login).mockRejectedValueOnce({
      response: { data: { detail: '用户名或密码错误' }, status: 400 },
      isAxiosError: true,
    })

    await userEvent.click(getSubmitBtn())

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('用户名或密码错误')
    })
  })

  it('shows fallback message on non-Axios network error', async () => {
    render(<LoginPage />)

    await userEvent.type(screen.getByPlaceholderText('输入用户名'), 'zp')
    await userEvent.type(screen.getByPlaceholderText('输入密码'), 'pass123')

    // 非 Axios 错误（网络断开等），没有 response 属性
    vi.mocked(login).mockRejectedValueOnce(new Error('Network Error'))

    await userEvent.click(getSubmitBtn())

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('操作失败，请稍后重试')
    })
  })

  it('re-enables submit button after login error', async () => {
    render(<LoginPage />)

    await userEvent.type(screen.getByPlaceholderText('输入用户名'), 'zp')
    await userEvent.type(screen.getByPlaceholderText('输入密码'), 'wrong')

    vi.mocked(login).mockRejectedValueOnce({
      response: { data: { detail: '用户名或密码错误' }, status: 400 },
      isAxiosError: true,
    })

    const submitBtn = getSubmitBtn()
    await userEvent.click(submitBtn)

    await waitFor(() => {
      expect(submitBtn).not.toBeDisabled()
      expect(submitBtn.textContent).toBe('登录')
    })
  })

  it('successful login stores token and redirects', async () => {
    // Mock window.location
    const locationRef = { href: '' }
    vi.stubGlobal('location', locationRef)

    render(<LoginPage />)

    await userEvent.type(screen.getByPlaceholderText('输入用户名'), 'zp')
    await userEvent.type(screen.getByPlaceholderText('输入密码'), 'pass123')

    vi.mocked(login).mockResolvedValueOnce({ access_token: 'real-jwt-token', token_type: 'bearer' })
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: 1, username: 'zp', email: null, is_active: true,
    })

    await userEvent.click(getSubmitBtn())

    await waitFor(() => {
      expect(localStorage.getItem('fuel_records_token')).toBe('real-jwt-token')
      expect(localStorage.getItem('fuel_user_cache')).toBeTruthy()
      expect(locationRef.href).toBe('/')
    })
  })

  it('login still succeeds even if getCurrentUser fails', async () => {
    const locationRef = { href: '' }
    vi.stubGlobal('location', locationRef)

    render(<LoginPage />)

    await userEvent.type(screen.getByPlaceholderText('输入用户名'), 'zp')
    await userEvent.type(screen.getByPlaceholderText('输入密码'), 'pass123')

    vi.mocked(login).mockResolvedValueOnce({ access_token: 'jwt-token', token_type: 'bearer' })
    vi.mocked(getCurrentUser).mockRejectedValueOnce(new Error('fail'))

    await userEvent.click(getSubmitBtn())

    await waitFor(() => {
      expect(localStorage.getItem('fuel_records_token')).toBe('jwt-token')
      expect(locationRef.href).toBe('/')
    })
  })
})

// ══════════════════════════════════════════════════════════════════
// 表单校验
// ══════════════════════════════════════════════════════════════════

describe('LoginPage - form validation', () => {
  let alertSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
  })

  it('shows "请填写用户名和密码" when submitting empty form in login mode', () => {
    render(<LoginPage />)

    const form = document.querySelector('.auth-form')!
    fireEvent.submit(form)

    expect(alertSpy).toHaveBeenCalledWith('请填写用户名和密码')
  })

  it('shows "请填写用户名和密码" when submitting empty form in register mode', async () => {
    render(<LoginPage />)

    await userEvent.click(screen.getByText('注册'))
    const form = document.querySelector('.auth-form')!
    fireEvent.submit(form)

    expect(alertSpy).toHaveBeenCalledWith('请填写用户名和密码')
  })

  it('shows "两次密码不一致" when confirm password does not match', async () => {
    render(<LoginPage />)

    await userEvent.click(screen.getByText('注册'))

    await userEvent.type(screen.getByPlaceholderText('输入用户名'), 'alice')
    await userEvent.type(screen.getByPlaceholderText('至少 6 位密码'), 'pass123')
    await userEvent.type(screen.getByPlaceholderText('再次输入密码'), 'different')

    await userEvent.click(getSubmitBtn())

    expect(alertSpy).toHaveBeenCalledWith('两次密码不一致')
  })

  it('does not show password mismatch when passwords match', async () => {
    const locationRef = { href: '' }
    vi.stubGlobal('location', locationRef)

    render(<LoginPage />)

    await userEvent.click(screen.getByText('注册'))

    await userEvent.type(screen.getByPlaceholderText('输入用户名'), 'alice')
    await userEvent.type(screen.getByPlaceholderText('至少 6 位密码'), 'pass123')
    await userEvent.type(screen.getByPlaceholderText('再次输入密码'), 'pass123')

    // 密码匹配，提交应通过前端校验
    vi.mocked(register).mockResolvedValueOnce({ access_token: 'token', token_type: 'bearer' })
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: 1, username: 'alice', email: null, is_active: true,
    })

    await userEvent.click(getSubmitBtn())

    // 未触发"两次密码不一致"
    expect(alertSpy).not.toHaveBeenCalledWith('两次密码不一致')
    // 通过了前端校验，token 已存储
    expect(localStorage.getItem('fuel_records_token')).toBe('token')
  })
})

// ══════════════════════════════════════════════════════════════════
// SettingsModal 与主题切换
// ══════════════════════════════════════════════════════════════════

describe('LoginPage - settings modal and theme toggle', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.spyOn(window, 'alert').mockImplementation(() => {})
  })

  it('opens settings modal when clicking gear button', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: 1, username: 'zp', email: null, is_active: true,
    })

    render(<LoginPage />)

    // 初始状态下 SettingsModal 不存在
    expect(screen.queryByText('退出登录')).not.toBeInTheDocument()

    // 点击 ⚙ 齿轮按钮
    const gearBtn = screen.getByTitle('数据源设置')
    await userEvent.click(gearBtn)

    // SettingsModal 弹出
    expect(screen.getByText('退出登录')).toBeInTheDocument()
    expect(screen.getByText('设置')).toBeInTheDocument()
    expect(screen.getByText('检查更新')).toBeInTheDocument()
  })

  it('closes settings modal when clicking overlay', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: 1, username: 'zp', email: null, is_active: true,
    })

    render(<LoginPage />)

    await userEvent.click(screen.getByTitle('数据源设置'))
    expect(screen.getByText('退出登录')).toBeInTheDocument()

    // 点击遮罩层关闭
    const overlay = document.querySelector('.settings-overlay')!
    await userEvent.click(overlay)

    expect(screen.queryByText('退出登录')).not.toBeInTheDocument()
  })

  it('cycles theme through auto → light → dark when clicking theme button', async () => {
    render(<LoginPage />)

    const themeBtn = screen.getByText('🌓')

    // auto → light
    await userEvent.click(themeBtn)
    expect(screen.getByText('☀️')).toBeInTheDocument()
    expect(localStorage.getItem('fuel_records_theme')).toBe('light')

    // light → dark
    await userEvent.click(themeBtn)
    expect(screen.getByText('🌙')).toBeInTheDocument()
    expect(localStorage.getItem('fuel_records_theme')).toBe('dark')

    // dark → auto
    await userEvent.click(themeBtn)
    expect(screen.getByText('🌓')).toBeInTheDocument()
    expect(localStorage.getItem('fuel_records_theme')).toBe('auto')
  })
})
