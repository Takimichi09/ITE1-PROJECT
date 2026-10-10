export function normalizeUsername(value) {
  const username = String(value || '').trim().toLowerCase()
  if (!/^[a-z][a-z0-9_]{2,23}$/.test(username)) {
    throw new Error('Choose a username with 3–24 letters, numbers, or underscores, starting with a letter.')
  }
  return username
}

export function usernameToEmail(value) {
  return `${normalizeUsername(value)}@users.dailycup.ph`
}
