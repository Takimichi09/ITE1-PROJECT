import { Check, LogOut, Save, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShop } from '../context/ShopContext'
import { AddressFields, CustomerFields, Field, PageHeading } from '../components/ui'
import { BARANGAYS } from '../lib/shop'

export default function Profile() {
  const { profile, saveProfile, signOut } = useShop()
  const [values, setValues] = useState({ full_name: profile?.full_name || '', contact: profile?.contact || '', address_line: profile?.address_line || '', barangay: profile?.barangay || '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const navigate = useNavigate()
  const change = (event) => { setValues((current) => ({ ...current, [event.target.name]: event.target.value })); setSaved(false) }
  async function submit(event) {
    event.preventDefault(); setError(''); setSaved(false)
    if (values.barangay && !BARANGAYS.includes(values.barangay)) { setError('Please choose a Caloocan barangay.'); return }
    if (Boolean(values.address_line.trim()) !== Boolean(values.barangay)) { setError('Save both your address and barangay, or leave both blank.'); return }
    setBusy(true)
    try { await saveProfile(values); setSaved(true) }
    catch (cause) { setError(cause.message || 'We couldn’t save your profile.') }
    finally { setBusy(false) }
  }
  async function logout() {
    setBusy(true)
    try { await signOut(); navigate('/') } catch { setError('We couldn’t sign out. Please try again.'); setBusy(false) }
  }
  return <div className="container page"><PageHeading eyebrow="YOUR OWN LITTLE CORNER" title={<>Hello, <em>{profile?.full_name?.split(' ')[0] || 'coffee friend'}.</em></>} description="Keep your details up to date for a smoother coffee run." /><div className="profile-layout"><aside className="profile-card"><div className="profile-avatar"><UserRound size={40} strokeWidth={1.4} /></div><h2>{profile?.full_name || 'Coffee Friend'}</h2><p>@{profile?.username}</p><span className="pill">{profile?.role === 'admin' ? 'Admin' : 'Customer'}</span><button className="text-button" onClick={logout} disabled={busy}><LogOut size={16} />Sign out</button></aside><form className="profile-form" onSubmit={submit}><fieldset disabled={busy}><legend className="sr-only">Edit your profile</legend><section className="form-section"><h2>Your details</h2><p className="form-description">The basics for getting your order to you.</p><CustomerFields values={values} onChange={change} /><Field label="Username" hint="Your username is used to sign in."><input type="text" value={profile?.username || ''} readOnly /></Field></section><section className="form-section"><h2>Saved delivery address</h2><p className="form-description">Optional. We’ll fill this in next time you choose drop off. Only Caloocan City addresses are supported.</p><AddressFields values={values} onChange={change} required={false} /></section>{error && <p className="error-panel" role="alert">{error}</p>}{saved && <p className="success-panel" role="status"><Check size={17} />Your profile has been saved.</p>}<button className="button primary" type="submit" disabled={busy}><Save size={17} />{busy ? 'Saving…' : 'Save changes'}</button></fieldset></form></div></div>
}
