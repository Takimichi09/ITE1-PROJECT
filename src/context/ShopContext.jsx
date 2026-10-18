/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { checkoutDetails, MAX_QUANTITY, sanitizeBag, validateCustomer } from '../lib/shop'
import { readStorage, writeStorage } from '../lib/storage'
import { withContactDetails } from '../data/shopDetails'

const ShopContext = createContext(null)
const BAG_KEY = 'dailycup:bag:v1'

export function ShopProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [authLoading, setAuthLoading] = useState(Boolean(supabase))
  const [authError, setAuthError] = useState('')
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [subcategories, setSubcategories] = useState([])
  const [catalogLoading, setCatalogLoading] = useState(Boolean(supabase))
  const [catalogError, setCatalogError] = useState('')
  const [storeSettings, setStoreSettings] = useState(() => withContactDetails(null))
  const [galleryImages, setGalleryImages] = useState([])
  const [contentError, setContentError] = useState('')
  const [feedback, setFeedback] = useState([])
  const [bag, setBag] = useState(() => sanitizeBag(readStorage(BAG_KEY, [])))
  const [notice, setNotice] = useState('')
  const authVersion = useRef(0)
  const authUserId = useRef(null)

  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    const hydrate = async (session) => {
      const version = ++authVersion.current
      if (!active) return
      authUserId.current = session?.user?.id || null
      setUser(session?.user || null)
      setProfile(null)
      setAuthError('')
      setAuthLoading(Boolean(session))
      if (!session) return
      try {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
        if (error) throw error
        if (active && version === authVersion.current) setProfile(data)
      } catch {
        if (active && version === authVersion.current) setAuthError('We could not load your profile. Please sign out and try again.')
      } finally {
        if (active && version === authVersion.current) setAuthLoading(false)
      }
    }
    // Schedule database work outside the synchronous auth callback.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      window.setTimeout(() => {
        if (!active) return
        if (event === 'INITIAL_SESSION' || (session?.user?.id || null) !== authUserId.current) {
          void hydrate(session)
        } else if (event === 'USER_UPDATED' && session?.user) {
          setUser(session.user)
        }
      }, 0)
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  const reloadCatalog = useCallback(async () => {
    if (!supabase) { setCatalogError('The shop is not connected to Supabase.'); return }
    setCatalogLoading(true)
    try {
      const [productsResult, categoriesResult, subcategoriesResult] = await Promise.all([
        supabase.from('products').select('*').order('sort_order'),
        supabase.from('product_categories').select('*').order('sort_order'),
        supabase.from('product_subcategories').select('*').order('sort_order'),
      ])
      const failed = [productsResult, categoriesResult, subcategoriesResult].find((result) => result.error)
      if (failed) throw failed.error
      const subcategoryNames = new Map(subcategoriesResult.data.map((item) => [String(item.id), item.name]))
      setProducts(productsResult.data.map((product) => ({ ...product, subcategory: subcategoryNames.get(String(product.subcategory_id)) || '' })))
      setCategories(categoriesResult.data); setSubcategories(subcategoriesResult.data); setCatalogError('')
    } catch { setCatalogError('The menu is unavailable right now. Please try again.') }
    finally { setCatalogLoading(false) }
  }, [])
  const reloadPublicContent = useCallback(async () => {
    if (!supabase) return
    const [settingsResult, galleryResult, feedbackResult] = await Promise.all([
      supabase.from('store_settings').select('*').eq('id', true).single(),
      supabase.from('gallery_images').select('*').eq('published', true).order('sort_order'),
      supabase.from('order_feedback').select('rating,comment,created_at').order('created_at', { ascending: false }).limit(6),
    ])
    if (!settingsResult.error) setStoreSettings(withContactDetails(settingsResult.data))
    if (!galleryResult.error) setGalleryImages(galleryResult.data)
    if (!feedbackResult.error) setFeedback(feedbackResult.data)
    setContentError(settingsResult.error || galleryResult.error || feedbackResult.error ? 'Some shop content is unavailable right now.' : '')
  }, [])
  useEffect(() => {
    const refresh = () => { void reloadCatalog(); void reloadPublicContent() }
    const timer = window.setTimeout(refresh, 0)
    const shouldRefresh = () => document.visibilityState === 'visible' && !window.location.pathname.startsWith('/admin')
    const interval = window.setInterval(() => { if (shouldRefresh()) refresh() }, 30000)
    const onVisible = () => { if (shouldRefresh()) refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearTimeout(timer); window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisible) }
  }, [reloadCatalog, reloadPublicContent])
  useEffect(() => { writeStorage(BAG_KEY, bag) }, [bag])
  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  const lines = useMemo(() => bag.map((item) => {
    const product = products.find(({ id }) => id === item.id)
    if (!product) return { id: item.id, name: 'Unavailable item', price: 0, quantity: item.quantity, available: false }
    const chosen = (product.customizations || []).flatMap((group) => (item.selections?.[group.id] || []).map((optionId) => {
      const option = group.options.find((candidate) => candidate.id === optionId)
      return option ? { group: group.name, option: option.name, price: Number(option.price) } : null
    }).filter(Boolean))
    return { ...product, price: Number(product.price) + chosen.reduce((sum, option) => sum + option.price, 0), quantity: item.quantity, selections: item.selections || {}, selectedOptions: chosen }
  }), [bag, products])
  const bagCount = bag.reduce((sum, item) => sum + item.quantity, 0)

  function addToBag(product, selections = {}) {
    if (!product.available) return
    if (bag.find(({ id }) => id === product.id)?.quantity >= MAX_QUANTITY) {
      setNotice(`You can add up to ${MAX_QUANTITY} of each item.`); return
    }
    setBag((current) => sanitizeBag([...current, { id: product.id, quantity: 1, selections }]))
    setNotice(`${product.name} added to your bag`)
  }
  function setQuantity(id, quantity) {
    setBag((current) => sanitizeBag(current.map((item) => item.id === id ? { ...item, quantity } : item)))
  }
  async function signOut() {
    if (!supabase) throw new Error('The shop is not connected to Supabase.')
    const { error } = await supabase.auth.signOut(); if (error) throw error
    ++authVersion.current; authUserId.current = null; setUser(null); setProfile(null); setAuthError(''); setAuthLoading(false)
  }
  async function saveProfile(values) {
    if (!user) throw new Error('Please sign in again.')
    const error = validateCustomer(values)
    if (error) throw new Error(error)
    const update = { full_name: values.full_name.trim(), contact: values.contact.replace(/[\s()-]/g, ''), address_line: values.address_line?.trim() || '', barangay: values.barangay || '' }
    if (!supabase) throw new Error('The shop is not connected to Supabase.')
    const { data, error: saveError } = await supabase.from('profiles').update(update).eq('id', user.id).select().single()
    if (saveError) throw saveError
    setProfile(data)
  }
  async function getOrders() {
    if (!user) throw new Error('Please sign in to view orders.')
    if (!supabase) throw new Error('The shop is not connected to Supabase.')
    const { data, error } = await supabase.from('orders').select('*, order_items(*), order_feedback(*)').eq('customer_id', user.id).order('created_at', { ascending: false })
    if (error) throw error
    return data
  }
  async function placeOrder(values, requestId) {
    if (!user || !profile) throw new Error('Please sign in before placing your order.')
    if (!lines.length) throw new Error('Your bag is empty.')
    if (lines.some((line) => !line.available)) throw new Error('Please remove unavailable items from your bag.')
    const details = checkoutDetails(values)
    if (!supabase) throw new Error('The shop is not connected to Supabase.')
    const { data: result, error } = await supabase.rpc('place_order', { p_request_id: requestId, p_details: details, p_items: bag.map(({ id, quantity, selections }) => ({ product_id: id, quantity, selections })) })
    if (error) throw error
    setBag([])
    return result
  }
  async function cancelOrder(orderId) {
    const { data, error } = await supabase.rpc('cancel_own_order', { p_order_id: orderId })
    if (error) throw error
    return data
  }
  async function submitFeedback(orderId, rating, comment) {
    if (!user) throw new Error('Please sign in again.')
    const { error } = await supabase.from('order_feedback').insert({ order_id: orderId, customer_id: user.id, rating, comment: comment.trim() })
    if (error) throw error
    await reloadPublicContent()
  }
  function reorder(order) {
    const restored = order.order_items.flatMap((item) => {
      const product = products.find((candidate) => candidate.id === item.product_id && candidate.available)
      if (!product) return []
      const selections = Object.fromEntries((product.customizations || []).map((group) => [group.id, group.options.filter((option) => (item.customizations || []).some((saved) => saved.group === group.name && saved.option === option.name)).map((option) => option.id)]))
      if ((product.customizations || []).some((group) => group.required && !selections[group.id]?.length)) return []
      return [{ id: product.id, quantity: item.quantity, selections }]
    })
    setBag((current) => sanitizeBag([...current, ...restored]))
    setNotice('Available items from this order were added to your bag.')
  }

  return <ShopContext.Provider value={{ user, profile, authLoading, authError, products, categories, subcategories, catalogLoading, catalogError, reloadCatalog, storeSettings, galleryImages, feedback, contentError, reloadPublicContent, bag, lines, bagCount, addToBag, setQuantity, notice, setNotice, signOut, saveProfile, getOrders, placeOrder, cancelOrder, submitFeedback, reorder }}>{children}</ShopContext.Provider>
}

export const useShop = () => useContext(ShopContext)
