// IndexedDB offline storage for sales and products
const DB_NAME = 'trippletone_pos_offline';
const DB_VERSION = 2;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      // Offline sales queue
      if (!db.objectStoreNames.contains('offlineSales')) {
        const store = db.createObjectStore('offlineSales', { keyPath: 'id', autoIncrement: true });
        store.createIndex('synced', 'synced', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('offlineId', 'offlineId', { unique: true });
      } else {
        // Upgrade path: ensure the offlineId index exists (markSaleSynced depends on it)
        const store = request.transaction.objectStore('offlineSales');
        if (!store.indexNames.contains('offlineId')) {
          store.createIndex('offlineId', 'offlineId', { unique: true });
        }
      }
      // Cached products for offline POS
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' });
      }
      // Cached categories
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }
      // Pending sync operations
      if (!db.objectStoreNames.contains('syncQueue')) {
        const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
        syncStore.createIndex('type', 'type', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Save a sale offline
export async function saveOfflineSale(saleData) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineSales', 'readwrite');
    const store = tx.objectStore('offlineSales');
    const sale = {
      ...saleData,
      timestamp: new Date().toISOString(),
      synced: false,
      offlineId: `OFF-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
    };
    const request = store.add(sale);
    request.onsuccess = () => resolve(sale);
    request.onerror = () => reject(request.error);
  });
}

// Get all unsynced offline sales
export async function getUnsyncedSales() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineSales', 'readonly');
    const store = tx.objectStore('offlineSales');
    const index = store.index('synced');
    const request = index.getAll(false);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Mark a sale as synced
export async function markSaleSynced(offlineId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineSales', 'readwrite');
    const store = tx.objectStore('offlineSales');
    const index = store.index('offlineId');
    const request = index.get(offlineId);
    request.onsuccess = () => {
      const sale = request.result;
      if (sale) {
        sale.synced = true;
        const updateReq = store.put(sale);
        updateReq.onsuccess = () => resolve(true);
        updateReq.onerror = () => reject(updateReq.error);
      } else {
        resolve(false);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// Get all offline sales (synced and unsynced)
export async function getAllOfflineSales() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineSales', 'readonly');
    const store = tx.objectStore('offlineSales');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Get count of pending sync items
export async function getPendingSyncCount() {
  const sales = await getUnsyncedSales();
  return sales.length;
}

// Cache products for offline use
export async function cacheProducts(products) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('products', 'readwrite');
    const store = tx.objectStore('products');
    products.forEach(p => store.put(p));
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// Get cached products
export async function getCachedProducts() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('products', 'readonly');
    const store = tx.objectStore('products');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Cache categories
export async function cacheCategories(categories) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('categories', 'readwrite');
    const store = tx.objectStore('categories');
    categories.forEach(c => store.put(c));
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// Get cached categories
export async function getCachedCategories() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('categories', 'readonly');
    const store = tx.objectStore('categories');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Check if online
export function isOnline() {
  return navigator.onLine;
}

// Delete an offline sale after successful sync
export async function deleteOfflineSale(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineSales', 'readwrite');
    const store = tx.objectStore('offlineSales');
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}
