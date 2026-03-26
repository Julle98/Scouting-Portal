import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import { ErrorBoundary } from "./components/ui/ErrorBoundary"
import LoadingScreen from "./pages/LoadingScreen"
import LoginPage from "./pages/LoginPage"
import MainLayout from "./pages/MainLayout"

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen message="Tarkistetaan kirjautumista..." />
  if (!user)   return <Navigate to="/kirjaudu" replace />
  return children
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/kirjaudu" element={<LoginPage />} />
            <Route path="/*" element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            } />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}