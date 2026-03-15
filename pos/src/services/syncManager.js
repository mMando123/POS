/**
 * Sync Manager — handles replaying queued operations when back online
 */
import axios from 'axios'
import { getPendingOperations, markSynced, markFailed, cleanupSynced } from './offlineQueue'

const API_URL = import.meta.env.VITE_API_URL || '/api'

let isSyncing = false
let syncListeners = []

export function onSyncStatusChange(listener) {
    syncListeners.push(listener)
    return () => { syncListeners = syncListeners.filter(l => l !== listener) }
}

function notifyListeners(status) {
    syncListeners.forEach(l => l(status))
}

/**
 * Attempt to sync all pending offline operations
 */
export async function syncPendingOperations() {
    if (isSyncing) return { synced: 0, failed: 0 }
    isSyncing = true
    notifyListeners('syncing')

    let synced = 0
    let failed = 0

    try {
        const pending = await getPendingOperations()
        if (pending.length === 0) {
            isSyncing = false
            notifyListeners('idle')
            return { synced: 0, failed: 0 }
        }

        console.log(`[SyncManager] Syncing ${pending.length} pending operations...`)

        // Sort by creation time (oldest first = FIFO)
        pending.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

        const token = localStorage.getItem('token')
        const headers = { 'Content-Type': 'application/json' }
        if (token) headers.Authorization = `Bearer ${token}`

        for (const op of pending) {
            try {
                const url = op.endpoint.startsWith('http')
                    ? op.endpoint
                    : `${API_URL}${op.endpoint.startsWith('/') ? op.endpoint : `/${op.endpoint}`}`

                const config = {
                    method: op.method || 'POST',
                    url,
                    data: op.payload,
                    headers: {
                        ...headers,
                        'X-Idempotency-Key': op.id  // prevent duplicates
                    },
                    timeout: 15000
                }

                await axios(config)
                await markSynced(op.id)
                synced++
                console.log(`[SyncManager] ✅ Synced: ${op.description}`)
            } catch (error) {
                const status = error?.response?.status
                const errMsg = error?.response?.data?.message || error.message

                // 4xx errors (except 408/429) are permanent — stop retrying
                if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
                    await markFailed(op.id, `${status}: ${errMsg}`)
                    failed++
                    console.warn(`[SyncManager] ❌ Permanent fail: ${op.description} → ${errMsg}`)
                } else {
                    // Network/5xx errors — will retry later
                    await markFailed(op.id, errMsg)
                    failed++
                    console.warn(`[SyncManager] ⚠️ Retry later: ${op.description} → ${errMsg}`)
                }
            }
        }

        // Cleanup old synced entries
        await cleanupSynced(24)

    } catch (error) {
        console.error('[SyncManager] Sync error:', error)
    } finally {
        isSyncing = false
        notifyListeners(synced > 0 ? 'done' : (failed > 0 ? 'error' : 'idle'))
    }

    return { synced, failed }
}

/**
 * Start automatic sync: listen for online events + periodic check
 */
export function startAutoSync(intervalMs = 30000) {
    // Sync when coming back online
    window.addEventListener('online', () => {
        console.log('[SyncManager] Network restored — starting sync...')
        setTimeout(() => syncPendingOperations(), 2000) // small delay
    })

    // Periodic sync every N seconds (only when online)
    const timer = setInterval(() => {
        if (navigator.onLine) {
            syncPendingOperations()
        }
    }, intervalMs)

    // Initial sync if we're online
    if (navigator.onLine) {
        setTimeout(() => syncPendingOperations(), 5000)
    }

    return () => clearInterval(timer)
}

export default {
    syncPendingOperations,
    startAutoSync,
    onSyncStatusChange
}
