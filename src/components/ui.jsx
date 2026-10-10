import { ArrowRight, Coffee, Minus, Plus, ShoppingBag, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useShop } from '../context/ShopContext'
import { BARANGAYS, MAX_QUANTITY, money } from '../lib/shop'

export function ProductCard({ product }) {
  const { addToBag, bag } = useShop()
  const [customizing, setCustomizing] = useState(false)
  const [selections, setSelections] = useState({})
  const maxed = (bag.find(({ id }) => id === product.id)?.quantity || 0) >= MAX_QUANTITY
  const groups = Array.isArray(product.customizations) ? product.customizations : []
  const complete = groups.every((group) => !group.required || selections[group.id]?.length > 0)
  const extra = groups.flatMap((group) => (selections[group.id] || []).map((id) => group.options.find((option) => option.id === id))).filter(Boolean).reduce((sum, option) => sum + Number(option.price), 0)
  function toggle(group, optionId) { setSelections((current) => ({ ...current, [group.id]: group.type === 'single' ? [optionId] : (current[group.id] || []).includes(optionId) ? current[group.id].filter((id) => id !== optionId) : [...(current[group.id] || []), optionId] })) }
  function add() { if (groups.length) setCustomizing(true); else addToBag(product) }
  function confirm() { if (!complete) return; addToBag(product, selections); setCustomizing(false) }
  return <><article className="product-card"><div className="product-image">{product.image ? <img src={product.image} alt={product.name} loading="lazy" /> : <div className="product-placeholder"><Coffee size={32} /></div>}<span className="product-category">{product.subcategory || product.category}</span></div><div className="product-copy"><div className="product-heading"><h3>{product.name}</h3><strong>{money(product.price)}</strong></div><small>{[product.category, product.subcategory].filter(Boolean).join(' · ')}</small><p>{product.description}</p><button className="add-button" onClick={add} disabled={!product.available || maxed} aria-label={`Add ${product.name} to bag`}><span>{!product.available ? 'Currently unavailable' : maxed ? 'Maximum quantity reached' : groups.length ? 'Customize' : 'Add to bag'}</span><Plus size={17} /></button></div></article>{customizing && <div className="modal-backdrop product-customizer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCustomizing(false) }}><section className="product-customizer" role="dialog" aria-modal="true" aria-labelledby={`customize-${product.id}`}><header><div><small>{product.category} · {product.subcategory}</small><h2 id={`customize-${product.id}`}>Customize {product.name}</h2></div><button type="button" className="icon-button" aria-label="Close customization" onClick={() => setCustomizing(false)}><X size={20} /></button></header>{groups.map((group) => <fieldset className="customizer-group" key={group.id}><legend>{group.name}{group.required && <span>Required</span>}</legend>{group.options.map((option) => { const checked = (selections[group.id] || []).includes(option.id); return <label className={checked ? 'selected' : ''} key={option.id}><input type={group.type === 'single' ? 'radio' : 'checkbox'} name={group.id} checked={checked} onChange={() => toggle(group, option.id)} /><span>{option.name}</span><b>{Number(option.price) ? `+ ${money(option.price)}` : 'Included'}</b></label> })}</fieldset>)}<div className="customizer-total"><span>Total per item</span><strong>{money(Number(product.price) + extra)}</strong></div><button type="button" className="button primary full" disabled={!complete} onClick={confirm}>Add to bag</button></section></div>}</>
}
export function EmptyState({ title, detail, to = '/menu', action = 'Explore the menu' }) {
  return <div className="empty-state"><span className="empty-icon"><Coffee size={34} strokeWidth={1.4} /></span><h2>{title}</h2><p>{detail}</p><Link className="button primary" to={to}>{action}<ArrowRight size={17} /></Link></div>
}
export function PageHeading({ eyebrow, title, description, children }) {
  return <header className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{children}</header>
}
export function Field({ label, error, hint, children, ...props }) {
  return <label className="field" {...props}><span>{label}</span>{children}{hint && <small>{hint}</small>}{error && <small className="error-text">{error}</small>}</label>
}
export function AddressFields({ values, onChange, required = true }) {
  return <div className="address-fields"><Field label="Address line" hint="House/unit number, building, street, and subdivision"><input name="address_line" autoComplete="street-address" value={values.address_line || ''} onChange={onChange} placeholder="e.g. 12 Mabini Street, Unit 2" maxLength={250} minLength={required ? 5 : undefined} required={required} /></Field><div className="form-row"><Field label="Barangay"><select name="barangay" value={values.barangay || ''} onChange={onChange} required={required}><option value="">Select barangay</option>{BARANGAYS.map((name) => <option key={name}>{name}</option>)}</select></Field><Field label="City"><input value="Caloocan City" readOnly aria-label="City" /></Field></div></div>
}
export function CustomerFields({ values, onChange }) {
  return <div className="form-row"><Field label="Full name"><input name="full_name" autoComplete="name" value={values.full_name} onChange={onChange} placeholder="Your full name" minLength={2} maxLength={100} required /></Field><Field label="Mobile number"><input name="contact" type="tel" autoComplete="tel" value={values.contact} onChange={onChange} placeholder="0917 123 4567" maxLength={20} required /></Field></div>
}
export function QuantityControl({ line }) {
  const { setQuantity } = useShop()
  return <div className="quantity-control"><button type="button" aria-label={`Decrease ${line.name} quantity`} onClick={() => setQuantity(line.id, line.quantity - 1)}><Minus size={14} /></button><span aria-live="polite">{line.quantity}</span><button type="button" disabled={line.quantity >= MAX_QUANTITY} aria-label={`Increase ${line.name} quantity`} onClick={() => setQuantity(line.id, line.quantity + 1)}><Plus size={14} /></button></div>
}
export function OrderSummary({ totals, children, fulfillment, lines }) {
  return <aside className="order-summary"><h2><ShoppingBag size={20} />Order summary</h2>{lines && <div className="summary-items">{lines.map((line) => <div key={line.id}><span>{line.quantity} × {line.name}{line.selectedOptions?.length > 0 && <small>{line.selectedOptions.map((item) => item.option).join(', ')}</small>}</span><b>{money(line.price * line.quantity)}</b></div>)}</div>}<dl><div><dt>Subtotal</dt><dd>{money(totals.subtotal)}</dd></div><div><dt>{fulfillment === 'delivery' ? 'Delivery · Caloocan' : 'Pickup fee'}</dt><dd>{totals.delivery_fee ? money(totals.delivery_fee) : 'Free'}</dd></div><div className="summary-total"><dt>Total</dt><dd>{money(totals.total)}</dd></div></dl>{children}</aside>
}
