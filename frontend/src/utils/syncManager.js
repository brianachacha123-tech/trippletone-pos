import api from './api';
import { getUnsyncedSales, markSaleSynced, deleteOfflineSale, cacheProducts, cacheCategories } from './offlineStorage';

let syncInProgress = false;

// Sync all offline sales to the server
export async function syncOfflineSales() {
  if (syncInProgress) return { synced: 0, failed: 0 };
  if (!navigator.onLine) return { synced: 0, failed: 0 };

  syncInProgress = true;
  let synced = 0;
  let failed = 0;

  try {
    const unsyncedSales = await getUnsyncedSales();
    
    for (const sale of unsyncedSales) {
      try {
        await api.post('/sales', {
          items: sale.items,
          payment_method: sale.payment_method,
          client_ref: sale.offlineId  // idempotency key: retries of a succeeded post return the original sale
        });
        await markSaleSynced(sale.offlineId);
        synced++;
      } catch (err) {
        console.error('Failed to sync sale:', sale.offlineId, err);
        failed++;
      }
    }
  } catch (err) {
    console.error('Sync error:', err);
  }

  syncInProgress = false;
  return { synced, failed };
}

// Refresh local cache of products and categories
export async function refreshCache() {
  if (!navigator.onLine) return false;
  
  try {
    const [productsRes, categoriesRes] = await Promise.all([
      api.get('/products'),
      api.get('/products/meta/categories')
    ]);
    
    await cacheProducts(productsRes.data);
    await cacheCategories(categoriesRes.data);
    return true;
  } catch (err) {
    console.error('Cache refresh error:', err);
    return false;
  }
}

// Start auto-sync interval (every 30 seconds when online)
let syncInterval = null;

export function startAutoSync(onSyncComplete) {
  if (syncInterval) clearInterval(syncInterval);
  
  syncInterval = setInterval(async () => {
    if (navigator.onLine) {
      const result = await syncOfflineSales();
      if (result.synced > 0) {
        await refreshCache();
        if (onSyncComplete) onSyncComplete(result);
      }
    }
  }, 30000); // Every 30 seconds
}

export function stopAutoSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
