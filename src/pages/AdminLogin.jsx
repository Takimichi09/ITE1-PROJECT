import { ArrowRight, Coffee, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useShop } from '../context/ShopContext'
import { supabase } from '../lib/supabase'
import { Field } from '../components/ui'
import { photos } from '../data/catalog'

export default function AdminLogin() {
  const { user, profile, authLoading, signOut } = useShop()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!authLoading && user && profile?.role === 'admin') navigate('/admin', { replace: true })
  }, [authLoading, navigate, profile, user])

  async function submit(event) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      if (!supabase) throw new Error('The shop is not connected to Supabase.')
      if (user) await signOut()
      const { data, error: cause } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
      if (cause) throw cause
      const { data: adminProfile, error: profileError } = await supabase.from('profiles').select('role').eq('id', data.user.id).single()
      if (profileError) throw profileError
      if (adminProfile.role !== 'admin') {
        await supabase.auth.signOut()
        throw new Error('This account does not have administrator access.')
      }
      navigate('/admin', { replace: true })
    } catch (cause) {
      setError(cause.message || 'Could not sign in to the admin workspace.')
    } finally { setBusy(false) }
  }

  return <section className="auth-page container"><div className="auth-visual"><img src={photos.cafe} alt="Coffee shop interior" /><div><span className="auth-coffee-mark"><Coffee size={32} /></span><p className="eyebrow">STAFF ACCESS ONLY</p><h2>Run the shop.<br /><em>Keep things moving.</em></h2><p>Manage the menu, customer orders, gallery, and storefront details.</p></div></div><div className="auth-form-wrap"><Link className="back-link" to="/">← Back to the storefront</Link><p className="eyebrow">ADMIN WORKSPACE</p><h1>Staff <em>sign in.</em></h1><p className="auth-intro">Use the email address and password assigned to your Supabase admin account.</p><form className="auth-form" onSubmit={submit}><Field label="Admin email"><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@yourbusiness.com" required /></Field><Field label="Password"><div className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required /><button className="icon-button" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></Field>{error && <p className="error-panel" role="alert">{error}</p>}<button className="button primary full" disabled={busy || authLoading}>{busy ? 'Checking access…' : 'Open admin workspace'}<ArrowRight size={18} /></button></form><p className="secure-note"><LockKeyhole size={13} />Admin accounts are created and managed in Supabase.</p></div></section>
}
