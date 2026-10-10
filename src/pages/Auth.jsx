import { ArrowRight, Coffee, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useShop } from '../context/ShopContext'
import { supabase } from '../lib/supabase'
import { safeNext, validateCustomer } from '../lib/shop'
import { normalizeUsername, usernameToEmail } from '../lib/username'
import { CustomerFields, Field } from '../components/ui'
import { photos } from '../data/catalog'

export default function Auth({ register = false }) {
  const { user, authLoading, authError, signOut } = useShop()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const navigate = useNavigate()
  const [values, setValues] = useState({ full_name: '', contact: '', username: '', password: '', confirm: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const change = (event) => setValues((current) => ({ ...current, [event.target.name]: event.target.value }))
  if (user && !authLoading && !authError) return <Navigate to={next} replace />

  async function submit(event) {
    event.preventDefault(); setError('')
    if (!supabase) { setError('The shop is not connected to Supabase.'); return }
    let username
    try { username = normalizeUsername(values.username) }
    catch (cause) { setError(cause.message); return }
    if (register) {
      const validation = validateCustomer(values)
      if (validation) { setError(validation); return }
      if (values.password.length < 8) { setError('Use a password with at least 8 characters.'); return }
      if (values.password !== values.confirm) { setError('Your passwords do not match.'); return }
    }
    setBusy(true)
    try {
      if (register) {
        const url = String(import.meta.env.VITE_SUPABASE_URL).replace(/\/$/, '')
        const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } })
        if (!response.ok) throw new Error('Could not check the account settings. Please try again.')
        const settings = await response.json()
        if (!settings.mailer_autoconfirm) throw new Error('Username registration needs Confirm Email turned off in Supabase Authentication → Providers → Email.')
        const { data, error: cause } = await supabase.auth.signUp({
          email: usernameToEmail(username),
          password: values.password,
          options: { data: { username, full_name: values.full_name.trim(), contact: values.contact.replace(/[\s()-]/g, '') } },
        })
        if (cause) throw cause
        if (!data.session) throw new Error('The account was created without a session. Check the Supabase email confirmation setting.')
      } else {
        const { data, error: cause } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password: values.password })
        if (cause) throw cause
        const { data: signedInProfile, error: profileError } = await supabase.from('profiles').select('role').eq('id', data.user.id).single()
        if (profileError) {
          await supabase.auth.signOut()
          throw new Error('We could not verify this customer account.')
        }
        if (signedInProfile.role !== 'customer') {
          await supabase.auth.signOut()
          throw new Error('Administrator accounts must use the separate admin sign-in page.')
        }
      }
      navigate(next, { replace: true })
    } catch (cause) { setError(cause.message || 'We couldn’t access your account. Please try again.') }
    finally { setBusy(false) }
  }

  const switchPath = `${register ? '/login' : '/register'}?next=${encodeURIComponent(next)}`
  return <section className="auth-page container"><div className="auth-visual"><img src={photos.cafe} alt="Warm café interior" /><div><span className="auth-coffee-mark"><Coffee size={32} /></span><p className="eyebrow">A FAMILIAR PLACE. A FRESH START.</p><h2>Your daily cup.<br /><em>Your little corner.</em></h2><p>Good coffee and good moments are better when they’re yours.</p></div></div><div className="auth-form-wrap"><Link className="back-link" to="/menu">← Back to the good stuff</Link><p className="eyebrow">{register ? 'MAKE YOURSELF AT HOME' : 'GOOD TO SEE YOU AGAIN'}</p><h1>{register ? <>Join the <em>daily ritual.</em></> : <>Welcome <em>back.</em></>}</h1><p className="auth-intro">{next === '/checkout' ? 'Your bag is saved. Sign in or register to finish your order.' : register ? 'Choose a username and password to create your account.' : 'Log in with your username and password.'}</p>
    {authError && <div className="error-panel" role="alert">{authError}<button className="text-button" onClick={async () => { try { await signOut() } catch { setError('Please try signing out again.') } }}>Sign out and retry</button></div>}
    <form onSubmit={submit} className="auth-form">
      {register && <CustomerFields values={values} onChange={change} />}
      <Field label="Username" hint={register ? '3–24 letters, numbers, or underscores. Start with a letter.' : undefined}><input name="username" type="text" autoComplete="username" placeholder="your_username" value={values.username} onChange={change} required minLength={3} maxLength={24} /></Field>
      <Field label="Password" hint={register ? 'At least 8 characters.' : undefined}><div className="password-field"><input name="password" type={showPassword ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} placeholder={register ? 'Create your password' : 'Enter your password'} value={values.password} onChange={change} minLength={register ? 8 : undefined} maxLength={128} required /><button className="icon-button" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></Field>
      {register && <Field label="Confirm password"><input name="confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={values.confirm} onChange={change} required placeholder="One more time" maxLength={128} /></Field>}
      {error && <p className="error-panel" role="alert">{error}</p>}
      <button className="button primary full" disabled={busy || !supabase || authLoading}>{busy ? 'Just a moment…' : register ? 'Create account' : 'Log in'}<ArrowRight size={18} /></button>
    </form><p className="auth-switch">{register ? 'Already part of the daily ritual?' : 'New around here?'} <Link to={switchPath}>{register ? 'Log in' : 'Create an account'}</Link></p><p className="secure-note"><LockKeyhole size={13} />Your bag stays with you when you sign in.</p></div></section>
}
