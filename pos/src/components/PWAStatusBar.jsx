import { useEffect, useState, useCallback } from 'react'
import { Box, Chip, Badge, IconButton, Snackbar, Button, Tooltip, Stack, Typography } from '@mui/material'
import {
    WifiOff as OfflineIcon,
    Wifi as OnlineIcon,
    Sync as SyncIcon,
    CloudDone as SyncedIcon,
    CloudOff as QueuedIcon,
    SystemUpdateAlt as UpdateIcon
} from '@mui/icons-material'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { getPendingCount, getAllOperations } from '../services/offlineQueue'
import { syncPendingOperations, startAutoSync, onSyncStatusChange } from '../services/syncManager'

export default function PWAStatusBar() {
    const [isOnline, setIsOnline] = useState(navigator.onLine)
    const [pendingCount, setPendingCount] = useState(0)
    const [syncStatus, setSyncStatus] = useState('idle') // idle | syncing | done | error
    const [showUpdateSnackbar, setShowUpdateSnackbar] = useState(false)
    const [deferredPrompt, setDeferredPrompt] = useState(null)
    const [showInstallBtn, setShowInstallBtn] = useState(false)

    // ——— PWA Install Prompt ———
    useEffect(() => {
        const handleBeforeInstallPrompt = (e) => {
            // Prevent Chrome 67 and earlier from automatically showing the prompt
            e.preventDefault()
            // Stash the event so it can be triggered later.
            setDeferredPrompt(e)
            // Show the custom install button
            setShowInstallBtn(true)
        }

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
        }
    }, [])

    const handleInstallClick = async () => {
        if (!deferredPrompt) return
        // Show the install prompt
        deferredPrompt.prompt()
        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice
        console.log(`User response to the install prompt: ${outcome}`)
        // We've used the prompt, and can't use it again, throw it away
        setDeferredPrompt(null)
        setShowInstallBtn(false)
    }

    // ——— PWA Update Registration ———
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker
    } = useRegisterSW({
        onRegistered(r) {
            console.log('[PWA] Service Worker registered')
            // Check for updates every 60 minutes
            if (r) {
                setInterval(() => { r.update() }, 60 * 60 * 1000)
            }
        },
        onRegisterError(error) {
            console.error('[PWA] SW registration error:', error)
        }
    })

    // Show update prompt when new version is available
    useEffect(() => {
        if (needRefresh) {
            setShowUpdateSnackbar(true)
        }
    }, [needRefresh])

    // ——— Network Status ———
    useEffect(() => {
        const goOnline = () => setIsOnline(true)
        const goOffline = () => setIsOnline(false)

        window.addEventListener('online', goOnline)
        window.addEventListener('offline', goOffline)

        return () => {
            window.removeEventListener('online', goOnline)
            window.removeEventListener('offline', goOffline)
        }
    }, [])

    // ——— Auto Sync ———
    useEffect(() => {
        const stopAutoSync = startAutoSync(30000)
        const unsubscribe = onSyncStatusChange((status) => {
            setSyncStatus(status)
            if (status === 'done' || status === 'error') {
                refreshPendingCount()
            }
        })

        return () => {
            stopAutoSync()
            unsubscribe()
        }
    }, [])

    // ——— Pending Count ———
    const refreshPendingCount = useCallback(async () => {
        try {
            const count = await getPendingCount()
            setPendingCount(count)
        } catch {
            setPendingCount(0)
        }
    }, [])

    useEffect(() => {
        refreshPendingCount()
        const timer = setInterval(refreshPendingCount, 10000)
        return () => clearInterval(timer)
    }, [refreshPendingCount])

    // ——— Manual Sync Handler ———
    const handleManualSync = async () => {
        if (!isOnline) return
        setSyncStatus('syncing')
        await syncPendingOperations()
        await refreshPendingCount()
    }

    // ——— Render ———
    return (
        <>
            {/* Offline Banner */}
            {!isOnline && (
                <Box
                    sx={{
                        position: 'fixed',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        zIndex: 9999,
                        background: 'linear-gradient(135deg, #d32f2f 0%, #c62828 100%)',
                        color: '#fff',
                        py: 0.75,
                        px: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 1,
                        boxShadow: '0 -2px 12px rgba(0,0,0,0.3)'
                    }}
                >
                    <OfflineIcon fontSize="small" />
                    <Typography variant="body2" fontWeight={600}>
                        أنت غير متصل بالإنترنت — العمليات ستُحفظ وتُزامن عند عودة الاتصال
                    </Typography>
                    {pendingCount > 0 && (
                        <Chip
                            label={`${pendingCount} عملية معلقة`}
                            size="small"
                            sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 600 }}
                        />
                    )}
                </Box>
            )}

            {/* Status Chips (in app header area) */}
            <Stack
                direction="row"
                spacing={0.5}
                alignItems="center"
                sx={{
                    position: 'fixed',
                    bottom: isOnline ? 12 : 44,
                    left: 12,
                    zIndex: 9998
                }}
            >
                {/* Network chip */}
                <Tooltip title={isOnline ? 'متصل بالشبكة' : 'غير متصل'}>
                    <Chip
                        icon={isOnline ? <OnlineIcon /> : <OfflineIcon />}
                        label={isOnline ? 'متصل' : 'غير متصل'}
                        size="small"
                        color={isOnline ? 'success' : 'error'}
                        variant="filled"
                        sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                    />
                </Tooltip>

                {/* Pending Queue */}
                {pendingCount > 0 && (
                    <Tooltip title={`${pendingCount} عملية في انتظار المزامنة`}>
                        <Badge badgeContent={pendingCount} color="warning" max={99}>
                            <Chip
                                icon={<QueuedIcon />}
                                label="معلقة"
                                size="small"
                                color="warning"
                                variant="outlined"
                                onClick={handleManualSync}
                                disabled={!isOnline || syncStatus === 'syncing'}
                                sx={{ fontWeight: 600, fontSize: '0.7rem', cursor: 'pointer' }}
                            />
                        </Badge>
                    </Tooltip>
                )}

                {/* Sync button */}
                {syncStatus === 'syncing' && (
                    <Chip
                        icon={<SyncIcon sx={{ animation: 'spin 1s linear infinite', '@keyframes spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } } }} />}
                        label="جاري المزامنة"
                        size="small"
                        color="info"
                        sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                    />
                )}

                {/* Install App Button */}
                {showInstallBtn && (
                    <Tooltip title="تثبيت التطبيق على جهازك للعمل بدون إنترنت براحة أكبر">
                        <Chip
                            icon={<UpdateIcon />}
                            label="تثبيت التطبيق"
                            size="small"
                            color="success"
                            onClick={handleInstallClick}
                            sx={{ fontWeight: 'bold', fontSize: '0.75rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
                        />
                    </Tooltip>
                )}
            </Stack>

            {/* SW Update Snackbar */}
            <Snackbar
                open={showUpdateSnackbar}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
                message="🆕 يوجد تحديث جديد للتطبيق"
                action={
                    <Stack direction="row" spacing={1}>
                        <Button
                            color="primary"
                            variant="contained"
                            size="small"
                            startIcon={<UpdateIcon />}
                            onClick={() => {
                                updateServiceWorker(true)
                                setShowUpdateSnackbar(false)
                            }}
                        >
                            تحديث الآن
                        </Button>
                        <Button
                            color="inherit"
                            size="small"
                            onClick={() => {
                                setShowUpdateSnackbar(false)
                                setNeedRefresh(false)
                            }}
                        >
                            لاحقاً
                        </Button>
                    </Stack>
                }
                sx={{
                    '& .MuiSnackbarContent-root': {
                        bgcolor: '#1565C0',
                        color: '#fff',
                        fontWeight: 600,
                        borderRadius: 2
                    }
                }}
            />
        </>
    )
}
