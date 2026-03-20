import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import LeadsPage from './pages/LeadsPage'
import AssignPage from './pages/AssignPage'
import FollowUpsPage from './pages/FollowUpsPage'
import ReportsPage from './pages/ReportsPage'
import UsersPage from './pages/UsersPage'
import SettingsPage from './pages/SettingsPage'
import ProductDashboardPage from './pages/ProductDashboardPage'
import EmailPage from './pages/EmailPage'
import ActivityPage from './pages/ActivityPage'
import ChatPage from './pages/ChatPage'
import PerformancePage from './pages/PerformancePage'

function PrivateRoute({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

function AdminRoute({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role_name !== 'admin') return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"   element={<DashboardPage />} />
          <Route path="leads"       element={<LeadsPage />} />
          <Route path="followups"   element={<FollowUpsPage />} />
          <Route path="assign"      element={<AdminRoute><AssignPage /></AdminRoute>} />
          <Route path="reports"     element={<ReportsPage />} />
          <Route path="products"    element={<ProductDashboardPage />} />
          <Route path="users"       element={<AdminRoute><UsersPage /></AdminRoute>} />
          <Route path="settings"    element={<AdminRoute><SettingsPage /></AdminRoute>} />
          <Route path="email"       element={<EmailPage />} />
          <Route path="activities"  element={<ActivityPage />} />
          <Route path="chat"        element={<ChatPage />} />
          <Route path="performance" element={<PerformancePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  )
}
