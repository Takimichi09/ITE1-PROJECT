import { Check, ClipboardList, Image, ImagePlus, LogOut, Package, Pencil, Plus, RefreshCw, Settings, Tags, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money } from '../lib/shop'
import { useShop } from '../context/ShopContext'
import { Field, PageHeading } from '../components/ui'
import AdminOrders from '../components/AdminOrders'
import { withContactDetails } from '../data/shopDetails'

const tabs = [
  ['products', Package, 'Menu'],
  ['orders', ClipboardList, 'Orders'],
  ['shop', Settings, 'Shop details'],
  ['gallery', Image, 'Gallery'],
]
const emptyProduct = { name: '', category: '', subcategory_id: '', description: '', price: '', image: '', customizations: [], available: true, sort_order: 0 }
const emptyTaxonomy = { kind: 'category', originalName: '', name: '', category_name: '', sort_order: 0 }
const emptyImage = { image_url: '', caption: '', sort_order: 0, published: true }
const settingFields = [
  ['shop_name', 'Shop name', 'text'],
  ['announcement', 'Announcement', 'text'],
  ['about_text', 'Our story', 'textarea'],
  ['address', 'Shop address', 'text'],
  ['hours', 'Opening hours', 'text'],
  ['phone', 'Contact number', 'tel'],
  ['email', 'Contact email', 'email'],
  ['hero_image', 'Home photo URL', 'url'],
  ['cafe_image', 'Shop photo URL', 'url'],
  ['gcash_qr_image', 'GCash QR code', 'qr'],
]

