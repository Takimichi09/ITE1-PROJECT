import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeUsername, usernameToEmail } from '../src/lib/username.js'

test('usernames map consistently to one internal auth identifier', () => {
  assert.equal(normalizeUsername('  Coffee_Friend  '), 'coffee_friend')
  assert.equal(usernameToEmail('Coffee_Friend'), usernameToEmail('coffee_friend'))
  assert.equal(usernameToEmail('coffee_friend'), 'coffee_friend@users.dailycup.ph')
})

test('invalid usernames cannot become auth identifiers', () => {
  for (const value of ['ab', '1coffee', 'name@example.com', 'name-with-dash', 'a'.repeat(25)]) {
    assert.throws(() => usernameToEmail(value), /username/)
  }
})
