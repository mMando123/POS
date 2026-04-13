import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    IconButton,
    Badge,
    Popover,
    Box,
    Typography,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    ListItemIcon,
    Divider,
    Button,
    Chip,
} from '@mui/material'
import {
    Notifications as NotificationsIcon,
    CheckCircle as CheckIcon,
    Restaurant as OrderIcon,
    LocalShipping as DeliveryIcon,
    Warning as WarningIcon,
    Info as InfoIcon,
} from '@mui/icons-material'
import toast from 'react-hot-toast'
import socketService from '../services/socket'
import { notificationsAPI } from '../services/api'

// Notification sound
const NOTIFICATION_SOUND = '/notification.mp3'

export default function NotificationCenter() {
    const navigate = useNavigate()
    const [anchorEl, setAnchorEl] = useState(null)
    const [notifications, setNotifications] = useState([])
    const [unreadCount, setUnreadCount] = useState(0)
    const audioRef = useRef(null)

    // Fetch notifications on mount
    useEffect(() => {
        fetchNotifications()
        const pollId = setInterval(fetchNotifications, 30000)

        // Listen for real-time notifications
        const socket = socketService.getSocket()
        if (socket) {
            socket.on('notification:new', handleNewNotification)
            // Also listen for order-specific events for backward compatibility
            socket.on('order:pending', (order) => {
                handleNewNotification({
                    id: `pending-${order.id}`,
                    type: 'order_pending',
                    title: 'طلب أونلاين جديد',
                    message: `طلب #${order.order_number}`,
                    icon: '🌍',
                    action_url: '/pending-orders',
                    entity_id: order.id,
                    play_sound: true,
                    created_at: new Date().toISOString(),
                })
            })
            socket.on('order:ready_for_pickup', (data) => {
                handleNewNotification({
                    id: `ready-${data.orderId}`,
                    type: 'order_ready',
                    title: 'الطلب جاهز!',
                    message: `طلب #${data.orderNumber} جاهز للتسليم`,
                    icon: '🔔',
                    action_url: '/cashier-queue',
                    entity_id: data.orderId,
                    play_sound: true,
                    created_at: new Date().toISOString(),
                })
            })
        }

        return () => {
            clearInterval(pollId)
            if (socket) {
                socket.off('notification:new')
                socket.off('order:pending')
                socket.off('order:ready_for_pickup')
            }
        }
    }, [])

    const fetchNotifications = async () => {
        try {
            const res = await notificationsAPI.getAll()
            setNotifications(res.data.data || [])
            setUnreadCount(res.data.unread_count || 0)
        } catch (error) {
            console.error('Failed to fetch notifications:', error)
        }
    }

    const handleNewNotification = (notification) => {
        // Add to list
        setNotifications(prev => [notification, ...prev.slice(0, 49)])
        setUnreadCount(prev => prev + 1)

        // Show toast
        toast(notification.title, {
            icon: notification.icon || '🔔',
            duration: 5000,
            style: {
                background: '#333',
                color: '#fff',
            },
        })

        // Play sound
        if (notification.play_sound) {
            playSound()
        }
    }

    const playSound = () => {
        try {
            if (audioRef.current) {
                audioRef.current.currentTime = 0
                audioRef.current.play().catch(() => { })
            }
        } catch (e) {
            console.log('Cannot play sound:', e)
        }
    }

    const handleClick = (event) => {
        setAnchorEl(event.currentTarget)
        fetchNotifications()
    }

    const handleClose = () => {
        setAnchorEl(null)
    }

    const handleNotificationClick = async (notification) => {
        // Mark as read
        if (notification.id && !notification.is_read) {
            try {
                await notificationsAPI.markRead(notification.id)
                setNotifications(prev =>
                    prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
                )
                setUnreadCount(prev => Math.max(0, prev - 1))
            } catch (error) {
                console.error('Failed to mark notification as read:', error)
            }
        }

        // Navigate to action URL
        if (notification.action_url) {
            navigate(notification.action_url)
            handleClose()
        }
    }

    const handleMarkAllRead = async () => {
        try {
            await notificationsAPI.markAllRead()
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
            setUnreadCount(0)
        } catch (error) {
            console.error('Failed to mark all as read:', error)
        }
    }

    const getIcon = (notification) => {
        switch (notification.type) {
            case 'order_pending':
            case 'order_new':
                return <DeliveryIcon color="primary" />
            case 'order_ready':
                return <CheckIcon color="success" />
            case 'order_cancelled':
                return <WarningIcon color="error" />
            case 'low_stock':
                return <WarningIcon color="error" />
            case 'system':
                if (String(notification.title || '').includes('الصلاحية')) {
                    return <WarningIcon color="warning" />
                }
                return <InfoIcon color="info" />
            default:
                return <InfoIcon color="info" />
        }
    }

    const formatTime = (dateStr) => {
        const date = new Date(dateStr)
        const now = new Date()
        const diffMs = now - date
        const diffMins = Math.floor(diffMs / 60000)
        const diffHours = Math.floor(diffMs / 3600000)

        if (diffMins < 1) return 'الآن'
        if (diffMins < 60) return `منذ ${diffMins} دقيقة`
        if (diffHours < 24) return `منذ ${diffHours} ساعة`
        return date.toLocaleDateString('ar')
    }

    const open = Boolean(anchorEl)

    return (
        <>
            <audio ref={audioRef} src={NOTIFICATION_SOUND} preload="auto" />

            <IconButton color="inherit" onClick={handleClick}>
                <Badge badgeContent={unreadCount} color="error">
                    <NotificationsIcon />
                </Badge>
            </IconButton>

            <Popover
                open={open}
                anchorEl={anchorEl}
                onClose={handleClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                PaperProps={{
                    sx: { width: 360, maxHeight: 480 }
                }}
            >
                <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6" fontWeight="bold">الإشعارات</Typography>
                    {unreadCount > 0 && (
                        <Button size="small" onClick={handleMarkAllRead}>
                            تحديد الكل كمقروء
                        </Button>
                    )}
                </Box>
                <Divider />

                {notifications.length === 0 ? (
                    <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
                        <NotificationsIcon sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} />
                        <Typography>لا توجد إشعارات</Typography>
                    </Box>
                ) : (
                    <List sx={{ p: 0, maxHeight: 360, overflow: 'auto' }}>
                        {notifications.map((notification, index) => (
                            <ListItem
                                key={notification.id || index}
                                disablePadding
                                sx={{
                                    bgcolor: notification.is_read ? 'transparent' : 'action.hover',
                                }}
                            >
                                    <ListItemButton onClick={() => handleNotificationClick(notification)}>
                                        <ListItemIcon sx={{ minWidth: 40 }}>
                                        {getIcon(notification)}
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Typography variant="body2" fontWeight={notification.is_read ? 'normal' : 'bold'}>
                                                    {notification.title}
                                                </Typography>
                                                {notification.priority === 'high' && (
                                                    <Chip label="مهم" size="small" color="error" sx={{ height: 18 }} />
                                                )}
                                            </Box>
                                        }
                                        secondary={
                                            <Box>
                                                <Typography variant="caption" color="text.secondary">
                                                    {notification.message}
                                                </Typography>
                                                <Typography variant="caption" display="block" color="text.disabled">
                                                    {formatTime(notification.created_at)}
                                                </Typography>
                                            </Box>
                                        }
                                    />
                                </ListItemButton>
                            </ListItem>
                        ))}
                    </List>
                )}
            </Popover>
        </>
    )
}
