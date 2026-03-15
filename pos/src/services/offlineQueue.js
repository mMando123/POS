/**
 * Offline Queue Manager — PWA Enhanced
 *
 * Stores failed API operations in IndexedDB and replays them
 * when the network returns. Uses idempotency keys to prevent duplicates.
 *
 * Backward-compatible: still exports `offlineQueue` with same interface.
 */

const DB_NAME = 'pos_offline_queue'
const DB_VERSION = 1
const STORE_NAME = 'pending_operations'

// ——— Legacy localStorage bridge (read-only, migrates once) ———
const LEGACY_KEY = 'pos_offline_order_queue_v1'

function migrateLegacy() {
    try {
        const raw = localStorage.getItem(LEGACY_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed) || parsed.length === 0) return []
        localStorage.removeItem(LEGACY_KEY)
        return parsed
    } catch {
        return []
    }
}

// ——— IndexedDB Helpers ———

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION)

        request.onupgradeneeded = (event) => {
            const db = event.target.result
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
                store.createIndex('status', 'status', { unique: false })
                store.createIndex('createdAt', 'createdAt', { unique: false })
            }
        }

        request.onsuccess = async () => {
            const db = request.result
            // One-time migration from localStorage
            const legacy = migrateLegacy()
            if (legacy.length > 0) {
                const tx = db.transaction(STORE_NAME, 'readwrite')
                const store = tx.objectStore(STORE_NAME)
                for (const item of legacy) {
                    store.put({
                        id: item.id || `migrated-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                        endpoint: '/orders',
                        method: 'POST',
                        payload: item.payload || item,
                        description: 'طلب مهاجر من النسخة القديمة',
                        status: 'pending',
                        retryCount: 0,
                        maxRetries: 5,
                        createdAt: item.createdAt || new Date().toISOString(),
                        lastAttempt: null,
                        errorMessage: null
                    })
                }
            }
            resolve(db)
        }
        request.onerror = () => reject(request.error)
    })
}

function withStore(mode, callback) {
    return openDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, mode)
            const store = tx.objectStore(STORE_NAME)
            callback(store, resolve, reject)
            tx.onerror = () => reject(tx.error)
        })
    })
}

// ——— Core Operations ———

export async function enqueueOperation({ endpoint, method = 'POST', payload, idempotencyKey, description }) {
    const id = idempotencyKey || `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const operation = {
        id,
        endpoint,
        method,
        payload,
        description: description || endpoint,
        status: 'pending',
        retryCount: 0,
        maxRetries: 5,
        createdAt: new Date().toISOString(),
        lastAttempt: null,
        errorMessage: null
    }

    await withStore('readwrite', (store) => { store.put(operation) })
    console.log(`[OfflineQueue] Enqueued: ${description || endpoint}`)
    return operation
}

export async function getPendingOperations() {
    return withStore('readonly', (store, resolve) => {
        const idx = store.index('status')
        const req = idx.getAll('pending')
        req.onsuccess = () => resolve(req.result || [])
    })
}

export async function getAllOperations() {
    return withStore('readonly', (store, resolve) => {
        const req = store.getAll()
        req.onsuccess = () => resolve(req.result || [])
    })
}

export async function markSynced(id) {
    return withStore('readwrite', (store, resolve) => {
        const r = store.get(id)
        r.onsuccess = () => {
            if (r.result) store.put({ ...r.result, status: 'synced', lastAttempt: new Date().toISOString() })
            resolve()
        }
    })
}

export async function markFailed(id, errorMessage) {
    return withStore('readwrite', (store, resolve) => {
        const r = store.get(id)
        r.onsuccess = () => {
            if (r.result) {
                const op = r.result
                const cnt = op.retryCount + 1
                store.put({
                    ...op,
                    status: cnt >= op.maxRetries ? 'failed' : 'pending',
                    retryCount: cnt,
                    lastAttempt: new Date().toISOString(),
                    errorMessage
                })
            }
            resolve()
        }
    })
}

export async function retryOperation(id) {
    return withStore('readwrite', (store, resolve) => {
        const r = store.get(id)
        r.onsuccess = () => {
            if (r.result) store.put({ ...r.result, status: 'pending', retryCount: 0, errorMessage: null })
            resolve()
        }
    })
}

export async function deleteOperation(id) {
    return withStore('readwrite', (store, resolve) => {
        store.delete(id)
        resolve()
    })
}

export async function cleanupSynced(maxAgeHours = 24) {
    const cutoff = new Date(Date.now() - maxAgeHours * 3600000).toISOString()
    return withStore('readwrite', (store, resolve) => {
        const req = store.openCursor()
        let deleted = 0
        req.onsuccess = (e) => {
            const cursor = e.target.result
            if (cursor) {
                if (cursor.value.status === 'synced' && cursor.value.lastAttempt < cutoff) {
                    cursor.delete()
                    deleted++
                }
                cursor.continue()
            } else {
                resolve(deleted)
            }
        }
    })
}

export async function getPendingCount() {
    const ops = await getPendingOperations()
    return ops.length
}

// ——— Backward-compatible "offlineQueue" interface ———

export const offlineQueue = {
    async list() { return getAllOperations() },
    async count() { return getPendingCount() },
    async enqueue(orderPayload) {
        return enqueueOperation({
            endpoint: '/orders',
            method: 'POST',
            payload: orderPayload,
            description: 'طلب POS (Offline)'
        })
    },
    async remove(id) { return deleteOperation(id) },
    async clear() {
        const all = await getAllOperations()
        for (const op of all) await deleteOperation(op.id)
    }
}

export default offlineQueue
