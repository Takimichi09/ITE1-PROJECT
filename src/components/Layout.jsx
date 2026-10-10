import { ArrowRight, ArrowUpRight, Check, Coffee, LogOut, Menu as MenuIcon, ShoppingBag, Trash2, UserRound, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useShop } from '../context/ShopContext'
import { SHOP_NAME } from '../data/catalog'
import { QuantityControl } from './ui'
import { calculateTotals, checkoutDestination, money } from '../lib/shop'

export function Brand() {
  const { storeSettings } = useShop()
  const name = storeSettings?.shop_name || SHOP_NAME
  return <Link className="brand" to="/" aria-label={`${name} home`}><span className="brand-icon"><Coffee size={25} strokeWidth={1.7} /></span><span>{name}<i>COFFEE & GOOD COMPANY</i></span></Link>
}
export default function Layout({ children }) {
  const { user, profile, bagCount, lines, notice, signOut, setNotice, setQuantity, storeSettings, catalogLoading, catalogError } = useShop()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [bagOpen, setBagOpen] = useState(() => new URLSearchParams(location.search).get('bag') === 'open')
  const [signingOut, setSigningOut] = useState(false)
  const unavailable = lines.some((line) => !line.available)
  const totals = calculateTotals(lines)
  useEffect(() => {
    if (!bagOpen) return undefined
    const close = (event) => { if (event.key === 'Escape') setBagOpen(false) }
    document.addEventListener('keydown', close)
    document.body.classList.add('drawer-open')
    return () => { document.removeEventListener('keydown', close); document.body.classList.remove('drawer-open') }
  }, [bagOpen])
  async function logout() {
    setSigningOut(true)
    try { await signOut(); setMobileOpen(false); setNotice('You have been signed out.') }
    catch { setNotice('Could not sign out. Please try again.') }
    finally { setSigningOut(false) }
  }
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <div className="announcement">{storeSettings?.announcement || 'Coffee, drinks, and baked goods'} <span>Caloocan delivery: ₱60 <ArrowUpRight size={12} /></span></div>
    <header className="site-header"><div className="container header-inner"><Brand />
      <nav className="desktop-nav" aria-label="Main navigation"><NavLink to="/" end>Home</NavLink><Link to="/#favorites">Menu</Link><Link to="/#about">About</Link><Link to="/#gallery">Gallery</Link><Link to="/#contact">Contact us</Link>{user && profile?.role !== 'admin' && <NavLink to="/orders">My orders</NavLink>}</nav>
      <div className="header-actions">{user ? <Link className="account-link" to="/profile"><UserRound size={18} /><span>{profile?.full_name?.split(' ')[0] || 'My account'}</span></Link> : <Link className="account-link" to="/login"><UserRound size={18} /><span>Log in</span></Link>}<button className="bag-link" type="button" onClick={() => setBagOpen(true)} aria-label={`Open bag with ${bagCount} items`} aria-expanded={bagOpen}><ShoppingBag size={19} /><span className="bag-text">Bag</span><span className="bag-count">{bagCount}</span></button><button className="icon-button mobile-toggle" aria-label={mobileOpen ? 'Close menu' : 'Open menu'} aria-expanded={mobileOpen} aria-controls="mobile-nav" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X /> : <MenuIcon />}</button></div>
    </div>{mobileOpen && <nav id="mobile-nav" className="mobile-nav" aria-label="Mobile navigation" onClick={() => setMobileOpen(false)}><Link to="/">Home</Link><Link to="/#favorites">Menu</Link><Link to="/#about">About</Link><Link to="/#gallery">Gallery</Link><Link to="/#contact">Contact us</Link>{user && profile?.role !== 'admin' && <><Link to="/orders">My orders</Link><Link to="/profile">My profile</Link></>}</nav>}</header>
    <main id="main" tabIndex="-1">{children}</main>
    <footer className="site-footer"><div className="container footer-main"><div><Brand /><p>Coffee shop ordering website.</p></div><div><h3>Shop</h3><Link to="/#favorites">Best sellers</Link><Link to="/menu">Full menu</Link><Link to="/#contact">Contact</Link></div><div><h3>Account</h3><Link to="/orders">Orders</Link><Link to="/profile">Profile</Link></div><div className="footer-note"><Coffee size={30} strokeWidth={1} /><p>Pickup or delivery<br /><em>in Caloocan.</em></p></div></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} {storeSettings?.shop_name || SHOP_NAME}. School project.</span>{user && <button className="text-button" onClick={logout} disabled={signingOut}><LogOut size={14} />{signingOut ? 'Signing out…' : 'Sign out'}</button>}</div></footer>
    <div className={`bag-drawer-backdrop ${bagOpen ? 'visible' : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setBagOpen(false) }} aria-hidden={!bagOpen}><aside className="bag-drawer" role="dialog" aria-modal="true" aria-labelledby="bag-drawer-title"><header><div><p className="eyebrow">ORDER SUMMARY</p><h2 id="bag-drawer-title">Bag <span>({bagCount})</span></h2></div><button className="icon-button" onClick={() => setBagOpen(false)} aria-label="Close bag"><X /></button></header>{lines.length ? <><div className="bag-drawer-lines">{lines.map((line) => <article key={line.id}>{line.image && <img src={line.image} alt="" />}<div><h3>{line.name}</h3><p>{line.detail}</p><b>{money(line.price)}</b>{!line.available && <small className="error-text">Unavailable</small>}<QuantityControl line={line} /></div><button className="icon-button drawer-remove" onClick={() => setQuantity(line.id, 0)} aria-label={`Remove ${line.name}`}><Trash2 size={16} /></button></article>)}</div><footer><div><span>Subtotal</span><strong>{money(totals.subtotal)}</strong></div><p>Select pickup or delivery at checkout.</p>{catalogError && <p className="error-text">{catalogError}</p>}{unavailable || catalogLoading || catalogError ? <button className="button primary full" disabled>{catalogLoading ? 'Checking menu…' : 'Remove unavailable items'}</button> : <Link className="button primary full" to={checkoutDestination(user)} onClick={() => setBagOpen(false)}>{user ? 'Checkout' : 'Log in to checkout'}<ArrowRight size={18} /></Link>}</footer></> : <div className="bag-drawer-empty"><Coffee size={39} /><h3>Your bag is empty</h3><p>Add a product from the menu.</p><Link className="button primary" to="/#favorites" onClick={() => setBagOpen(false)}>View best sellers</Link></div>}</aside></div>
    <div className={`toast ${notice ? 'visible' : ''}`} role="status" aria-live="polite">{notice && <><Check size={18} />{notice}<button type="button" onClick={() => { setBagOpen(true); setNotice('') }}>View bag</button></>}</div>
  </>
}
