import test from 'node:test'
import assert from 'node:assert/strict'
import { BARANGAYS, calculateTotals, checkoutDestination, checkoutDetails, safeNext, sanitizeBag, validContact } from '../src/lib/shop.js'

const customer = { full_name: 'Test Customer', contact: '0917 123 4567', fulfillment: 'pickup', address_line: '12 Sample Street', barangay: 'Barangay 176-A', city: 'Makati' }
test('pickup omits all delivery fields, even after delivery was selected', () => {
  const details = checkoutDetails(customer)
  assert.equal(details.address_line, null); assert.equal(details.barangay, null); assert.equal(details.city, null)
  assert.equal(details.contact, '09171234567')
})
test('delivery adds exactly 60 pesos once, regardless of quantity', () => {
  const lines = [{ price: 145, quantity: 3 }, { price: 85, quantity: 2 }]
  assert.deepEqual(calculateTotals(lines, 'delivery'), { subtotal: 605, delivery_fee: 60, total: 665 })
  assert.deepEqual(calculateTotals(lines, 'pickup'), { subtotal: 605, delivery_fee: 0, total: 605 })
})
test('delivery validates a Caloocan barangay and forces city to Caloocan', () => {
  assert.equal(checkoutDetails({ ...customer, fulfillment: 'delivery' }).city, 'Caloocan City')
  assert.throws(() => checkoutDetails({ ...customer, fulfillment: 'delivery', barangay: 'Other city' }))
  assert.throws(() => checkoutDetails({ ...customer, fulfillment: 'delivery', address_line: '' }))
  assert.ok(BARANGAYS.includes('Barangay 176-F')); assert.ok(!BARANGAYS.includes('Barangay 176'))
})
test('pickup requires no address, but still requires name and phone', () => {
  assert.doesNotThrow(() => checkoutDetails({ ...customer, address_line: '', barangay: '' }))
  assert.throws(() => checkoutDetails({ ...customer, contact: '123' }))
  assert.throws(() => checkoutDetails({ ...customer, full_name: ' ' }))
  assert.throws(() => checkoutDetails({ ...customer, fulfillment: 'teleport' }))
})
test('Philippine contact formats are accepted and incomplete numbers are rejected', () => {
  assert.ok(validContact('+63 917 123 4567')); assert.ok(validContact('09171234567'))
  assert.equal(validContact('0917123456'), false); assert.equal(validContact('letters'), false)
})
test('guest checkout requires login and allows only internal return destinations', () => {
  assert.equal(checkoutDestination(null), '/login?next=%2Fcheckout')
  assert.equal(checkoutDestination({ id: 'customer' }), '/checkout')
  assert.equal(safeNext('https://other.example'), '/menu'); assert.equal(safeNext('/checkout'), '/checkout')
})
test('restored bag rejects invalid quantities, caps combined entries and keeps no prices', () => {
  assert.deepEqual(sanitizeBag([{ id: 'latte', quantity: 18, price: 0, selections: { size: ['large'] } }, { id: 'latte', quantity: 5 }, { id: 'bad', quantity: -1 }, { id: 'bad', quantity: 2.5 }]), [{ id: 'latte', quantity: 20, selections: { size: ['large'] } }])
  assert.deepEqual(sanitizeBag({ corrupted: true }), [])
})
