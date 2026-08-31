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
  const [qtyEditor, setQtyEditor] = useState(null);
  const [showCart, setShowCart] = useState(false); // Mobile cart toggle

  // Load products - try API first, fall back to cache
  const loadProducts = useCallback(async () => {
    if (navigator.onLine) {
      try {
        const res = await api.get('/products');
        setProducts(res.data);
        await cacheProducts(res.data);
        return;
      } catch (err) {
        console.error('API error, loading from cache:', err);
      }
    }
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

    startAutoSync((result) => {
      setPendingSync(0);
    });

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
    // On mobile, show cart when item added
    setShowCart(true);
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
        setShowCart(false);
        loadProducts();
      } catch (err) {
        await saveOfflineSale(saleData);
        setPendingSync(prev => prev + 1);
        setMessage('📱 Sale saved offline - will sync when connected');
        setTimeout(() => setMessage(''), 4000);
        setCart([]);
        setShowCart(false);
      }
    } else {
      await saveOfflineSale(saleData);
      setPendingSync(prev => prev + 1);
      setMessage('📱 Sale saved offline - will sync when connected');
      setTimeout(() => setMessage(''), 4000);
      setCart([]);
      setShowCart(false);
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
    <div className="loyverse-pos" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f5f6fa', touchAction: 'manipulation' }}>
      {/* Top Bar - Loyverse Style */}
      <div className="loyverse-topbar">
        <div className="loyverse-topbar-left">
          <div className="loyverse-logo">
            <span className="loyverse-logo-icon">🍺</span>
            <span className="loyverse-logo-text">Trippletone</span>
          </div>
          <div className="loyverse-user-badge">
            <span className="loyverse-user-avatar">👤</span>
            <span className="loyverse-user-name">{user?.full_name}</span>
          </div>
        </div>
        <div className="loyverse-topbar-right">
          {/* Online/Offline indicator */}
          <div className={`loyverse-status-badge ${online ? 'online' : 'offline'}`}>
            <div className="loyverse-status-dot" />
            <span>{online ? 'Online' : 'Offline'}</span>
            {pendingSync > 0 && <span className="loyverse-sync-count">{pendingSync}</span>}
          </div>
          
          {pendingSync > 0 && (
            <button onClick={manualSync} className="loyverse-sync-btn" title="Sync offline sales">
              🔄
            </button>
          )}
          
          <button onClick={() => { setSaleHistory(!saleHistory); setShowCart(false); }} className="loyverse-history-btn" title="Sales History">
            📋
          </button>
          
          {/* Mobile cart toggle button */}
          <button
            onClick={() => setShowCart(!showCart)}
            className="loyverse-cart-toggle"
          >
            🛒 {cart.length > 0 && <span className="loyverse-cart-badge">{cart.length}</span>}
          </button>
          
          <button onClick={handleLogout} className="loyverse-logout-btn" title="Logout">
            🚪
          </button>
        </div>
      </div>

      {/* Message Bar */}
      {message && (
        <div className={`loyverse-message ${message.includes('✅') ? 'success' : message.includes('⚠️') ? 'warning' : message.includes('📡') || message.includes('📱') ? 'info' : 'error'}`}>
          {message}
        </div>
      )}

      {saleHistory ? (
        <SaleHistory userId={user?.id} onBack={() => setSaleHistory(false)} />
      ) : (
        <>
          {/* Main POS Layout - Loyverse Style */}
          <div className="loyverse-pos-layout cashier-layout">
            {/* Products Panel */}
            <div className="loyverse-products-panel" style={{ display: showCart ? 'none' : 'flex' }}>
              {/* Category Tabs - Loyverse Style */}
              <div className="loyverse-category-tabs">
                <button
                  onClick={() => setSelectedCategory('')}
                  className={`loyverse-category-tab ${selectedCategory === '' ? 'active' : ''}`}
                >
                  All Items
                </button>
                {categories.map(category => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id.toString())}
                    className={`loyverse-category-tab ${selectedCategory === category.id.toString() ? 'active' : ''}`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div className="loyverse-search-container">
                <span className="loyverse-search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search products..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="loyverse-search-input"
                />
              </div>

              {/* Product List - List View */}
              <div className="loyverse-product-list">
                {filteredProducts.map(product => (
                  <div
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className="loyverse-product-list-item"
                    onTouchStart={(e) => { e.currentTarget.classList.add('pressed'); }}
                    onTouchEnd={(e) => { e.currentTarget.classList.remove('pressed'); }}
                    onMouseOver={(e) => { e.currentTarget.classList.add('hovered'); }}
                    onMouseOut={(e) => { e.currentTarget.classList.remove('hovered'); }}
                  >
                    <div className="loyverse-list-item-emoji">📦</div>
                    <div className="loyverse-list-item-info">
                      <div className="loyverse-list-item-name">{product.name}</div>
                      <div className="loyverse-list-item-stock">Stock: {parseFloat(product.current_stock).toLocaleString()} {product.unit}</div>
                    </div>
                    <div className="loyverse-list-item-price">KSh {parseFloat(product.selling_price).toLocaleString()}</div>
                  </div>
                ))}
                {filteredProducts.length === 0 && (
                  <div className="loyverse-empty-products">
                    {online ? 'No products found' : 'No cached products - connect to internet to load'}
                  </div>
                )}
              </div>
            </div>

            {/* Cart Panel - Loyverse Style */}
            <div className={`loyverse-cart-panel cashier-cart ${showCart ? 'mobile-visible' : ''}`}>
              {/* Cart Header */}
              <div className="loyverse-cart-header">
                <div className="loyverse-cart-title">
                  <span className="loyverse-cart-icon">🛒</span>
                  <span>Current Order</span>
                </div>
                <div className="loyverse-cart-meta">
                  <span className="loyverse-cart-count">{cart.length} items</span>
                  <button
                    onClick={() => setShowCart(false)}
                    className="loyverse-close-cart"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Cart Items */}
              <div className="loyverse-cart-items">
                {cart.length === 0 && (
                  <div className="loyverse-empty-cart">
                    <div className="loyverse-empty-cart-icon">🛒</div>
                    <div className="loyverse-empty-cart-text">Tap products to add to cart</div>
                    <div className="loyverse-empty-cart-subtext">Items will appear here</div>
                  </div>
                )}
                {cart.map(item => (
                  <div key={item.product_id} className="loyverse-cart-item">
                    <div className="loyverse-cart-item-info">
                      <div className="loyverse-cart-item-name">{item.name}</div>
                      <div className="loyverse-cart-item-price">KSh {item.unit_price.toLocaleString()} each</div>
                    </div>
                    <div className="loyverse-cart-item-controls">
                      <button 
                        onClick={(e) => { e.stopPropagation(); updateQuantity(item.product_id, -1); }}
                        className="loyverse-qty-btn minus"
                      >
                        −
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); openQtyEditor(item); }}
                        className="loyverse-qty-display"
                        title="Tap to type quantity"
                      >
                        {formatQty(item.quantity)}
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); updateQuantity(item.product_id, 1); }}
                        className="loyverse-qty-btn plus"
                      >
                        +
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeFromCart(item.product_id); }}
                        className="loyverse-remove-btn"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="loyverse-cart-item-total">
                      KSh {(item.quantity * item.unit_price).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>

              {/* Cart Footer - Payment Section */}
              <div className="loyverse-cart-footer">
                {/* Subtotal */}
                <div className="loyverse-subtotal-row">
                  <span>Subtotal</span>
                  <span className="loyverse-subtotal-amount">KSh {getCartTotal().toLocaleString()}</span>
                </div>

                {/* Payment Methods - Loyverse Style */}
                <div className="loyverse-payment-methods">
                  <button
                    onClick={() => setPaymentMethod('cash')}
                    className={`loyverse-payment-btn ${paymentMethod === 'cash' ? 'active' : ''}`}
                  >
                    <span className="loyverse-payment-icon">💵</span>
                    <span className="loyverse-payment-label">Cash</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('mpesa')}
                    className={`loyverse-payment-btn ${paymentMethod === 'mpesa' ? 'active' : ''}`}
                  >
                    <span className="loyverse-payment-icon">📱</span>
                    <span className="loyverse-payment-label">M-Pesa</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('card')}
                    className={`loyverse-payment-btn ${paymentMethod === 'card' ? 'active' : ''}`}
                  >
                    <span className="loyverse-payment-icon">💳</span>
                    <span className="loyverse-payment-label">Card</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('other')}
                    className={`loyverse-payment-btn ${paymentMethod === 'other' ? 'active' : ''}`}
                  >
                    <span className="loyverse-payment-icon">🔄</span>
                    <span className="loyverse-payment-label">Other</span>
                  </button>
                </div>

                {/* Action Buttons */}
                <div className="loyverse-action-buttons">
                  <button 
                    onClick={clearCart} 
                    className="loyverse-clear-btn"
                    disabled={cart.length === 0}
                  >
                    Clear
                  </button>
                  <button
                    onClick={submitSale}
                    disabled={loading || cart.length === 0}
                    className="loyverse-charge-btn"
                  >
                    {loading ? 'Processing...' : `Charge KSh ${getCartTotal().toLocaleString()}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
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

      {/* Loyverse POS Styles */}
      <style>{`
        /* Loyverse POS Styles */
        .loyverse-pos {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        }

        /* Top Bar */
        .loyverse-topbar {
          background: #1e2a3a;
          color: #fff;
          padding: 0 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          height: 56px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          z-index: 50;
        }

        .loyverse-topbar-left {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .loyverse-logo {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .loyverse-logo-icon {
          font-size: 24px;
        }

        .loyverse-logo-text {
          font-size: 18px;
          font-weight: 700;
          letter-spacing: -0.5px;
        }

        .loyverse-user-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(255,255,255,0.1);
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 13px;
        }

        .loyverse-user-avatar {
          font-size: 16px;
        }

        .loyverse-user-name {
          font-weight: 500;
        }

        .loyverse-topbar-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .loyverse-status-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
        }

        .loyverse-status-badge.online {
          background: rgba(39, 174, 96, 0.2);
          color: #27ae60;
        }

        .loyverse-status-badge.offline {
          background: rgba(231, 76, 60, 0.2);
          color: #e74c3c;
        }

        .loyverse-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: currentColor;
        }

        .loyverse-sync-count {
          background: #f39c12;
          color: #fff;
          padding: 2px 6px;
          border-radius: 10px;
          font-size: 10px;
          margin-left: 4px;
        }

        .loyverse-sync-btn,
        .loyverse-history-btn,
        .loyverse-cart-toggle,
        .loyverse-logout-btn {
          background: rgba(255,255,255,0.1);
          color: #fff;
          border: none;
          padding: 8px 12px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
          position: relative;
        }

        .loyverse-sync-btn:hover,
        .loyverse-history-btn:hover,
        .loyverse-cart-toggle:hover,
        .loyverse-logout-btn:hover {
          background: rgba(255,255,255,0.2);
        }

        .loyverse-logout-btn {
          background: rgba(231, 76, 60, 0.3);
        }

        .loyverse-logout-btn:hover {
          background: rgba(231, 76, 60, 0.5);
        }

        .loyverse-cart-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          background: #e74c3c;
          color: #fff;
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 10px;
          min-width: 18px;
          text-align: center;
        }

        /* Message Bar */
        .loyverse-message {
          padding: 10px 16px;
          font-weight: 600;
          text-align: center;
          font-size: 14px;
          animation: slideDown 0.3s ease;
        }

        .loyverse-message.success {
          background: #d4edda;
          color: #155724;
        }

        .loyverse-message.warning {
          background: #fff3cd;
          color: #856404;
        }

        .loyverse-message.info {
          background: #d1ecf1;
          color: #0c5460;
        }

        .loyverse-message.error {
          background: #f8d7da;
          color: #721c24;
        }

        @keyframes slideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        /* Main POS Layout */
        .loyverse-pos-layout {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 0;
          overflow: hidden;
        }

        /* Products Panel */
        .loyverse-products-panel {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: #f5f6fa;
        }

        /* Category Tabs - Loyverse Style */
        .loyverse-category-tabs {
          display: flex;
          gap: 8px;
          padding: 12px 16px;
          overflow-x: auto;
          background: #fff;
          border-bottom: 1px solid #e8e8e8;
          -webkit-overflow-scrolling: touch;
        }

        .loyverse-category-tab {
          padding: 10px 20px;
          border: none;
          background: #f0f2f5;
          border-radius: 25px;
          font-size: 14px;
          font-weight: 600;
          color: #666;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .loyverse-category-tab:hover {
          background: #e8e8e8;
        }

        .loyverse-category-tab.active {
          background: #1e2a3a;
          color: #fff;
        }

        /* Search Bar */
        .loyverse-search-container {
          position: relative;
          padding: 12px 16px;
          background: #fff;
          border-bottom: 1px solid #e8e8e8;
        }

        .loyverse-search-icon {
          position: absolute;
          left: 28px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 16px;
          color: #999;
        }

        .loyverse-search-input {
          width: 100%;
          padding: 14px 14px 14px 44px;
          border: 2px solid #e8e8e8;
          border-radius: 12px;
          font-size: 16px;
          outline: none;
          transition: border-color 0.2s;
          background: #f8f9fa;
        }

        .loyverse-search-input:focus {
          border-color: #1e2a3a;
          background: #fff;
        }

        .loyverse-search-input::placeholder {
          color: #999;
        }

        /* Product List - List View */
        .loyverse-product-list {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0;
          padding: 0 16px;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }

        .loyverse-product-list-item {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 16px;
          background: #fff;
          border: none;
          border-bottom: 1px solid #f0f0f0;
          cursor: pointer;
          transition: all 0.15s ease;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }

        .loyverse-product-list-item:last-child {
          border-bottom: none;
        }

        .loyverse-product-list-item.pressed,
        .loyverse-product-list-item:active {
          background: #f0f2f5;
          border-color: transparent;
        }

        .loyverse-product-list-item.hovered {
          background: #f8f9fa;
        }

        .loyverse-list-item-emoji {
          font-size: 28px;
          flex-shrink: 0;
          width: 40px;
          text-align: center;
        }

        .loyverse-list-item-info {
          flex: 1;
          min-width: 0;
        }

        .loyverse-list-item-name {
          font-size: 14px;
          font-weight: 600;
          color: #333;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .loyverse-list-item-stock {
          font-size: 12px;
          color: #999;
          margin-top: 2px;
        }

        .loyverse-list-item-price {
          font-size: 16px;
          font-weight: 700;
          color: #1e2a3a;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .loyverse-empty-products {
          text-align: center;
          padding: 60px 20px;
          color: #999;
          font-size: 15px;
        }

        /* Cart Panel - Loyverse Style */
        .loyverse-cart-panel {
          background: #fff;
          display: flex;
          flex-direction: column;
          border-left: 1px solid #e8e8e8;
        }

        .loyverse-cart-header {
          padding: 16px 20px;
          border-bottom: 1px solid #e8e8e8;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #fafafa;
        }

        .loyverse-cart-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 18px;
          font-weight: 700;
          color: #1e2a3a;
        }

        .loyverse-cart-icon {
          font-size: 20px;
        }

        .loyverse-cart-meta {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .loyverse-cart-count {
          font-size: 14px;
          color: #666;
          background: #f0f2f5;
          padding: 4px 12px;
          border-radius: 15px;
        }

        .loyverse-close-cart {
          display: none;
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
          padding: 4px 8px;
          color: #666;
        }

        /* Cart Items */
        .loyverse-cart-items {
          flex: 1;
          overflow-y: auto;
          padding: 12px 16px;
          -webkit-overflow-scrolling: touch;
        }

        .loyverse-empty-cart {
          text-align: center;
          padding: 60px 20px;
        }

        .loyverse-empty-cart-icon {
          font-size: 64px;
          margin-bottom: 16px;
          opacity: 0.3;
        }

        .loyverse-empty-cart-text {
          font-size: 16px;
          font-weight: 600;
          color: #666;
          margin-bottom: 8px;
        }

        .loyverse-empty-cart-subtext {
          font-size: 14px;
          color: #999;
        }

        .loyverse-cart-item {
          padding: 14px 0;
          border-bottom: 1px solid #f0f2f5;
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          gap: 10px;
        }

        .loyverse-cart-item:last-child {
          border-bottom: none;
        }

        .loyverse-cart-item-info {
          flex: 1;
          min-width: 120px;
        }

        .loyverse-cart-item-name {
          font-size: 14px;
          font-weight: 600;
          color: #333;
          margin-bottom: 4px;
        }

        .loyverse-cart-item-price {
          font-size: 12px;
          color: #999;
        }

        .loyverse-cart-item-controls {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .loyverse-qty-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 2px solid #e8e8e8;
          background: #fff;
          cursor: pointer;
          font-size: 18px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
          touch-action: manipulation;
        }

        .loyverse-qty-btn.minus {
          color: #e74c3c;
        }

        .loyverse-qty-btn.plus {
          color: #27ae60;
        }

        .loyverse-qty-btn:hover {
          background: #f0f2f5;
        }

        .loyverse-qty-display {
          min-width: 50px;
          padding: 8px 12px;
          border: 2px solid #1e2a3a;
          border-radius: 10px;
          background: #f8f9fa;
          color: #1e2a3a;
          cursor: pointer;
          font-weight: 700;
          font-size: 16px;
          text-align: center;
          touch-action: manipulation;
          transition: all 0.15s;
        }

        .loyverse-qty-display:hover {
          background: #e8e8e8;
        }

        .loyverse-remove-btn {
          background: none;
          border: none;
          color: #ccc;
          cursor: pointer;
          font-size: 16px;
          padding: 8px;
          transition: color 0.15s;
          touch-action: manipulation;
        }

        .loyverse-remove-btn:hover {
          color: #e74c3c;
        }

        .loyverse-cart-item-total {
          width: 100%;
          text-align: right;
          font-size: 15px;
          font-weight: 700;
          color: #1e2a3a;
          padding-top: 4px;
        }

        /* Cart Footer - Payment Section */
        .loyverse-cart-footer {
          padding: 16px 20px;
          border-top: 2px solid #e8e8e8;
          background: #fafafa;
        }

        .loyverse-subtotal-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid #e8e8e8;
        }

        .loyverse-subtotal-row span:first-child {
          font-size: 14px;
          color: #666;
        }

        .loyverse-subtotal-amount {
          font-size: 24px;
          font-weight: 700;
          color: #1e2a3a;
        }

        /* Payment Methods - Loyverse Style */
        .loyverse-payment-methods {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-bottom: 16px;
        }

        .loyverse-payment-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 12px 8px;
          border: 2px solid #e8e8e8;
          border-radius: 12px;
          background: #fff;
          cursor: pointer;
          transition: all 0.2s;
          touch-action: manipulation;
        }

        .loyverse-payment-btn:hover {
          border-color: #1e2a3a;
        }

        .loyverse-payment-btn.active {
          border-color: #1e2a3a;
          background: #1e2a3a;
          color: #fff;
        }

        .loyverse-payment-icon {
          font-size: 20px;
        }

        .loyverse-payment-label {
          font-size: 12px;
          font-weight: 600;
        }

        /* Action Buttons */
        .loyverse-action-buttons {
          display: flex;
          gap: 10px;
        }

        .loyverse-clear-btn {
          flex: 1;
          padding: 14px;
          border: 2px solid #e8e8e8;
          border-radius: 12px;
          background: #fff;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          color: #666;
          transition: all 0.2s;
          touch-action: manipulation;
        }

        .loyverse-clear-btn:hover:not(:disabled) {
          border-color: #e74c3c;
          color: #e74c3c;
        }

        .loyverse-clear-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .loyverse-charge-btn {
          flex: 2;
          padding: 14px 20px;
          border: none;
          border-radius: 12px;
          background: #27ae60;
          color: #fff;
          cursor: pointer;
          font-size: 16px;
          font-weight: 700;
          transition: all 0.2s;
          touch-action: manipulation;
        }

        .loyverse-charge-btn:hover:not(:disabled) {
          background: #219a52;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(39, 174, 96, 0.3);
        }

        .loyverse-charge-btn:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        /* Mobile Styles */
        .mobile-cart-toggle { display: none; }
        .loyverse-close-cart { display: none !important; }

        @media (max-width: 768px) {
          .loyverse-topbar-left {
            gap: 12px;
          }

          .loyverse-user-badge {
            display: none;
          }

          .loyverse-logo-text {
            font-size: 16px;
          }

          .loyverse-status-badge {
            display: none;
          }

          .loyverse-category-tabs {
            padding: 10px 12px;
          }

          .loyverse-category-tab {
            padding: 8px 16px;
            font-size: 13px;
          }

          .loyverse-search-container {
            padding: 10px 12px;
          }

          .loyverse-product-list {
            padding: 0 12px;
          }

          .loyverse-product-list-item {
            padding: 12px 10px;
            gap: 10px;
          }

          .loyverse-list-item-emoji {
            font-size: 22px;
            width: 32px;
          }

          .loyverse-list-item-name {
            font-size: 13px;
          }

          .loyverse-list-item-price {
            font-size: 14px;
          }

          .loyverse-pos-layout {
            grid-template-columns: 1fr;
          }

          .mobile-cart-toggle {
            display: flex;
          }

          .loyverse-cart-panel {
            display: none;
            position: fixed;
            inset: 0;
            top: 56px;
            z-index: 300;
            border-radius: 0;
            border-left: none;
          }

          .loyverse-cart-panel.mobile-visible {
            display: flex;
          }

          .loyverse-close-cart {
            display: block !important;
          }

          .loyverse-payment-methods {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 480px) {
          .loyverse-topbar {
            padding: 0 12px;
          }

          .loyverse-logo-icon {
            font-size: 20px;
          }

          .loyverse-logo-text {
            font-size: 15px;
          }

          .loyverse-product-list {
            padding: 0 10px;
          }

          .loyverse-product-list-item {
            padding: 10px 8px;
            gap: 8px;
          }

          .loyverse-list-item-emoji {
            font-size: 20px;
            width: 28px;
          }

          .loyverse-list-item-name {
            font-size: 12px;
          }

          .loyverse-list-item-price {
            font-size: 13px;
          }

          .loyverse-cart-footer {
            padding: 12px 16px;
          }

          .loyverse-subtotal-amount {
            font-size: 20px;
          }
        }
      `}</style>
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
    const [whole, dec] = value.split('.');
    if (dec !== undefined && dec.length >= 2) return;
    if (whole && whole.length >= 3 && dec === undefined) return;
    onChange(value === '0' ? k : value + k);
  };

  const keyStyle = {
    padding: '18px 0',
    fontSize: '26px',
    fontWeight: 700,
    border: 'none',
    borderRadius: '14px',
    background: '#fff',
    color: '#1e2a3a',
    cursor: 'pointer',
    touchAction: 'manipulation',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    transition: 'all 0.1s',
  };

  const totalPreview = (parseFloat(value || '0') || 0) * (item ? item.unit_price : 0);

  return (
    <div
      className="loyverse-numpad-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(30, 42, 58, 0.6)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'none',
        padding: '16px',
      }}
      onClick={onCancel}
    >
      <div
        className="loyverse-numpad"
        style={{
          background: '#f5f6fa',
          borderRadius: '20px',
          padding: '20px',
          width: '320px',
          maxWidth: '100%',
          boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
          touchAction: 'manipulation',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#1e2a3a' }}>
            {item ? item.name : ''}
          </div>
          <div style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>
            Enter quantity
          </div>
        </div>

        <div style={{
          background: '#fff',
          borderRadius: '14px',
          padding: '16px',
          textAlign: 'center',
          fontSize: '32px',
          fontWeight: 800,
          color: '#1e2a3a',
          marginBottom: '16px',
          border: '2px solid #1e2a3a',
          minHeight: '32px',
        }}>
          {value || '0'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
          {keys.map(k => (
            <button key={k} onClick={() => press(k)} style={keyStyle}>
              {k}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '16px 0',
              border: 'none',
              borderRadius: '14px',
              background: '#e74c3c',
              color: '#fff',
              fontSize: '16px',
              fontWeight: 700,
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 2,
              padding: '16px 0',
              border: 'none',
              borderRadius: '14px',
              background: '#27ae60',
              color: '#fff',
              fontSize: '16px',
              fontWeight: 700,
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            OK · KSh {totalPreview.toLocaleString()}
          </button>
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
    <div style={{ flex: 1, padding: '20px', overflow: 'auto', background: '#f5f6fa' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ fontSize: '22px', color: '#1e2a3a', fontWeight: 700 }}>Sales History</h2>
        <button 
          onClick={onBack} 
          style={{ 
            padding: '12px 20px', 
            border: '2px solid #e8e8e8', 
            borderRadius: '12px', 
            background: '#fff', 
            cursor: 'pointer', 
            fontSize: '14px', 
            fontWeight: 600,
            transition: 'all 0.2s'
          }}
        >
          ← Back to POS
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto' }}>
        <button 
          onClick={() => setTab('online')} 
          style={{ 
            padding: '12px 24px', 
            border: 'none', 
            borderBottom: tab === 'online' ? '3px solid #1e2a3a' : '3px solid transparent', 
            background: 'none', 
            cursor: 'pointer', 
            fontWeight: 600, 
            color: tab === 'online' ? '#1e2a3a' : '#999', 
            fontSize: '14px', 
            whiteSpace: 'nowrap' 
          }}
        >
          Online ({sales.length})
        </button>
        <button 
          onClick={() => setTab('offline')} 
          style={{ 
            padding: '12px 24px', 
            border: 'none', 
            borderBottom: tab === 'offline' ? '3px solid #f39c12' : '3px solid transparent', 
            background: 'none', 
            cursor: 'pointer', 
            fontWeight: 600, 
            color: tab === 'offline' ? '#f39c12' : '#999', 
            fontSize: '14px', 
            whiteSpace: 'nowrap' 
          }}
        >
          Offline ({offlineSales.length})
        </button>
      </div>

      {tab === 'online' && (
        <div style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '14px 20px', textAlign: 'left', background: '#fafafa', fontSize: '13px', fontWeight: 600, color: '#666' }}>Sale ID</th>
                  <th style={{ padding: '14px 20px', textAlign: 'left', background: '#fafafa', fontSize: '13px', fontWeight: 600, color: '#666' }}>Date</th>
                  <th style={{ padding: '14px 20px', textAlign: 'left', background: '#fafafa', fontSize: '13px', fontWeight: 600, color: '#666' }}>Payment</th>
                  <th style={{ padding: '14px 20px', textAlign: 'right', background: '#fafafa', fontSize: '13px', fontWeight: 600, color: '#666' }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {sales.map(sale => (
                  <tr key={sale.id}>
                    <td style={{ padding: '14px 20px', fontFamily: 'monospace', fontSize: '13px' }}>{sale.sale_id}</td>
                    <td style={{ padding: '14px 20px', fontSize: '13px' }}>{new Date(sale.date).toLocaleString()}</td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ background: '#d1ecf1', color: '#0c5460', padding: '4px 10px', borderRadius: '15px', fontSize: '12px', fontWeight: 600 }}>
                        {sale.payment_method}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 600 }}>KSh {parseFloat(sale.total_revenue).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'offline' && (
        <div style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          {offlineSales.length === 0 && (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#999' }}>
              No offline sales
            </div>
          )}
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '550px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '14px 20px', textAlign: 'left', background: '#fafafa', fontSize: '13px', fontWeight: 600, color: '#666' }}>ID</th>
                  <th style={{ padding: '14px 20px', textAlign: 'left', background: '#fafafa', fontSize: '13px', fontWeight: 600, color: '#666' }}>Time</th>
                  <th style={{ padding: '14px 20px', textAlign: 'left', background: '#fafafa', fontSize: '13px', fontWeight: 600, color: '#666' }}>Payment</th>
                  <th style={{ padding: '14px 20px', textAlign: 'right', background: '#fafafa', fontSize: '13px', fontWeight: 600, color: '#666' }}>Total</th>
                  <th style={{ padding: '14px 20px', textAlign: 'center', background: '#fafafa', fontSize: '13px', fontWeight: 600, color: '#666' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {offlineSales.map(sale => (
                  <tr key={sale.id}>
                    <td style={{ padding: '14px 20px', fontFamily: 'monospace', fontSize: '12px' }}>{sale.offlineId}</td>
                    <td style={{ padding: '14px 20px', fontSize: '13px' }}>{new Date(sale.timestamp).toLocaleString()}</td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ background: '#d1ecf1', color: '#0c5460', padding: '4px 10px', borderRadius: '15px', fontSize: '12px', fontWeight: 600 }}>
                        {sale.payment_method}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 600 }}>
                      KSh {sale.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                      <span style={{ 
                        background: sale.synced ? '#d4edda' : '#fff3cd', 
                        color: sale.synced ? '#155724' : '#856404', 
                        padding: '4px 10px', 
                        borderRadius: '15px', 
                        fontSize: '12px', 
                        fontWeight: 600 
                      }}>
                        {sale.synced ? 'Synced' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
