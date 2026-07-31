import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './App.tsx'
import LoginPage from './pages/LoginPage.tsx'
import StatsPage from './pages/StatsPage.tsx'
import ExpensePage from './pages/ExpensePage.tsx'
import Layout from './components/Layout.tsx'
import { isLoggedIn } from './services/api.ts'
import './index.css'

// 路由守卫组件：未登录 → 跳转登录页
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/fuel" element={<App />} />
          <Route path="/fuel/stats" element={<StatsPage />} />
          <Route path="/expense" element={<ExpensePage />} />
          {/* 旧路由兼容重定向 */}
          <Route path="/" element={<Navigate to="/fuel" replace />} />
          <Route path="/stats" element={<Navigate to="/fuel/stats" replace />} />
          <Route path="*" element={<Navigate to="/fuel" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
