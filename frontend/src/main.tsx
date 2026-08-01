import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import App from './App.tsx'
import LoginPage from './pages/LoginPage.tsx'
import StatsPage from './pages/StatsPage.tsx'
import ExpensePage from './pages/ExpensePage.tsx'
import ExpenseStatsPage from './pages/ExpenseStatsPage.tsx'
import Layout from './components/Layout.tsx'
import { FuelDataProvider } from './context/FuelDataContext.tsx'
import { ExpenseDataProvider } from './context/ExpenseDataContext.tsx'
import { isLoggedIn } from './services/api.ts'
import './index.css'
import type React from 'react'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

function DataProviders() {
  return (
    <ExpenseDataProvider>
      <FuelDataProvider>
        <Outlet />
      </FuelDataProvider>
    </ExpenseDataProvider>
  )
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
          <Route element={<DataProviders />}>
            <Route path="/expense" element={<ExpensePage />} />
            <Route path="/expense/stats" element={<ExpenseStatsPage />} />
            <Route path="/fuel" element={<App />} />
            <Route path="/fuel/stats" element={<StatsPage />} />
          </Route>
          <Route path="/" element={<Navigate to="/expense" replace />} />
          <Route path="/stats" element={<Navigate to="/fuel/stats" replace />} />
          <Route path="*" element={<Navigate to="/expense" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