export default function Admin() {
  const { reloadCatalog, reloadPublicContent, signOut, storeSettings } = useShop()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const tab = tabs.some(([key]) => key === requestedTab) ? requestedTab : 'products'
  function setTab(nextTab) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('tab', nextTab)
      return next
    })
  }
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [subcategories, setSubcategories] = useState([])
  const [orders, setOrders] = useState([])
  const [gallery, setGallery] = useState([])
  const [settingsDraft, setSettingsDraft] = useState(null)
  const [gcashQrFile, setGcashQrFile] = useState(null)
  const [gcashQrPreview, setGcashQrPreview] = useState('')
  const [productDraft, setProductDraft] = useState(emptyProduct)
  const [productImage, setProductImage] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [imageDraft, setImageDraft] = useState(emptyImage)
  const [galleryFile, setGalleryFile] = useState(null)
  const [galleryPreview, setGalleryPreview] = useState('')
  useEffect(() => () => { if (galleryPreview) URL.revokeObjectURL(galleryPreview) }, [galleryPreview])
  const [taxonomyOpen, setTaxonomyOpen] = useState(false)
  const [taxonomyDraft, setTaxonomyDraft] = useState(emptyTaxonomy)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true)
    try {
      const [productsResult, categoriesResult, subcategoriesResult, ordersResult, settingsResult, galleryResult] = await Promise.all([
        supabase.from('products').select('*').order('sort_order'),
        supabase.from('product_categories').select('*').order('sort_order'),
        supabase.from('product_subcategories').select('*').order('sort_order'),
        supabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: false }),
        supabase.from('store_settings').select('*').eq('id', true).single(),
        supabase.from('gallery_images').select('*').order('sort_order'),
      ])
      const failed = [productsResult, categoriesResult, subcategoriesResult, ordersResult, settingsResult, galleryResult].find((result) => result.error)
      if (failed) throw failed.error
      setProducts(productsResult.data); setCategories(categoriesResult.data); setSubcategories(subcategoriesResult.data)
      setOrders(ordersResult.data)
      setGallery(galleryResult.data)
      if (initial) setSettingsDraft(withContactDetails(settingsResult.data))
      setError('')
    } catch (cause) { setError(cause.message || 'Could not load admin data.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { const timer = window.setTimeout(() => { void load(true) }, 0); return () => window.clearTimeout(timer) }, [load])

  async function run(action, success, refreshPublic = false) {
    setBusy(true); setError(''); setMessage('')
    try {
      await action()
      await load()
      if (refreshPublic) await Promise.all([reloadCatalog(), reloadPublicContent()])
      setMessage(success)
      return true
    } catch (cause) { setError(cause.message || 'Could not save this change.'); return false }
    finally { setBusy(false) }
  }
  function editProduct(product) { setProductDraft({ ...product, price: String(product.price), customizations: Array.isArray(product.customizations) ? product.customizations : [] }); setProductImage(null); setImagePreview(product.image || ''); setTab('products'); setMessage('') }
  function editImage(item) { setImageDraft({ ...item }); setGalleryFile(null); setGalleryPreview(''); setTab('gallery'); setMessage('') }

  function startTaxonomy(kind, item = null) {
    setTaxonomyDraft(item ? { kind, originalName: item.name, ...item, sort_order: Number(item.sort_order) } : { ...emptyTaxonomy, kind, category_name: kind === 'subcategory' ? categories[0]?.name || '' : '' })
    setError(''); setMessage('')
  }
  async function saveTaxonomy(event) {
    event.preventDefault()
    const name = taxonomyDraft.name.trim()
    if (name.length < 2 || name.length > 50) { setError('Category names must be 2–50 characters.'); return }
    const isSubcategory = taxonomyDraft.kind === 'subcategory'
    if (isSubcategory && !taxonomyDraft.category_name) { setError('Choose a parent category.'); return }
    const value = isSubcategory ? { name, category_name: taxonomyDraft.category_name, sort_order: Number(taxonomyDraft.sort_order) } : { name, sort_order: Number(taxonomyDraft.sort_order) }
    if (!Number.isInteger(value.sort_order)) { setError('Display order must be a whole number.'); return }
    if (await run(async () => {
      const table = isSubcategory ? 'product_subcategories' : 'product_categories'
      const query = taxonomyDraft.id ? supabase.from(table).update(value).eq('id', taxonomyDraft.id) : taxonomyDraft.originalName ? supabase.from(table).update(value).eq('name', taxonomyDraft.originalName) : supabase.from(table).insert(value)
      const { error: cause } = await query
      if (cause) throw cause
    }, `${isSubcategory ? 'Subcategory' : 'Category'} saved.`, true)) setTaxonomyDraft({ ...emptyTaxonomy, kind: taxonomyDraft.kind, category_name: isSubcategory ? categories[0]?.name || '' : '' })
  }
  async function deleteTaxonomy(kind, item) {
    const used = kind === 'category' ? products.some((product) => product.category === item.name) : products.some((product) => String(product.subcategory_id) === String(item.id))
    if (used) { setError(`Move or delete the menu items using this ${kind} first.`); return }
    if (!window.confirm(`Delete ${item.name}? This cannot be undone.`)) return
    await run(async () => {
      const table = kind === 'category' ? 'product_categories' : 'product_subcategories'
      const query = supabase.from(table).delete().eq(kind === 'category' ? 'name' : 'id', kind === 'category' ? item.name : item.id)
      const { error: cause } = await query
      if (cause) throw cause
    }, `${kind === 'category' ? 'Category' : 'Subcategory'} deleted.`, true)
  }
  async function saveProduct(event) {
    event.preventDefault()
    const productId = productDraft.id || crypto.randomUUID()
    const invalidCustomization = productDraft.customizations.some((group) => !group.name.trim() || !group.options.length || group.options.some((option) => !option.name.trim() || !Number.isFinite(Number(option.price)) || Number(option.price) < 0))
    if (!productDraft.name.trim() || !productDraft.category || !Number.isInteger(Number(productDraft.subcategory_id)) || !Number.isFinite(Number(productDraft.price)) || Number(productDraft.price) <= 0 || !Number.isInteger(Number(productDraft.sort_order)) || invalidCustomization) { setError('Complete the item details and every customization option. Additional prices cannot be negative.'); return }
    let image = productDraft.image || ''
    if (productImage) {
      const extension = productImage.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${productId}/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('product-images').upload(path, productImage, { contentType: productImage.type, upsert: false })
      if (uploadError) { setError(uploadError.message || 'Could not upload the product image.'); return }
      image = supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
    }
    const value = { name: productDraft.name.trim(), category: productDraft.category, subcategory_id: Number(productDraft.subcategory_id), description: productDraft.description.trim(), price: Number(productDraft.price), image, detail: '', badge: '', customizations: productDraft.customizations.map((group) => group.name.trim().toLowerCase() === 'temperature' ? { ...group, options: group.options.map((option) => ({ ...option, price: 0 })) } : group), available: productDraft.available, sort_order: Number(productDraft.sort_order) }
    if (await run(async () => {
      const query = productDraft.id ? supabase.from('products').update(value).eq('id', productDraft.id) : supabase.from('products').insert({ id: productId, ...value })
      const { error: cause } = await query
      if (cause) throw cause
    }, 'Menu item saved.', true)) { setProductDraft(emptyProduct); setProductImage(null); setImagePreview('') }
  }
  async function deleteProduct(product) {
    if (!window.confirm(`Delete ${product.name}? This cannot be undone.`)) return
    if (await run(async () => { const { error: cause } = await supabase.from('products').delete().eq('id', product.id); if (cause) throw cause }, 'Menu item deleted.', true) && productDraft.id === product.id) setProductDraft(emptyProduct)
  }
  async function saveSettings(event) {
    event.preventDefault()
    const update = Object.fromEntries(settingFields.filter(([, , type]) => type !== 'qr').map(([key]) => [key, String(settingsDraft[key] || '').trim()]))
    if (gcashQrFile) {
      const extension = gcashQrFile.name.split('.').pop()?.toLowerCase() || 'png'
      const path = `gcash/qr-${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('shop-assets').upload(path, gcashQrFile, { contentType: gcashQrFile.type })
      if (uploadError) { setError(uploadError.message); return }
      update.gcash_qr_image = supabase.storage.from('shop-assets').getPublicUrl(path).data.publicUrl
    }
    if (await run(async () => {
      const { data, error: cause } = await supabase.from('store_settings').update(update).eq('id', true).select().single()
      if (cause) throw cause
      setSettingsDraft(data)
    }, 'Shop details saved.', true)) {
      setGcashQrFile(null)
      if (gcashQrPreview) URL.revokeObjectURL(gcashQrPreview)
      setGcashQrPreview('')
    }
  }
  function chooseGcashQr(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('GCash QR must be a JPG, PNG, or WebP image up to 5 MB.'); event.target.value = ''; return }
    if (gcashQrPreview) URL.revokeObjectURL(gcashQrPreview)
    setGcashQrFile(file); setGcashQrPreview(URL.createObjectURL(file)); setError('')
  }
  async function saveImage(event) {
    event.preventDefault()
    const value = { image_url: imageDraft.image_url.trim(), caption: imageDraft.caption.trim(), sort_order: Number(imageDraft.sort_order), published: imageDraft.published }
    if ((!galleryFile && !value.image_url) || !Number.isInteger(value.sort_order)) { setError('Choose an image and enter a whole-number order.'); return }
    if (await run(async () => {
      const images = []
      if (galleryFile) {
        for (const [index, file] of galleryFile.entries()) {
          const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type]
          const path = `gallery/${crypto.randomUUID()}.${extension}`
          const { error: uploadError } = await supabase.storage.from('shop-assets').upload(path, file, { contentType: file.type })
          if (uploadError) throw uploadError
          images.push({ ...value, image_url: supabase.storage.from('shop-assets').getPublicUrl(path).data.publicUrl, sort_order: value.sort_order + index })
        }
      } else images.push(value)
      const query = imageDraft.id ? supabase.from('gallery_images').update(images[0]).eq('id', imageDraft.id) : supabase.from('gallery_images').insert(images)
      const { error: cause } = await query
      if (cause) throw cause
    }, 'Gallery image saved.', true)) { setImageDraft(emptyImage); setGalleryFile(null); setGalleryPreview('') }
  }
  function chooseGalleryImage(event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    if (files.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      setError('Every file must be a JPG, PNG, or WebP image up to 5 MB.'); event.target.value = ''; return
    }
    const selected = imageDraft.id ? files.slice(0, 1) : files
    setGalleryFile(selected); setGalleryPreview(URL.createObjectURL(selected[0])); setError('')
  }

  const productChange = (event) => setProductDraft((current) => ({ ...current, [event.target.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value, ...(event.target.name === 'category' ? { subcategory_id: '' } : {}) }))
  function chooseProductImage(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Choose an image file only.'); event.target.value = ''; return }
    if (file.size > 5 * 1024 * 1024) { setError('Product images must be 5 MB or smaller.'); event.target.value = ''; return }
    if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
    setProductImage(file); setImagePreview(URL.createObjectURL(file)); setError('')
  }
  function addCustomizationGroup(type) {
    setProductDraft((current) => ({ ...current, customizations: [...current.customizations, { id: crypto.randomUUID(), name: type === 'single' ? 'Size' : 'Add-ons', type, required: type === 'single', options: [] }] }))
  }
  function addTemperatureGroup() {
    setProductDraft((current) => ({ ...current, customizations: [...current.customizations, {
      id: crypto.randomUUID(), name: 'Temperature', type: 'single', required: true,
      options: ['Hot', 'Cold'].map((name) => ({ id: crypto.randomUUID(), name, price: 0 })),
    }] }))
  }
  function updateCustomization(groupId, changes) { setProductDraft((current) => ({ ...current, customizations: current.customizations.map((group) => group.id === groupId ? { ...group, ...changes } : group) })) }
  function removeCustomization(groupId) { setProductDraft((current) => ({ ...current, customizations: current.customizations.filter((group) => group.id !== groupId) })) }
  function addOption(groupId) { setProductDraft((current) => ({ ...current, customizations: current.customizations.map((group) => group.id === groupId ? { ...group, options: [...group.options, { id: crypto.randomUUID(), name: '', price: 0 }] } : group) })) }
  function updateOption(groupId, optionId, changes) { setProductDraft((current) => ({ ...current, customizations: current.customizations.map((group) => group.id === groupId ? { ...group, options: group.options.map((option) => option.id === optionId ? { ...option, ...changes } : option) } : group) })) }
  function removeOption(groupId, optionId) { setProductDraft((current) => ({ ...current, customizations: current.customizations.map((group) => group.id === groupId ? { ...group, options: group.options.filter((option) => option.id !== optionId) } : group) })) }
  const imageChange = (event) => setImageDraft((current) => ({ ...current, [event.target.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }))
  const settingsChange = (event) => setSettingsDraft((current) => ({ ...current, [event.target.name]: event.target.value }))
  async function logout() {
    setBusy(true)
    try { await signOut(); navigate('/admin/login', { replace: true }) }
    catch { setError('Could not sign out. Please try again.') }
    finally { setBusy(false) }
  }
  const productSubcategories = subcategories.filter((item) => item.category_name === productDraft.category)
  const subcategoryName = (id) => subcategories.find((item) => String(item.id) === String(id))?.name || 'Unassigned'
  return <div className="admin-shell"><aside className="admin-sidebar"><div className="admin-brand"><img className="admin-logo" src="/cafe-de-mell-logo.png" alt="Cafe de Mell logo" width="960" height="960" /><div><b>{storeSettings?.shop_name || 'Daily Cup'}</b><small>ADMIN WORKSPACE</small></div></div><nav aria-label="Admin sections">{tabs.map(([key, Icon, label]) => <button type="button" key={key} className={tab === key ? 'active' : ''} aria-current={tab === key ? 'page' : undefined} onClick={() => { setTab(key); setError(''); setMessage('') }}><Icon size={18} />{label}</button>)}</nav><button className="admin-signout" type="button" onClick={() => { void logout() }} disabled={busy}><LogOut size={17} />Sign out</button></aside><main className="admin-workspace"><div className="admin-page"><PageHeading eyebrow="SHOP MANAGEMENT" title={<>Admin <em>workspace.</em></>} description="Update the customer menu, track orders, and manage the shop details shown on the storefront."><button className="button outline small" type="button" onClick={() => { void load(true) }} disabled={loading || busy}><RefreshCw size={16} />Refresh</button></PageHeading>
    {error && <p className="error-panel" role="alert">{error}</p>}{message && <p className="success-panel" role="status"><Check size={17} />{message}</p>}
    {loading ? <p role="status">Loading shop data…</p> : <>
      {tab === 'products' && <><div className="admin-section-bar"><div><h2>Menu management</h2><p>Organize items, images, sizes, and add-ons.</p></div><button className="button outline small" type="button" onClick={() => { setTaxonomyOpen(true); startTaxonomy('category') }}><Tags size={16} />Manage categories</button></div><div className="admin-grid"><section className="admin-panel"><h2>{productDraft.id ? 'Edit menu item' : 'Add menu item'}</h2><form className="admin-form" onSubmit={saveProduct}><Field label="Name"><input name="name" value={productDraft.name} onChange={productChange} maxLength={100} required /></Field><div className="form-row"><Field label="Category"><select name="category" value={productDraft.category} onChange={productChange} required><option value="">Choose category</option>{categories.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></Field><Field label="Subcategory"><select name="subcategory_id" value={productDraft.subcategory_id || ''} onChange={productChange} required disabled={!productDraft.category}><option value="">Choose subcategory</option>{productSubcategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></div><div className="form-row"><Field label="Base price (₱)"><input name="price" type="number" min="0.01" step="0.01" value={productDraft.price} onChange={productChange} required /></Field><Field label="Display order"><input name="sort_order" type="number" step="1" value={productDraft.sort_order} onChange={productChange} required /></Field></div><Field label="Description"><textarea name="description" value={productDraft.description} onChange={productChange} rows={3} /></Field><Field label="Product image" hint="JPG, PNG, WebP, or GIF · maximum 5 MB"><label className="image-upload">{imagePreview ? <img src={imagePreview} alt="Product preview" /> : <span><ImagePlus size={25} />Choose an image</span>}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={chooseProductImage} /></label></Field><section className="customization-editor"><div className="customization-head"><div><h3>Customizations</h3><p>Add sizes or optional add-ons with extra prices.</p></div><div><button type="button" className="button outline small" onClick={() => addCustomizationGroup('single')}>+ Size</button><button type="button" className="button outline small" onClick={addTemperatureGroup}>+ Temp</button><button type="button" className="button outline small" onClick={() => addCustomizationGroup('multiple')}>+ Add-ons</button></div></div>{productDraft.customizations.map((group) => <div className="customization-group" key={group.id}><div className="customization-group-head"><input aria-label="Customization group name" value={group.name} onChange={(event) => updateCustomization(group.id, { name: event.target.value })} maxLength={50} required /><label><input type="checkbox" checked={group.required} onChange={(event) => updateCustomization(group.id, { required: event.target.checked })} />Required</label><button type="button" className="icon-button danger" aria-label={`Remove ${group.name}`} onClick={() => removeCustomization(group.id)}><Trash2 size={15} /></button></div>{group.options.map((option) => <div className="customization-option" key={option.id}><input aria-label="Option name" placeholder={group.type === 'single' ? 'e.g. Large' : 'e.g. Extra shot'} value={option.name} onChange={(event) => updateOption(group.id, option.id, { name: event.target.value })} required />{group.name.trim().toLowerCase() !== 'temperature' && <label><span>+ ₱</span><input aria-label="Additional price" type="number" min="0" step="0.01" value={option.price} onChange={(event) => updateOption(group.id, option.id, { price: Number(event.target.value) })} required /></label>}<button type="button" className="icon-button danger" aria-label={`Remove ${option.name || 'option'}`} onClick={() => removeOption(group.id, option.id)}><X size={15} /></button></div>)}<button type="button" className="text-button" onClick={() => addOption(group.id)}><Plus size={14} />Add option</button></div>)}</section><label className="admin-check"><input name="available" type="checkbox" checked={productDraft.available} onChange={productChange} /> Available to order</label><div className="admin-actions"><button className="button primary small" disabled={busy || !categories.length || !subcategories.length}>Save item</button>{productDraft.id && <button className="button outline small" type="button" onClick={() => { setProductDraft(emptyProduct); setProductImage(null); setImagePreview('') }}>Cancel edit</button>}</div></form></section><section className="admin-panel admin-products-panel"><h2>Menu items <span>{products.length}</span></h2>{products.length ? <div className="admin-product-cards">{products.map((product) => <article key={product.id}><div className="admin-product-image">{product.image ? <img src={product.image} alt={product.name} /> : <span><Image size={28} /></span>}<i className={product.available ? 'available' : ''}>{product.available ? 'Available' : 'Unavailable'}</i></div><div className="admin-product-card-copy"><div><small>{product.category} · {subcategoryName(product.subcategory_id)}</small><h3>{product.name}</h3><b>{money(product.price)}</b>{product.customizations?.length > 0 && <p>{product.customizations.length} customization {product.customizations.length === 1 ? 'group' : 'groups'}</p>}</div><div className="admin-item-actions"><button className="icon-button" aria-label={`Edit ${product.name}`} type="button" onClick={() => editProduct(product)}><Pencil size={16} /></button><button className="icon-button danger" aria-label={`Delete ${product.name}`} type="button" onClick={() => { void deleteProduct(product) }}><Trash2 size={16} /></button></div></div></article>)}</div> : <p>No menu items yet. Add a category and subcategory, then your first product.</p>}</section></div></>}
      {tab === 'orders' && <AdminOrders orders={orders} busy={busy} setError={setError} onUpdated={() => load()} />}
      {tab === 'shop' && settingsDraft && <section className="admin-panel admin-settings"><h2>Customer-facing shop details</h2><form className="admin-form" onSubmit={saveSettings}>{settingFields.map(([key, label, type]) => <Field key={key} label={label}>{type === 'textarea' ? <textarea name={key} value={settingsDraft[key] || ''} onChange={settingsChange} rows={5} /> : type === 'qr' ? <label className="image-upload qr-upload">{gcashQrPreview || settingsDraft.gcash_qr_image ? <img src={gcashQrPreview || settingsDraft.gcash_qr_image} alt="GCash QR preview" /> : <span><ImagePlus size={25} />Upload GCash QR</span>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseGcashQr} /></label> : <input name={key} type={type} value={settingsDraft[key] || ''} onChange={settingsChange} required={key === 'shop_name'} />}</Field>)}<button className="button primary small" disabled={busy}>Save shop details</button></form></section>}
      {tab === 'gallery' && <div className="admin-grid"><section className="admin-panel"><h2>{imageDraft.id ? 'Edit gallery image' : 'Add gallery image'}</h2><form className="admin-form" onSubmit={saveImage}><Field label="Gallery image" hint="JPG, PNG, or WebP · maximum 5 MB"><label className="image-upload">{galleryPreview || imageDraft.image_url ? <img src={galleryPreview || imageDraft.image_url} alt="Gallery preview" /> : <span><ImagePlus size={25} />Choose an image</span>}<input key={imageDraft.id || galleryPreview || 'new'} type="file" accept="image/jpeg,image/png,image/webp" multiple={!imageDraft.id} onChange={chooseGalleryImage} disabled={busy} /></label>{galleryFile && <small>{galleryFile.length} {galleryFile.length === 1 ? 'image' : 'images'} selected: {galleryFile.map((file) => file.name).join(', ')}</small>}</Field><Field label="Caption"><input name="caption" value={imageDraft.caption} onChange={imageChange} maxLength={160} /></Field><Field label="Display order"><input name="sort_order" type="number" step="1" value={imageDraft.sort_order} onChange={imageChange} required /></Field><label className="admin-check"><input name="published" type="checkbox" checked={imageDraft.published} onChange={imageChange} /> Visible to customers</label><div className="admin-actions"><button className="button primary small" disabled={busy}>Save image</button>{imageDraft.id && <button className="button outline small" type="button" onClick={() => { setImageDraft(emptyImage); setGalleryFile(null); setGalleryPreview('') }}>Cancel edit</button>}</div></form></section><section className="admin-panel"><h2>Gallery images <span>{gallery.length}</span></h2>{gallery.length ? <div className="admin-list">{gallery.map((item) => <article key={item.id}><div><img src={item.image_url} alt="" /><div><b>{item.caption || 'Untitled image'}</b><small>{item.published ? 'Published' : 'Hidden'}</small></div></div><button className="button outline small" type="button" onClick={() => editImage(item)}>Edit</button></article>)}</div> : <p>No gallery images yet.</p>}</section></div>}
    </>}
  </div></main>{taxonomyOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTaxonomyOpen(false) }}><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="taxonomy-title"><header><div><p className="eyebrow">MENU ORGANIZATION</p><h2 id="taxonomy-title">Categories &amp; subcategories</h2></div><button className="icon-button" type="button" aria-label="Close category manager" onClick={() => setTaxonomyOpen(false)}><X size={20} /></button></header><div className="taxonomy-layout"><div className="taxonomy-list"><div className="taxonomy-list-head"><h3>Categories</h3><button className="text-button" type="button" onClick={() => startTaxonomy('category')}><Plus size={14} />New</button></div>{categories.map((category) => <div className="taxonomy-group" key={category.name}><div className="taxonomy-row"><div><b>{category.name}</b><small>{subcategories.filter((item) => item.category_name === category.name).length} subcategories</small></div><div><button className="icon-button" type="button" aria-label={`Edit ${category.name}`} onClick={() => startTaxonomy('category', category)}><Pencil size={15} /></button><button className="icon-button danger" type="button" aria-label={`Delete ${category.name}`} onClick={() => { void deleteTaxonomy('category', category) }}><Trash2 size={15} /></button></div></div>{subcategories.filter((item) => item.category_name === category.name).map((item) => <div className="taxonomy-row subcategory-row" key={item.id}><span>{item.name}</span><div><button className="icon-button" type="button" aria-label={`Edit ${item.name}`} onClick={() => startTaxonomy('subcategory', item)}><Pencil size={14} /></button><button className="icon-button danger" type="button" aria-label={`Delete ${item.name}`} onClick={() => { void deleteTaxonomy('subcategory', item) }}><Trash2 size={14} /></button></div></div>)}</div>)}</div><form className="admin-form taxonomy-form" onSubmit={saveTaxonomy}><h3>{taxonomyDraft.id || taxonomyDraft.originalName ? 'Edit' : 'Add'} {taxonomyDraft.kind}</h3><div className="taxonomy-kind"><button type="button" className={taxonomyDraft.kind === 'category' ? 'active' : ''} onClick={() => startTaxonomy('category')}>Category</button><button type="button" className={taxonomyDraft.kind === 'subcategory' ? 'active' : ''} onClick={() => startTaxonomy('subcategory')} disabled={!categories.length}>Subcategory</button></div>{taxonomyDraft.kind === 'subcategory' && <Field label="Parent category"><select value={taxonomyDraft.category_name} onChange={(event) => setTaxonomyDraft((current) => ({ ...current, category_name: event.target.value }))} required>{categories.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></Field>}<Field label="Name"><input autoFocus value={taxonomyDraft.name} onChange={(event) => setTaxonomyDraft((current) => ({ ...current, name: event.target.value }))} maxLength={50} placeholder={taxonomyDraft.kind === 'category' ? 'e.g. Drinks' : 'e.g. Coffee'} required /></Field><Field label="Display order"><input type="number" step="1" value={taxonomyDraft.sort_order} onChange={(event) => setTaxonomyDraft((current) => ({ ...current, sort_order: event.target.value }))} required /></Field><button className="button primary small" disabled={busy}>Save {taxonomyDraft.kind}</button></form></div></section></div>}</div>
}
