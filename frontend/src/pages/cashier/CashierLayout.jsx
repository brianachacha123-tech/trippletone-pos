import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import {
  saveOfflineSale,
  getUnsyncedSales,
  getPendingSyncCount,
  getCachedProducts,
  getCachedCategories,
  cacheProducts,
  cacheCategories,
  isOnline,
  getAllOfflineSales,
} from '../../utils/offlineStorage';
import { syncOfflineSales, refreshCache, startAutoSync, stopAutoSync } from '../../utils/syncManager';

export default function CashierLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [saleHistory, setSaleHistory] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingSync, setPendingSync] = useState(0);
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [qtyEditor, setQtyEditor] = useState(null); // { product_id, value } - Loyverse-style quantity numpad

  // Load products - try API first, fall back to cache
  const loadProducts = useCallback(async () => {
    if (navigator.onLine) {
      try {
        const res = await api.get('/products');
        setProducts(res.data);
        await cacheProducts(res.data); // Cache for offline use
        return;
      } catch (err) {
        console.error('API error, loading from cache:', err);
      }
    }
    // Offline fallback - load from IndexedDB
    const cached = await getCachedProducts();
    if (cached.length > 0) {
      setProducts(cached);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    if (navigator.onLine) {
      try {
        const res = await api.get('/products/meta/categories');
        setCategories(res.data);
        await cacheCategories(res.data);
        return;
      } catch (err) { console.error(err); }
    }
    const cached = await getCachedCategories();
    if (cached.length > 0) setCategories(cached);
  }, []);

  useEffect(() => {
    loadProducts();
    loadCategories();

    // Auto-sync when coming back online
    const handleOnline = async () => {
      setOnline(true);
      setMessage('🟢 Back online! Syncing...');
      await refreshCache();
      await loadProducts();
      const result = await syncOfflineSales();
      if (result.synced > 0) {
        setMessage(`✅ Synced ${result.synced} offline sale(s)!`);
      } else {
        setMessage('🟢 Connected to server');
      }
      setPendingSync(0);
      setTimeout(() => setMessage(''), 4000);
    };

    const handleOffline = () => {
      setOnline(false);
      setMessage('📡 Offline mode - sales will be saved locally');
      setTimeout(() => setMessage(''), 4000);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Start auto-sync
    startAutoSync((result) => {
      setPendingSync(0);
    });

    // Check pending sync count
    getPendingSyncCount().then(setPendingSync);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      stopAutoSync();
    };
  }, [loadProducts, loadCategories]);

  const filteredProducts = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchCategory = !selectedCategory || p.category_id === parseInt(selectedCategory);
    return matchSearch && matchCategory && p.status === 'active' && parseFloat(p.current_stock) > 0;
  });

  const addToCart = (product) => {
    const existing = cart.find(item => item.product_id === product.id);
    if (existing) {
      setCart(cart.map(item =>
        item.product_id === product.id
          ? { ...item, quantity: parseFloat(item.quantity) + 1 }
          : item
      ));
    } else {
      setCart([...cart, {
        product_id: product.id,
        name: product.name,
        unit_price: parseFloat(product.selling_price),
        buying_price: parseFloat(product.buying_price),
        quantity: 1,
        stock: parseFloat(product.current_stock)
      }]);
    }
  };

  const updateQuantity = (productId, delta) => {
    setCart(cart.map(item => {
      if (item.product_id === productId) {
        const newQty = item.quantity + delta;
        if (newQty <= 0) return null;
        if (newQty > item.stock && navigator.onLine) {
          setMessage('⚠️ Insufficient stock!');
          setTimeout(() => setMessage(''), 3000);
          return item;
        }
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(Boolean));
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.product_id !== productId));
  };

  const clearCart = () => setCart([]);

  // Loyverse-style quantity editing: tap a cart line's quantity to open the numpad
  const openQtyEditor = (item) => {
    setQtyEditor({ product_id: item.product_id, value: String(item.quantity) });
  };

  const closeQtyEditor = () => setQtyEditor(null);

  const confirmQty = () => {
    if (!qtyEditor) return;
    const target = qtyEditor.product_id;
    const qty = parseFloat(qtyEditor.value);
    const item = cart.find(i => i.product_id === target);
    setQtyEditor(null);
    if (!item) return;

    if (isNaN(qty) || qty <= 0) {
      setMessage('⚠️ Enter a valid quantity');
      setTimeout(() => setMessage(''), 3000);
      return;
    }
    if (qty > item.stock && navigator.onLine) {
      setMessage(`⚠️ Insufficient stock! Max: ${item.stock}`);
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    setCart(cart.map(i => i.product_id === target ? { ...i, quantity: qty } : i));
  };

  // Show integers as-is, decimals up to 2 places (e.g. 0.5, 2.25)
  const formatQty = (q) => (Number.isInteger(q) ? String(q) : String(parseFloat(q.toFixed(2))));

  const getCartTotal = () => {
    return cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  };

  const submitSale = async () => {
    if (cart.length === 0) {
      setMessage('⚠️ Cart is empty!');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    setLoading(true);
    const saleData = {
      items: cart.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price
      })),
      payment_method: paymentMethod
    };

    if (navigator.onLine) {
      try {
        await api.post('/sales', saleData);
        setMessage('✅ Sale completed successfully!');
        setTimeout(() => setMessage(''), 3000);
        setCart([]);
        loadProducts();
      } catch (err) {
        // If online request fails, save offline
        await saveOfflineSale(saleData);
        setPendingSync(prev => prev + 1);
        setMessage('📱 Sale saved offline - will sync when connected');
        setTimeout(() => setMessage(''), 4000);
        setCart([]);
      }
    } else {
      // Offline - save to IndexedDB
      await saveOfflineSale(saleData);
      setPendingSync(prev => prev + 1);
      setMessage('📱 Sale saved offline - will sync when connected');
      setTimeout(() => setMessage(''), 4000);
      setCart([]);
    }

    setLoading(false);
  };

  const manualSync = async () => {
    if (!navigator.onLine) {
      setMessage('⚠️ No internet connection');
      setTimeout(() => setMessage(''), 3000);
      return;
    }
    setMessage('🔄 Syncing...');
    await refreshCache();
    await loadProducts();
    const result = await syncOfflineSales();
    setPendingSync(0);
    if (result.synced > 0) {
      setMessage(`✅ Synced ${result.synced} offline sale(s)!`);
    } else {
      setMessage('✅ Everything is up to date');
    }
    setTimeout(() => setMessage(''), 4000);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f0f2f5', touchAction: 'manipulation' }}>
      {/* Top Bar */}
      <div style={{ background: '#1a1a2e', color: '#fff', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ fontSize: '16px' }}>🍺 Trippletone Bar</h2>
          <span style={{ color: '#e94560', fontSize: '13px' }}>{user?.full_name}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Online/Offline indicator */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
            background: online ? 'rgba(39,174,96,0.2)' : 'rgba(231,76,60,0.2)',
            color: online ? '#27ae60' : '#e74c3c'
          }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: online ? '#27ae60' : '#e74c3c' }} />
            {online ? 'Online' : 'Offline'}
            {pendingSync > 0 && <span style={{ background: '#f39c12', color: '#fff', padding: '1px 6px', borderRadius: '10px', fontSize: '11px' }}>{pendingSync}</span>}
          </div>
          {pendingSync > 0 && (
            <button onClick={manualSync} style={{ background: '#f39c12', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
              🔄 Sync
            </button>
          )}
          <button onClick={() => setSaleHistory(!saleHistory)} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
            📋 Sales
          </button>
          <button onClick={handleLogout} style={{ background: '#e94560', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
            Logout
          </button>
        </div>
      </div>

      {message && (
        <div style={{
          padding: '10px 16px', fontWeight: 600, textAlign: 'center', fontSize: '14px',
          background: message.includes('✅') ? '#d4edda' : message.includes('⚠️') ? '#fff3cd' : message.includes('📡') || message.includes('📱') ? '#d1ecf1' : '#f8d7da',
          color: message.includes('✅') ? '#155724' : message.includes('⚠️') ? '#856404' : message.includes('📡') || message.includes('📱') ? '#0c5460' : '#721c24'
        }}>
          {message}
        </div>
      )}

      {saleHistory ? (
        <SaleHistory userId={user?.id} onBack={() => setSaleHistory(false)} />
      ) : (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr minmax(320px, 380px)', gap: '0', overflow: 'hidden' }}>
          {/* Products Panel */}
          <div style={{ padding: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Search & Filter */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="🔍 Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ flex: '1 1 200px', padding: '12px 14px', border: '2px solid #ddd', borderRadius: '10px', fontSize: '16px', outline: 'none', minWidth: '150px' }}
              />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={{ padding: '12px 14px', border: '2px solid #ddd', borderRadius: '10px', fontSize: '16px', outline: 'none', minWidth: '140px' }}
              >
                <option value="">All</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Product Grid - touch-friendly */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px', alignContent: 'start', WebkitOverflowScrolling: 'touch' }}>
              {filteredProducts.map(product => (
                <div
                  key={product.id}
                  onClick={() => addToCart(product)}
                  style={{
                    background: '#fff',
                    border: '2px solid #eee',
                    borderRadius: '12px',
                    padding: '14px 10px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s',
                    userSelect: 'none',
                    WebkitTapHighlightColor: 'transparent',
                    minHeight: '90px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                  }}
                  onTouchStart={(e) => { e.currentTarget.style.borderColor = '#0f3460'; e.currentTarget.style.transform = 'scale(0.97)'; }}
                  onTouchEnd={(e) => { e.currentTarget.style.borderColor = '#eee'; e.currentTarget.style.transform = 'none'; }}
                  onMouseOver={(e) => { e.currentTarget.style.borderColor = '#0f3460'; e.currentTarget.style.transform = 'scale(0.97)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.borderColor = '#eee'; e.currentTarget.style.transform = 'none'; }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', lineHeight: '1.2' }}>{product.name}</div>
                  <div style={{ fontSize: '17px', color: '#e94560', fontWeight: 700 }}>KSh {parseFloat(product.selling_price).toLocaleString()}</div>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>Stock: {parseFloat(product.current_stock).toLocaleString()}</div>
                </div>
              ))}
              {filteredProducts.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#888' }}>
                  {online ? 'No products found' : 'No cached products - connect to internet to load'}
                </div>
              )}
            </div>
          </div>

          {/* Cart Panel - tablet friendly */}
          <div style={{ background: '#fff', display: 'flex', flexDirection: 'column', borderLeft: '1px solid #eee' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #eee', fontWeight: 700, fontSize: '16px', display: 'flex', justifyContent: 'space-between' }}>
              <span>🛒 Cart</span>
              <span style={{ color: '#888', fontSize: '14px' }}>{cart.length} items</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', WebkitOverflowScrolling: 'touch' }}>
              {cart.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#aaa' }}>
                  <div style={{ fontSize: '48px', marginBottom: '8px' }}>🛒</div>
                  <div style={{ fontSize: '14px' }}>Tap products to add to cart</div>
                </div>
              )}
              {cart.map(item => (
                <div key={item.product_id} style={{ display: 'flex', alignItems: 'center', padding: '12px 4px', borderBottom: '1px solid #f5f5f5', gap: '8px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                    <div style={{ fontSize: '12px', color: '#888' }}>KSh {item.unit_price.toLocaleString()}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button onClick={(e) => { e.stopPropagation(); updateQuantity(item.product_id, -1); }}
                      style={{ width: '36px', height: '36px', borderRadius: '50%', border: '2px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, touchAction: 'manipulation' }}>−</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); openQtyEditor(item); }}
                      title="Tap to type quantity"
                      style={{ minWidth: '46px', padding: '6px 10px', border: '2px solid #0f3460', borderRadius: '8px', background: '#eef3fb', color: '#0f3460', cursor: 'pointer', fontWeight: 800, fontSize: '15px', textAlign: 'center', touchAction: 'manipulation' }}
                    >{formatQty(item.quantity)}</button>
                    <button onClick={(e) => { e.stopPropagation(); updateQuantity(item.product_id, 1); }}
                      style={{ width: '36px', height: '36px', borderRadius: '50%', border: '2px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, touchAction: 'manipulation' }}>+</button>
                    <button onClick={(e) => { e.stopPropagation(); removeFromCart(item.product_id); }}
                      style={{ marginLeft: '2px', background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '18px', padding: '4px', touchAction: 'manipulation' }}>✕</button>
                  </div>
                  <div style={{ minWidth: '75px', textAlign: 'right', fontWeight: 700, fontSize: '14px' }}>
                    KSh {(item.quantity * item.unit_price).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            {/* Cart Footer */}
            <div style={{ padding: '14px 16px', borderTop: '2px solid #eee', background: '#fafafa' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '22px', fontWeight: 700, marginBottom: '14px' }}>
                <span>Total:</span>
                <span style={{ color: '#0f3460' }}>KSh {getCartTotal().toLocaleString()}</span>
              </div>

              {/* Payment Methods - large touch targets */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '14px' }}>
                {[
                  { key: 'cash', label: '💵 Cash' },
                  { key: 'mpesa', label: '📱 M-Pesa' },
                  { key: 'card', label: '💳 Card' },
                  { key: 'other', label: '🔄 Other' },
                ].map(method => (
                  <button
                    key={method.key}
                    onClick={() => setPaymentMethod(method.key)}
                    style={{
                      padding: '12px',
                      border: `2px solid ${paymentMethod === method.key ? '#0f3460' : '#ddd'}`,
                      borderRadius: '10px',
                      background: paymentMethod === method.key ? '#0f3460' : '#fff',
                      color: paymentMethod === method.key ? '#fff' : '#333',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 600,
                      touchAction: 'manipulation',
                      transition: 'all 0.15s',
                    }}
                  >
                    {method.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={clearCart}
                  style={{ flex: 1, padding: '14px', border: '2px solid #ddd', borderRadius: '10px', background: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: 600, touchAction: 'manipulation' }}>
                  Clear
                </button>
                <button
                  onClick={submitSale}
                  disabled={loading || cart.length === 0}
                  style={{
                    flex: 2,
                    padding: '14px',
                    border: 'none',
                    borderRadius: '10px',
                    background: cart.length === 0 ? '#ccc' : '#27ae60',
                    color: '#fff',
                    cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                    fontSize: '16px',
                    fontWeight: 700,
                    touchAction: 'manipulation',
                    transition: 'all 0.15s',
                  }}
                >
                  {loading ? 'Processing...' : `Pay KSh ${getCartTotal().toLocaleString()}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loyverse-style quantity numpad overlay */}
      {qtyEditor && (
        <QuantityPad
          item={cart.find(i => i.product_id === qtyEditor.product_id)}
          value={qtyEditor.value}
          onChange={(v) => setQtyEditor({ ...qtyEditor, value: v })}
          onConfirm={confirmQty}
          onCancel={closeQtyEditor}
        />
      )}
    </div>
  );
}

// Touch-optimized numeric keypad for entering item quantities (Loyverse-style)
function QuantityPad({ item, value, onChange, onConfirm, onCancel }) {
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'];

  const press = (k) => {
    if (k === '⌫') {
      onChange(value.length > 1 ? value.slice(0, -1) : '');
      return;
    }
    if (k === '.') {
      if (!value.includes('.')) onChange(value === '' ? '0.' : value + '.');
      return;
    }
    // digits only; max 2 decimals; sensible ceiling (999)
    const [whole, dec] = value.split('.');
    if (dec !== undefined && dec.length >= 2) return;
    if (whole && whole.length >= 3 && dec === undefined) return;
    onChange(value === '0' ? k : value + k);
  };

  const keyStyle = {
    padding: '16px 0', fontSize: '24px', fontWeight: 700, border: 'none', borderRadius: '12px',
    background: '#fff', color: '#1a1a2e', cursor: 'pointer', touchAction: 'manipulation',
    boxShadow: '0 1px 3px rgba(0,0,0,0.12)', transition: 'all 0.1s',
  };
  const totalPreview = (parseFloat(value || '0') || 0) * (item ? item.unit_price : 0);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(10,10,20,0.55)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: '#f0f2f5', borderRadius: '18px', padding: '18px', width: '300px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.35)', touchAction: 'manipulation',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ textAlign: 'center', marginBottom: '12px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#333' }}>{item ? item.name : ''}</div>
          <div style={{ fontSize: '13px', color: '#888' }}>Quantity (decimals allowed, e.g. 0.5)</div>
        </div>
        <div style={{
          background: '#fff', borderRadius: '12px', padding: '14px', textAlign: 'center',
          fontSize: '28px', fontWeight: 800, color: '#0f3460', marginBottom: '14px',
          border: '2px solid #0f3460', minHeight: '28px',
        }}>
          {value || '0'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
          {keys.map(k => (
            <button key={k} onClick={() => press(k)} style={keyStyle}>{k}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: '14px 0', border: 'none', borderRadius: '12px', background: '#e74c3c', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation' }}
          >Cancel</button>
          <button
            onClick={onConfirm}
            style={{ flex: 2, padding: '14px 0', border: 'none', borderRadius: '12px', background: '#27ae60', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation' }}
          >OK · KSh {totalPreview.toLocaleString()}</button>
        </div>
      </div>
    </div>
  );
}

function SaleHistory({ userId, onBack }) {
  const [sales, setSales] = useState([]);
  const [offlineSales, setOfflineSales] = useState([]);
  const [tab, setTab] = useState('online');

  useEffect(() => { loadSales(); loadOfflineSales(); }, []);

  const loadSales = async () => {
    if (!navigator.onLine) return;
    try {
      const res = await api.get('/sales/my-sales');
      setSales(res.data);
    } catch (err) { console.error(err); }
  };

  const loadOfflineSales = async () => {
    const all = await getAllOfflineSales();
    setOfflineSales(all);
  };

  return (
    <div style={{ flex: 1, padding: '20px', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <h2>My Sales History</h2>
        <button onClick={onBack} style={{ padding: '10px 16px', border: '2px solid #ddd', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}>← Back to POS</button>
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
        <button onClick={() => setTab('online')} style={{ padding: '10px 20px', border: 'none', borderBottom: tab === 'online' ? '3px solid #0f3460' : '3px solid transparent', background: 'none', cursor: 'pointer', fontWeight: 600, color: tab === 'online' ? '#0f3460' : '#888', fontSize: '14px' }}>
          Online Sales ({sales.length})
        </button>
        <button onClick={() => setTab('offline')} style={{ padding: '10px 20px', border: 'none', borderBottom: tab === 'offline' ? '3px solid #f39c12' : '3px solid transparent', background: 'none', cursor: 'pointer', fontWeight: 600, color: tab === 'offline' ? '#f39c12' : '#888', fontSize: '14px' }}>
          Offline Sales ({offlineSales.length})
        </button>
      </div>

      {tab === 'online' && (
        <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr><th style={{ padding: '12px 16px', textAlign: 'left', background: '#fafafa', fontSize: '13px' }}>Sale ID</th><th style={{ padding: '12px 16px', textAlign: 'left', background: '#fafafa', fontSize: '13px' }}>Date</th><th style={{ padding: '12px 16px', textAlign: 'left', background: '#fafafa', fontSize: '13px' }}>Payment</th><th style={{ padding: '12px 16px', textAlign: 'right', background: '#fafafa', fontSize: '13px' }}>Revenue</th></tr>
            </thead>
            <tbody>
              {sales.map(sale => (
                <tr key={sale.id}>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '13px' }}>{sale.sale_id}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px' }}>{new Date(sale.date).toLocaleString()}</td>
                  <td style={{ padding: '12px 16px' }}><span style={{ background: '#d1ecf1', color: '#0c5460', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>{sale.payment_method}</span></td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>KSh {parseFloat(sale.total_revenue).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'offline' && (
        <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          {offlineSales.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>No offline sales</div>}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr><th style={{ padding: '12px 16px', textAlign: 'left', background: '#fafafa', fontSize: '13px' }}>ID</th><th style={{ padding: '12px 16px', textAlign: 'left', background: '#fafafa', fontSize: '13px' }}>Time</th><th style={{ padding: '12px 16px', textAlign: 'left', background: '#fafafa', fontSize: '13px' }}>Payment</th><th style={{ padding: '12px 16px', textAlign: 'right', background: '#fafafa', fontSize: '13px' }}>Total</th><th style={{ padding: '12px 16px', textAlign: 'center', background: '#fafafa', fontSize: '13px' }}>Status</th></tr>
            </thead>
            <tbody>
              {offlineSales.map(sale => (
                <tr key={sale.id}>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '12px' }}>{sale.offlineId}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px' }}>{new Date(sale.timestamp).toLocaleString()}</td>
                  <td style={{ padding: '12px 16px' }}><span style={{ background: '#d1ecf1', color: '#0c5460', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>{sale.payment_method}</span></td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>KSh {sale.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0).toLocaleString()}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{ background: sale.synced ? '#d4edda' : '#fff3cd', color: sale.synced ? '#155724' : '#856404', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
                      {sale.synced ? 'Synced' : 'Pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
