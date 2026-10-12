export const contactDetails = {
  address: '259 Kabatuhan St. Deparo, Caloocan, Philippines, 1420',
  hours: '9:00 AM – 12:00 midnight',
  phone: '0968 187 4263',
  email: 'cafedemelle@gmail.com',
}

export function withContactDetails(settings) {
  return {
    ...settings,
    ...Object.fromEntries(Object.entries(contactDetails).map(([key, value]) => [key, settings?.[key]?.trim() ? settings[key] : value])),
  }
}
