import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ShopProvider, useShop } from './context/ShopContext'
import Layout from './components/Layout'
import Home from './pages/Home'
import Menu from './pages/Menu'
import Auth from './pages/Auth'
import Checkout from './pages/Checkout'
import Orders from './pages/Orders'
import Profile from './pages/Profile'
import Admin from './pages/Admin'
import AdminLogin from './pages/AdminLogin'
import { EmptyState } from './components/ui'

function RequireCustomer({ children }) {
  const { user, profile, authLoading, authError } = useShop()
  const location = useLocation()
  if (authLoading) return <div className="container page"><p role="status">Getting your account ready…</p></div>
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  if (authError || !profile) return <div className="container page"><EmptyState title="We couldn’t load your account" detail={authError || 'Please sign out and sign in again.'} to="/login" action="Go to account" /></div>
  if (profile.role === 'admin') return <Navigate to="/admin" replace />
  return children
}
function RequireAdmin({ children }) {
  const { user, profile, authLoading, authError } = useShop()
  if (authLoading) return <div className="container page"><p role="status">Checking admin access…</p></div>
  if (!user) return <Navigate to="/admin/login" replace />
  if (authError || !profile) return <div className="container page"><EmptyState title="Account unavailable" detail={authError || 'Please sign in again.'} to="/admin/login" action="Admin sign in" /></div>
  if (profile.role !== 'admin') return <Navigate to="/admin/login" replace />
  return children
}
function StoreRoutes() {
  const { pathname, hash, search } = useLocation()
  useEffect(() => {
    if (hash) window.requestAnimationFrame(() => document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    else window.scrollTo(0, 0)
  }, [pathname, hash])
  const routes = <Routes>
    <Route path="/" element={<Home />} /><Route path="/menu" element={<Menu />} />
    <Route path="/bag" element={<Navigate to="/?bag=open" replace />} /><Route path="/login" element={<Auth key="login" />} /><Route path="/register" element={<Auth key="register" register />} />
    <Route path="/checkout" element={<RequireCustomer><Checkout /></RequireCustomer>} />
    <Route path="/orders" element={<RequireCustomer><Orders /></RequireCustomer>} />
    <Route path="/profile" element={<RequireCustomer><Profile /></RequireCustomer>} />
    <Route path="/about" element={<Navigate to="/#about" replace />} /><Route path="/gallery" element={<Navigate to="/#gallery" replace />} /><Route path="/contact" element={<Navigate to="/#contact" replace />} />
    <Route path="/admin/login" element={<AdminLogin />} />
    <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
    <Route path="*" element={<div className="container page"><EmptyState title="Page not found" detail="The requested page does not exist." to="/" action="Back home" /></div>} />
  </Routes>
  return pathname.startsWith('/admin') ? routes : <Layout key={hash || search}>{routes}</Layout>
}
export default function App() { return <ShopProvider><StoreRoutes /></ShopProvider> }
