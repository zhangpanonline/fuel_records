import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginPage from '../pages/LoginPage'
import { register, getCurrentUser } from '../services/api'

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
