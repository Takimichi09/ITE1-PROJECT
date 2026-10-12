import { ArrowRight, Banknote, Check, MapPin, QrCode, ShoppingBag, Truck, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useShop } from '../context/ShopContext'
import { supabase } from '../lib/supabase'
import { calculateTotals, checkoutDetails } from '../lib/shop'
import { AddressFields, CustomerFields, EmptyState, Field, OrderSummary, PageHeading } from '../components/ui'

const defaultGcashQr = '/gcash-store-qr.png'

export default function Checkout() {
  const { user, profile, lines, placeOrder, catalogLoading, catalogError, storeSettings } = useShop()
  const [values, setValues] = useState({ full_name: profile?.full_name || '', contact: profile?.contact || '', address_line: profile?.address_line || '', barangay: profile?.barangay || '', fulfillment: 'pickup', notes: '', payment_method: 'cash', payment_reference: '', payment_proof_path: '' })
  const [proof, setProof] = useState(null)
  const [proofPreview, setProofPreview] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const request = useRef(null)
  const pending = useRef(false)
  const navigate = useNavigate()
  const gcashQr = storeSettings?.gcash_qr_image || defaultGcashQr
  const change = (event) => { setValues((current) => ({ ...current, [event.target.name]: event.target.value })); setError('') }
  function chooseProof(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Payment proof must be a JPG, PNG, or WebP image.'); event.target.value = ''; return }
    if (file.size > 5 * 1024 * 1024) { setError('Payment proof must be 5 MB or smaller.'); event.target.value = ''; return }
    if (proofPreview) URL.revokeObjectURL(proofPreview)
    setProof(file); setProofPreview(URL.createObjectURL(file)); setError('')
  }
  async function submit(event) {
    event.preventDefault()
    if (pending.current) return
    setError('')
    if (values.payment_method === 'gcash' && (!proof || values.payment_reference.trim().length < 6)) { setError('Upload your GCash payment proof and enter its reference number.'); return }
    try { checkoutDetails(values) } catch (cause) { setError(cause.message); return }
    pending.current = true; setBusy(true); request.current ||= crypto.randomUUID()
    try {
      let paymentProofPath = ''
      if (values.payment_method === 'gcash') {
        const extension = proof.name.split('.').pop()?.toLowerCase() || 'jpg'
        paymentProofPath = `${user.id}/${request.current}.${extension}`
        const { error: uploadError } = await supabase.storage.from('payment-proofs').upload(paymentProofPath, proof, { contentType: proof.type, upsert: false })
        if (uploadError && !String(uploadError.message).toLowerCase().includes('already exists')) throw uploadError
      }
      const order = await placeOrder({ ...values, payment_proof_path: paymentProofPath }, request.current)
      navigate('/orders', { replace: true, state: { orderNumber: order.order_number } })
    } catch (cause) { setError(cause.message || 'We couldn’t place the order. Please try again.') }
    finally { pending.current = false; setBusy(false) }
  }
  if (!lines.length && !busy) return <div className="container page"><EmptyState title="Something missing?" detail="Add your favorites to your bag before checking out." /></div>
  return <div className="container page"><PageHeading eyebrow="ONE STEP CLOSER TO YOUR FIRST SIP" title={<>Make it <em>yours.</em></>} description="A few details, then we’ll take it from here." /><form className="checkout-layout" onSubmit={submit}><fieldset className="checkout-fields" disabled={busy}><legend className="sr-only">Checkout details</legend><section className="form-section"><div className="form-section-heading"><span>01</span><div><h2>A little about you</h2><p>So we know who this good coffee is for.</p></div></div><CustomerFields values={values} onChange={change} /></section><section className="form-section"><div className="form-section-heading"><span>02</span><div><h2>How would you like it?</h2><p>Your coffee, wherever your day takes you.</p></div></div><div className="fulfillment-options">{[['pickup', ShoppingBag, 'Pick up', 'Collect at the shop · Free'], ['delivery', Truck, 'Drop off', 'Caloocan City only · ₱60']].map(([value, Icon, title, description]) => <label className={`fulfillment-option ${values.fulfillment === value ? 'selected' : ''}`} key={value}><input type="radio" name="fulfillment" value={value} checked={values.fulfillment === value} onChange={change} /><Icon size={24} /><b>{title}</b><small>{description}</small><span className="option-check">{values.fulfillment === value && <Check size={12} />}</span></label>)}</div>{values.fulfillment === 'delivery' ? <div className="delivery-address"><p className="delivery-note"><MapPin size={16} />We currently deliver within Caloocan City only.</p><AddressFields values={values} onChange={change} /></div> : <div className="pickup-note"><MapPin size={20} /><div><b>Pick up at {storeSettings?.shop_name || 'the shop'}</b><p>{storeSettings?.address || 'Check the shop’s contact page for the pickup location.'}</p><span>No delivery fee. No home address needed.</span></div></div>}</section><section className="form-section"><div className="form-section-heading"><span>03</span><div><h2>Payment</h2><p>Choose cash or send payment through GCash.</p></div></div><div className="fulfillment-options payment-options">{[['cash', Banknote, 'Cash', values.fulfillment === 'delivery' ? 'Cash on delivery' : 'Pay at pickup'], ['gcash', QrCode, 'GCash', 'Upload payment proof']].map(([value, Icon, title, description]) => <label className={`fulfillment-option ${values.payment_method === value ? 'selected' : ''}`} key={value}><input type="radio" name="payment_method" value={value} checked={values.payment_method === value} onChange={change} /><Icon size={24} /><b>{title}</b><small>{description}</small><span className="option-check">{values.payment_method === value && <Check size={12} />}</span></label>)}</div>{values.payment_method === 'gcash' && <div className="gcash-checkout"><div className="gcash-payment-details"><img className="gcash-qr" src={gcashQr} alt="Store GCash QR code" /><div className="gcash-recipient"><span>GCash recipient</span><strong>Dastine Casingal</strong><a href="tel:09101429809">0910 142 9809</a></div></div><Field label="GCash reference number"><input name="payment_reference" value={values.payment_reference} onChange={change} maxLength={80} placeholder="Enter the transaction reference" required /></Field><Field label="Payment proof" hint="JPG, PNG, or WebP · maximum 5 MB"><label className="proof-upload">{proofPreview ? <img src={proofPreview} alt="Payment proof preview" /> : <span><Upload size={20} />Upload payment screenshot</span>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseProof} required /></label></Field></div>}</section><section className="form-section"><div className="form-section-heading"><span>04</span><div><h2>The finishing touches</h2><p>Anything else we should know?</p></div></div><Field label="Order notes (optional)"><textarea name="notes" rows={3} maxLength={300} value={values.notes} onChange={change} placeholder="A landmark, pickup instructions, or a note for the team…" /></Field></section></fieldset><OrderSummary totals={calculateTotals(lines, values.fulfillment)} lines={lines} fulfillment={values.fulfillment}>{error && <p className="error-panel" role="alert">{error}</p>}{catalogError && <p className="error-panel" role="alert">{catalogError}</p>}<button className="button primary full" type="submit" disabled={busy || catalogLoading || !!catalogError || lines.some((line) => !line.available)}>{busy ? 'Placing your order…' : 'Place order'}<ArrowRight size={18} /></button><p className="summary-note">Your order total is confirmed by the shop when submitted.</p><Link className="summary-edit" to="/bag">Edit your bag</Link></OrderSummary></form></div>
}
