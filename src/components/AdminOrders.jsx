import { Check, Eye, PackageCheck, Truck, X, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { money, orderDate, statusLabel } from '../lib/shop'

const filters = [
  ['all', 'All'], ['verifying_payment', 'Verifying payment'], ['preparing', 'Preparing'],
  ['ready', 'Ready'], ['out_for_delivery', 'Out for delivery'], ['completed', 'Completed'], ['cancelled', 'Cancelled'],
]
const cancelReasons = ['Payment could not be verified', 'Item is unavailable', 'Customer requested cancellation', 'Duplicate order', 'Outside delivery area']

export default function AdminOrders({ orders, busy, onUpdated, setError }) {
  const [filter, setFilter] = useState('verifying_payment')
  const [selected, setSelected] = useState(null)
  const [proofUrl, setProofUrl] = useState('')
  const [reason, setReason] = useState(cancelReasons[0])
  const visible = filter === 'all' ? orders : orders.filter((order) => order.status === filter)
  useEffect(() => {
    let active = true
    async function loadProof() {
      setProofUrl('')
      if (!selected?.payment_proof_path) return
      const { data, error } = await supabase.storage.from('payment-proofs').createSignedUrl(selected.payment_proof_path, 600)
      if (active && !error) setProofUrl(data.signedUrl)
    }
    void loadProof()
    return () => { active = false }
  }, [selected])
  async function action(order, value, cancellationReason = '') {
    const { error } = await supabase.rpc('admin_update_order', { p_order_id: order.id, p_action: value, p_reason: cancellationReason })
    if (error) { setError(error.message); return }
    setSelected(null); await onUpdated()
  }
  function actions(order) {
    if (order.status === 'cancelled' || order.status === 'completed') return null
    return <div className="admin-order-actions">{order.payment_status !== 'paid' && <button className="button outline small" onClick={() => { void action(order, 'paid') }} disabled={busy}><Check size={14} />Mark paid</button>}{['verifying_payment', 'placed'].includes(order.status) && <button className="button primary small" onClick={() => { void action(order, 'preparing') }} disabled={busy}><PackageCheck size={14} />Being prepared</button>}{order.status === 'preparing' && <button className="button primary small" onClick={() => { void action(order, order.fulfillment === 'pickup' ? 'ready' : 'out_for_delivery') }} disabled={busy}>{order.fulfillment === 'pickup' ? <PackageCheck size={14} /> : <Truck size={14} />}{order.fulfillment === 'pickup' ? 'Ready for pickup' : 'Out for delivery'}</button>}{((order.fulfillment === 'pickup' && order.status === 'ready') || (order.fulfillment === 'delivery' && order.status === 'out_for_delivery')) && <button className="button primary small" onClick={() => { void action(order, 'completed') }} disabled={busy}><Check size={14} />Completed</button>}</div>
  }
  return <section><div className="admin-order-tabs" role="tablist">{filters.map(([key, label]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}<span>{key === 'all' ? orders.length : orders.filter((order) => order.status === key).length}</span></button>)}</div>{visible.length ? <div className="admin-order-cards">{visible.map((order) => <article key={order.id}><header><div><b>{order.order_number}</b><small>{orderDate(order.created_at)} · {order.full_name}</small></div><span className={`status-badge ${order.status}`}><span />{statusLabel(order.status, order.fulfillment)}</span></header><div className="admin-order-card-body"><p>{order.order_items.map((item) => `${item.quantity}× ${item.name}`).join(', ')}</p><strong>{money(order.total)}</strong></div><footer><div><span>{order.payment_method === 'gcash' ? 'GCash' : 'Cash'} · {order.payment_status === 'paid' ? 'Paid' : 'Payment pending'}</span>{actions(order)}</div><button className="button outline small" onClick={() => setSelected(order)}><Eye size={15} />View</button></footer></article>)}</div> : <div className="admin-panel"><p>No orders with this status.</p></div>}{selected && <aside className="order-drawer" aria-label={`Order ${selected.order_number}`}><header><div><small>ORDER DETAILS</small><h2>{selected.order_number}</h2></div><button className="icon-button" onClick={() => setSelected(null)} aria-label="Close order details"><X /></button></header><div className="order-drawer-content"><section><h3>Status</h3><span className={`status-badge ${selected.status}`}><span />{statusLabel(selected.status, selected.fulfillment)}</span>{actions(selected)}</section><section><h3>Customer</h3><p>{selected.full_name}<br />{selected.contact}</p><p>{selected.fulfillment === 'delivery' ? `${selected.address_line}, ${selected.barangay}, ${selected.city}` : 'Store pickup'}</p></section><section><h3>Items</h3>{selected.order_items.map((item) => <div className="drawer-line" key={item.id}><span>{item.quantity}× {item.name}{item.customizations?.length > 0 && <small>{item.customizations.map((option) => option.option).join(', ')}</small>}</span><b>{money(item.unit_price * item.quantity)}</b></div>)}<div className="drawer-total"><span>Total</span><b>{money(selected.total)}</b></div></section><section><h3>Payment</h3><p>{selected.payment_method === 'gcash' ? `GCash · Ref: ${selected.payment_reference}` : 'Cash'}<br />{selected.payment_status === 'paid' ? 'Marked paid' : 'Pending payment'}</p>{selected.payment_method === 'gcash' && (proofUrl ? <a href={proofUrl} target="_blank" rel="noreferrer"><img className="payment-proof" src={proofUrl} alt="Customer payment proof" /></a> : <p>Loading payment proof…</p>)}</section>{selected.notes && <section><h3>Notes</h3><p>{selected.notes}</p></section>}{['verifying_payment', 'placed'].includes(selected.status) && <section className="drawer-cancel"><h3>Cancel order</h3><select value={reason} onChange={(event) => setReason(event.target.value)}>{cancelReasons.map((item) => <option key={item}>{item}</option>)}</select><button className="button outline small" onClick={() => { void action(selected, 'cancelled', reason) }}><XCircle size={15} />Cancel order</button></section>}{selected.status === 'cancelled' && <section><h3>Cancellation reason</h3><p>{selected.cancellation_reason}</p></section>}</div></aside>} {selected && <button className="drawer-backdrop" aria-label="Close order details" onClick={() => setSelected(null)} />}</section>
}
