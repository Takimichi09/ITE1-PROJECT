export const DELIVERY_FEE = 60
export const MAX_QUANTITY = 20
// PSA PSGC, June 2026: former Barangay 176 is now 176-A through 176-F.
export const BARANGAYS = Array.from({ length: 188 }, (_, index) => index + 1).flatMap((number) => number === 176 ? ['A', 'B', 'C', 'D', 'E', 'F'].map((suffix) => `Barangay 176-${suffix}`) : [`Barangay ${number}`])
export const PAST_STATUSES = ['completed', 'cancelled']
export const money = (value) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)
export const orderDate = (value) => new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }).format(new Date(value))
export const normalizeContact = (value) => String(value || '').replace(/[\s()-]/g, '')
export const validContact = (value) => /^(09\d{9}|\+639\d{9})$/.test(normalizeContact(value))

export function validateCustomer(values, requireAddress = false) {
  if (!values.full_name?.trim() || values.full_name.trim().length < 2) return 'Please enter your full name.'
  if (values.full_name.trim().length > 100) return 'Please keep your full name under 100 characters.'
  if (!validContact(values.contact)) return 'Enter a valid Philippine mobile number, such as 09171234567.'
  if (requireAddress && (!values.address_line?.trim() || values.address_line.trim().length < 5)) return 'Please enter your house number, street, and building if applicable.'
  if (String(values.address_line || '').length > 250) return 'Please keep your address under 250 characters.'
  if (requireAddress && !BARANGAYS.includes(values.barangay)) return 'Please choose your barangay in Caloocan City.'
  return ''
}

export function checkoutDetails(values) {
  if (!['pickup', 'delivery'].includes(values.fulfillment)) throw new Error('Please choose pickup or delivery.')
  const error = validateCustomer(values, values.fulfillment === 'delivery')
  if (error) throw new Error(error)
  return {
    full_name: values.full_name.trim(), contact: normalizeContact(values.contact),
    fulfillment: values.fulfillment,
    address_line: values.fulfillment === 'delivery' ? values.address_line.trim() : null,
    barangay: values.fulfillment === 'delivery' ? values.barangay : null,
    city: values.fulfillment === 'delivery' ? 'Caloocan City' : null,
    notes: String(values.notes || '').trim().slice(0, 300),
    payment_method: values.payment_method || 'cash',
    payment_reference: String(values.payment_reference || '').trim(),
    payment_proof_path: String(values.payment_proof_path || '').trim(),
  }
}

export function calculateTotals(lines, fulfillment = 'pickup') {
  const subtotal = lines.reduce((sum, line) => sum + Number(line.price) * line.quantity, 0)
  const delivery_fee = fulfillment === 'delivery' && lines.length ? DELIVERY_FEE : 0
  return { subtotal, delivery_fee, total: subtotal + delivery_fee }
}

export function sanitizeBag(value) {
  if (!Array.isArray(value)) return []
  const items = new Map()
  for (const item of value) {
    if (typeof item?.id !== 'string' || !Number.isInteger(item.quantity) || item.quantity <= 0) continue
    const existing = items.get(item.id)
    const selections = item.selections && typeof item.selections === 'object' && !Array.isArray(item.selections) ? item.selections : {}
    items.set(item.id, { quantity: Math.min(MAX_QUANTITY, (existing?.quantity || 0) + item.quantity), selections: existing?.selections || selections })
  }
  return [...items].map(([id, item]) => ({ id, quantity: item.quantity, selections: item.selections }))
}

export function checkoutDestination(user) {
  return user ? '/checkout' : '/login?next=%2Fcheckout'
}

export function safeNext(value) {
  return ['/checkout', '/orders', '/profile', '/bag', '/menu', '/admin'].includes(value) ? value : '/menu'
}

export function statusLabel(status, fulfillment) {
  return ({ verifying_payment: 'Verifying payment', placed: 'Order received', preparing: 'Being prepared', ready: fulfillment === 'delivery' ? 'Ready for delivery' : 'Ready for pickup', out_for_delivery: 'Out for delivery', completed: 'Completed', cancelled: 'Cancelled' })[status] || status
}
