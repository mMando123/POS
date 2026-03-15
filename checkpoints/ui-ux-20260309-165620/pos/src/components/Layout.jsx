import { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import {
    Box,
    CssBaseline,
    Drawer,
    AppBar,
    Toolbar,
    List,
    Typography,
    Divider,
    IconButton,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Avatar,
    Menu,
    MenuItem,
    useTheme,
    useMediaQuery,
    Button,
    Chip,
    Tooltip,
    Collapse,
    Stack,
    Badge
} from '@mui/material'
import {
    Menu as MenuIcon,
    Close as CloseIcon,
    Dashboard as DashboardIcon,
    RestaurantMenu as MenuItemIcon,
    ShoppingCart as OrderIcon,
    Assessment as ReportsIcon,
    History as ShiftIcon,
    People as UsersIcon,
    Settings as SettingsIcon,
    Logout as LogoutIcon,
    AddCircle as NewOrderIcon,
    TrendingUp as PerformanceIcon,
    School as SchoolIcon,
    Schedule as ScheduleIcon,
    EventBusy as EventBusyIcon,
    Lock as LockIcon,
    LockOpen as LockOpenIcon,
    Restaurant as ReadyOrdersIcon,
    LocalShipping as DeliveryIcon,
    Print as PrinterIcon,
    Inventory2 as InventoryIcon,
    Store as WarehouseIcon,
    Receipt as ReceiptIcon,
    Undo as RefundIcon,
    Business as SuppliersIcon,
    ShoppingCart as PurchaseOrderIcon,
    SwapHoriz as TransferIcon,
    Outbox as IssueIcon,
    Summarize as ReportIcon,
    ExpandLess,
    ExpandMore,
    PointOfSale as SalesIcon,
    LocalMall as PurchasesIcon,
    AdminPanelSettings as AdminIcon,
    AssignmentReturn as ReturnIcon,
    AccountBalance as AccountingIcon,
    LocalOffer as CouponIcon,
    ArrowDropDown as ArrowDropDownIcon,
    CalendarToday as DateIcon,
    Person as ProfileIcon,
    VpnKey as PasswordIcon
} from '@mui/icons-material'
import { logout } from '../store/slices/authSlice'
import { setShowShiftDialog } from '../store/slices/shiftSlice'
import { settingsAPI } from '../services/api'
import ShiftDialog from './ShiftDialog'
import NotificationCenter from './NotificationCenter'
import { useThemeConfig } from '../contexts/ThemeContext'
import { toReadableText } from '../utils/textSanitizer'
import MobileBottomNav from './MobileBottomNav'

const DRAWER_WIDTH = 280
const MINI_RAIL_WIDTH = 96

export default function Layout() {
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const navigate = useNavigate()
    const location = useLocation()
    const dispatch = useDispatch()

    // Translation & Theme: Logic for Language Detection
    const { t, language, isRtl } = useThemeConfig()
    const layoutIsRtl = isRtl
        || theme.direction === 'rtl'
        || (typeof document !== 'undefined' && (document.documentElement?.dir === 'rtl' || document.body?.dir === 'rtl'))
        || (typeof window !== 'undefined'
            && typeof document !== 'undefined'
            && document.body
            && window.getComputedStyle(document.body).direction === 'rtl')
    // MUI Drawer auto-inverts horizontal anchors in RTL.
    // To keep the drawer physically on the right, use "left" when RTL.
    const drawerPhysicalRightAnchor = layoutIsRtl ? 'left' : 'right'

    const [drawerOpen, setDrawerOpen] = useState(true)
    const [anchorEl, setAnchorEl] = useState(null)
    const [storeInfo, setStoreInfo] = useState({ storeName: 'Smart POS', logo: null })

    // Expandable menu states
    const [openMenus, setOpenMenus] = useState({
        sales: true,
        inventory: false,
        purchases: false,
        hr: false,
        accounting: false,
        admin: false
    })

    const { user } = useSelector((state) => state.auth)
    const { activeShift } = useSelector((state) => state.shift)
    const userRole = user?.role || 'cashier'

    // Header State
    const [currentTime, setCurrentTime] = useState(new Date())
    const [anchorElUser, setAnchorElUser] = useState(null)

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000 * 60)
        return () => clearInterval(timer)
    }, [])

    const handleOpenUserMenu = (event) => {
        setAnchorElUser(event.currentTarget)
    }

    const handleCloseUserMenu = () => {
        setAnchorElUser(null)
    }

    const handleLogout = () => {
        handleCloseUserMenu()
        dispatch(logout())
        navigate('/login')
    }

    // Fetch store info
    useEffect(() => {
        const fetchStoreInfo = async () => {
            try {
                const res = await settingsAPI.getPublic()
                if (res.data?.data) {
                    setStoreInfo({
                        storeName: res.data.data.storeName || 'Smart POS',
                        logo: res.data.data.logo
                    })
                }
            } catch (error) {
                console.error('Fetch store info error:', error)
            }
        }
        fetchStoreInfo()

        window.addEventListener('settingsUpdated', fetchStoreInfo)
        return () => window.removeEventListener('settingsUpdated', fetchStoreInfo)
    }, [])

    // Close drawer on mobile by default
    useEffect(() => {
        if (isMobile) {
            setDrawerOpen(false)
        }
    }, [isMobile])

    // Auto-expand menu based on current path
    useEffect(() => {
        const path = location.pathname
        if (['/new-order', '/orders', '/sales-invoices', '/cashier-queue', '/pending-orders', '/refunds', '/coupons', '/customers', '/delivery-board'].includes(path)) {
            setOpenMenus(prev => ({ ...prev, sales: true }))
        } else if (['/inventory', '/warehouses', '/stock-transfers', '/stock-issues', '/inventory-reports'].includes(path)) {
            setOpenMenus(prev => ({ ...prev, inventory: true }))
        } else if (['/purchases', '/suppliers', '/purchase-orders', '/purchase-returns'].includes(path)) {
            setOpenMenus(prev => ({ ...prev, purchases: true }))
        } else if (['/hr/dashboard', '/hr/employees', '/hr/departments', '/hr/attendance', '/hr/leaves', '/hr/payroll', '/hr/performance', '/hr/training'].includes(path)) {
            setOpenMenus(prev => ({ ...prev, hr: true }))
        } else if (['/financial-reports', '/expenses', '/account-defaults', '/coa-manager', '/journal-entries', '/general-ledger', '/audit-log'].includes(path)) {
            setOpenMenus(prev => ({ ...prev, accounting: true }))
        } else if (['/reports', '/shift-history', '/users', '/branches', '/devices', '/settings', '/performance'].includes(path)) {
            setOpenMenus(prev => ({ ...prev, admin: true }))
        }
    }, [location.pathname])

    const toggleDrawer = () => setDrawerOpen(!drawerOpen)



    const handleShiftClick = () => {
        dispatch(setShowShiftDialog(true))
    }

    const handleMenuToggle = (menu) => {
        setOpenMenus(prev => ({ ...prev, [menu]: !prev[menu] }))
    }

    const formatShiftDuration = () => {
        if (!activeShift?.start_time) return ''
        const start = new Date(activeShift.start_time)
        const now = new Date()
        const diffMs = now - start
        const hours = Math.floor(diffMs / (1000 * 60 * 60))
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
        return isRtl ? `${hours}س ${minutes}د` : `${hours}h ${minutes}m`
    }

    // Menu Groups Configuration with translations
    const menuGroups = [
        {
            id: 'dashboard',
            title: t('sidebar.dashboard') || 'لوحة التحكم',
            icon: <DashboardIcon />,
            roles: ['admin', 'manager'],
            path: '/',
        },
        {
            id: 'sales',
            title: t('sidebar.sales'),
            icon: <SalesIcon />,
            roles: [],
            items: [
                { text: t('sidebar.directSale'), icon: <NewOrderIcon />, path: '/new-order', roles: [] },
                { text: 'لوحة الدليفري', icon: <DashboardIcon />, path: '/delivery-board', roles: [] },
                { text: 'إدارة الدليفري', icon: <DeliveryIcon />, path: '/delivery-management', roles: ['admin', 'manager'] },
                { text: t('sidebar.onlineOrders'), icon: <DeliveryIcon />, path: '/pending-orders', roles: [] },
                { text: t('sidebar.readyOrders'), icon: <ReadyOrdersIcon />, path: '/cashier-queue', roles: [] },
                { text: t('sidebar.orderHistory'), icon: <OrderIcon />, path: '/orders', roles: [] },
                { text: 'فواتير البيع المباشر', icon: <ReceiptIcon />, path: '/sales-invoices', roles: [] },
                { text: t('sidebar.refunds'), icon: <RefundIcon />, path: '/refunds', roles: ['admin', 'manager', 'supervisor'] },
                { text: 'إدارة الكوبونات', icon: <CouponIcon />, path: '/coupons', roles: ['admin', 'manager'] },
                { text: 'العملاء', icon: <UsersIcon />, path: '/customers', roles: ['admin', 'manager'] },
            ]
        },
        {
            id: 'inventory',
            title: t('sidebar.inventory'),
            icon: <InventoryIcon />,
            roles: ['admin', 'manager'],
            items: [
                { text: t('sidebar.inventoryDashboard'), icon: <DashboardIcon />, path: '/inventory', roles: ['admin', 'manager'] },
                { text: t('sidebar.warehouses'), icon: <WarehouseIcon />, path: '/warehouses', roles: ['admin', 'manager'] },
                { text: t('sidebar.stockTransfers'), icon: <TransferIcon />, path: '/stock-transfers', roles: ['admin', 'manager'] },
                { text: 'أذونات صرف البضاعة', icon: <IssueIcon />, path: '/stock-issues', roles: ['admin', 'manager'] },
                { text: t('sidebar.inventoryReports'), icon: <ReportIcon />, path: '/inventory-reports', roles: ['admin', 'manager'] },
            ]
        },
        {
            id: 'purchases',
            title: t('sidebar.purchases'),
            icon: <PurchasesIcon />,
            roles: ['admin', 'manager'],
            items: [
                { text: t('sidebar.purchaseHistory'), icon: <ReceiptIcon />, path: '/purchases', roles: ['admin', 'manager'] },
                { text: t('sidebar.suppliers'), icon: <SuppliersIcon />, path: '/suppliers', roles: ['admin', 'manager'] },
                { text: t('sidebar.purchaseOrders'), icon: <PurchaseOrderIcon />, path: '/purchase-orders', roles: ['admin', 'manager'] },
                { text: t('sidebar.purchaseReturns'), icon: <ReturnIcon />, path: '/purchase-returns', roles: ['admin', 'manager'] },
            ]
        },
        {
            id: 'hr',
            title: 'الموارد البشرية',
            icon: <UsersIcon />,
            roles: ['admin', 'manager'],
            items: [
                { text: 'لوحة HR', icon: <DashboardIcon />, path: '/hr/dashboard', roles: ['admin', 'manager'] },
                { text: 'الموظفون', icon: <UsersIcon />, path: '/hr/employees', roles: ['admin', 'manager'] },
                { text: 'الأقسام والمسميات', icon: <AdminIcon />, path: '/hr/departments', roles: ['admin', 'manager'] },
                { text: 'الحضور', icon: <ScheduleIcon />, path: '/hr/attendance', roles: ['admin', 'manager'] },
                { text: 'الإجازات', icon: <EventBusyIcon />, path: '/hr/leaves', roles: ['admin', 'manager'] },
                { text: 'الرواتب', icon: <ReceiptIcon />, path: '/hr/payroll', roles: ['admin', 'manager'] },
                { text: 'الأداء', icon: <PerformanceIcon />, path: '/hr/performance', roles: ['admin', 'manager'] },
                { text: 'التدريب', icon: <SchoolIcon />, path: '/hr/training', roles: ['admin', 'manager'] },
            ]
        },
        {
            id: 'accounting',
            title: t('sidebar.accounting'),
            icon: <AccountingIcon />,
            roles: ['admin', 'manager', 'accountant'],
            items: [
                { text: 'لوحة الإحصائيات المالية', icon: <DashboardIcon />, path: '/accounting-dashboard', roles: ['admin', 'manager', 'accountant'] },
                { text: t('sidebar.financialReports'), icon: <ReportIcon />, path: '/financial-reports', roles: ['admin', 'manager', 'accountant'] },
                { text: 'دفتر الأستاذ العام', icon: <AccountingIcon />, path: '/general-ledger', roles: ['admin', 'manager', 'accountant'] },
                { text: 'دفتر اليومية', icon: <ReceiptIcon />, path: '/journal-entries', roles: ['admin', 'manager'] },
                { text: t('sidebar.expenses') || 'المصروفات', icon: <ReceiptIcon />, path: '/expenses', roles: ['admin', 'manager'] },
                { text: 'إدارة شجرة الحسابات', icon: <AccountingIcon />, path: '/coa-manager', roles: ['admin'] },
                { text: 'إعدادات الحسابات', icon: <SettingsIcon />, path: '/account-defaults', roles: ['admin'] },
                { text: 'سجل المراجعة', icon: <ReportsIcon />, path: '/audit-log', roles: ['admin'] },
            ]
        },
        {
            id: 'menu',
            title: t('sidebar.menu'),
            icon: <MenuItemIcon />,
            roles: ['admin', 'manager'],
            path: '/menu',
        },
        {
            id: 'admin',
            title: t('sidebar.administration'),
            icon: <AdminIcon />,
            roles: ['admin', 'manager'],
            items: [
                { text: t('sidebar.reports'), icon: <ReportsIcon />, path: '/reports', roles: ['admin', 'manager'] },
                { text: t('sidebar.shifts'), icon: <ShiftIcon />, path: '/shift-history', roles: ['admin', 'manager'] },
                { text: t('sidebar.cashierPerformance'), icon: <PerformanceIcon />, path: '/performance', roles: ['admin', 'manager'] },
                { text: t('sidebar.users'), icon: <UsersIcon />, path: '/users', roles: ['admin'] },
                { text: 'الفروع', icon: <WarehouseIcon />, path: '/branches', roles: ['admin'] },
                { text: t('sidebar.printers'), icon: <PrinterIcon />, path: '/devices', roles: ['admin'] },
                { text: t('sidebar.settings'), icon: <SettingsIcon />, path: '/settings', roles: ['admin'] },
            ]
        },
    ]

    // Filter menu groups based on user role
    const filteredMenuGroups = menuGroups.filter(group =>
        group.roles.length === 0 || group.roles.includes(userRole)
    ).map(group => ({
        ...group,
        items: group.items?.filter(item =>
            item.roles.length === 0 || item.roles.includes(userRole)
        )
    }))

    const isPathActive = (path) => location.pathname === path

    const isGroupActive = (group) => {
        if (group.path) return isPathActive(group.path)
        return group.items?.some(item => isPathActive(item.path))
    }

    const preferredPathByGroup = {
        sales: '/new-order',
        inventory: '/inventory',
        purchases: '/purchases',
        hr: '/hr/dashboard',
        accounting: '/accounting-dashboard',
        admin: '/reports',
    }

    const miniShortcuts = filteredMenuGroups
        .map((group) => {
            if (group.path) {
                return {
                    key: group.id,
                    label: group.title,
                    icon: group.icon,
                    path: group.path
                }
            }

            if (!Array.isArray(group.items) || group.items.length === 0) return null

            const preferred = group.items.find((item) => item.path === preferredPathByGroup[group.id]) || group.items[0]
            if (!preferred) return null

            return {
                key: group.id,
                label: group.title || preferred.text,
                icon: group.icon || preferred.icon,
                path: preferred.path
            }
        })
        .filter(Boolean)

    const showMiniRail = !drawerOpen && !isMobile
    const miniRailOffset = `${MINI_RAIL_WIDTH + 20}px`
    const miniRailPositionStyle = layoutIsRtl
        ? { inset: '78px 10px 10px auto' }
        : { inset: '78px auto 10px 10px' }
    const contentOffsetStyle = showMiniRail
        ? (layoutIsRtl
            ? { marginRight: miniRailOffset, marginLeft: '0px' }
            : { marginLeft: miniRailOffset, marginRight: '0px' })
        : { marginRight: '0px', marginLeft: '0px' }

    const getRoleLabel = () => {
        if (userRole === 'admin') return t('users.admin')
        if (userRole === 'manager') return t('users.manager')
        return t('users.cashier')
    }

    const displayNameAr = toReadableText(user?.name_ar, user?.username || 'المستخدم')
    const displayNameEn = toReadableText(user?.name_en, user?.username || displayNameAr)
    const displayBranchName = toReadableText(user?.Branch?.name_ar, getRoleLabel() || 'الفرع الرئيسي')
    const avatarLabel = displayNameAr || displayNameEn || user?.username || 'U'
    const avatarInitial = avatarLabel.trim().charAt(0) || 'U'

    const drawerContent = (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#1a2035' }}>
            {/* Header */}
            <Toolbar sx={{ justifyContent: 'space-between', py: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ p: 0.5, bgcolor: 'primary.main', borderRadius: 2, color: 'white', display: 'flex', overflow: 'hidden', width: 36, height: 36, justifyContent: 'center', alignItems: 'center' }}>
                        {storeInfo.logo ? (
                            <Box
                                component="img"
                                src={storeInfo.logo.startsWith('http') ? storeInfo.logo : `${import.meta.env.VITE_API_URL || ''}${storeInfo.logo}`}
                                sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                onError={(e) => {
                                    e.target.style.display = 'none'
                                    e.target.nextSibling.style.display = 'flex'
                                }}
                            />
                        ) : null}
                        <MenuItemIcon fontSize="small" sx={{ display: storeInfo.logo ? 'none' : 'block' }} />
                    </Box>
                    <Typography variant="h6" fontWeight="bold" noWrap sx={{ maxWidth: 160, color: 'white' }}>
                        {storeInfo.storeName}
                    </Typography>
                </Box>
                <IconButton onClick={toggleDrawer} size="small" sx={{ color: 'grey.400' }}>
                    <CloseIcon />
                </IconButton>
            </Toolbar>
            <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

            {/* Menu Groups */}
            <List sx={{ flexGrow: 1, px: 1.5, py: 2, overflowY: 'auto' }}>
                {filteredMenuGroups.map((group) => (
                    <Box key={group.id} sx={{ mb: 0.5 }}>
                        {group.path ? (
                            <ListItemButton
                                onClick={() => {
                                    navigate(group.path)
                                    if (isMobile) setDrawerOpen(false)
                                }}
                                selected={isPathActive(group.path)}
                                sx={{
                                    borderRadius: 2,
                                    mb: 0.5,
                                    color: 'grey.300',
                                    '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                                    '&.Mui-selected': {
                                        bgcolor: 'primary.main',
                                        color: 'white',
                                        '&:hover': { bgcolor: 'primary.dark' },
                                        '& .MuiListItemIcon-root': { color: 'white' },
                                    },
                                }}
                            >
                                <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}>{group.icon}</ListItemIcon>
                                <ListItemText primary={group.title} primaryTypographyProps={{ fontWeight: 600 }} />
                            </ListItemButton>
                        ) : (
                            <>
                                <ListItemButton
                                    onClick={() => handleMenuToggle(group.id)}
                                    sx={{
                                        borderRadius: 2,
                                        mb: 0.5,
                                        color: isGroupActive(group) ? 'primary.light' : 'grey.300',
                                        bgcolor: isGroupActive(group) ? 'rgba(33, 150, 243, 0.1)' : 'transparent',
                                        '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                                    }}
                                >
                                    <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}>{group.icon}</ListItemIcon>
                                    <ListItemText primary={group.title} primaryTypographyProps={{ fontWeight: 600 }} />
                                    {openMenus[group.id] ? <ExpandLess /> : <ExpandMore />}
                                </ListItemButton>

                                <Collapse in={openMenus[group.id]} timeout="auto" unmountOnExit>
                                    {/* FIX: Use standard padding-left, Stylis handles RTL flip */}
                                    <List component="div" disablePadding sx={{ pl: 4 }}>
                                        {group.items.map((item) => (
                                            <ListItemButton
                                                key={item.path}
                                                onClick={() => {
                                                    navigate(item.path)
                                                    if (isMobile) setDrawerOpen(false)
                                                }}
                                                selected={isPathActive(item.path)}
                                                sx={{
                                                    borderRadius: 2,
                                                    py: 0.8,
                                                    mb: 0.3,
                                                    color: 'grey.400',
                                                    // FIX: Use borderLeft as "Start Border", Stylis flips to Right in RTL
                                                    borderLeft: isPathActive(item.path) ? '3px solid' : 'none',
                                                    borderColor: 'primary.main',
                                                    '&:hover': { bgcolor: 'rgba(255,255,255,0.05)', color: 'grey.200' },
                                                    '&.Mui-selected': {
                                                        bgcolor: 'rgba(33, 150, 243, 0.15)',
                                                        color: 'primary.light',
                                                        '&:hover': { bgcolor: 'rgba(33, 150, 243, 0.2)' },
                                                        '& .MuiListItemIcon-root': { color: 'primary.light' },
                                                    },
                                                }}
                                            >
                                                <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>{item.icon}</ListItemIcon>
                                                <ListItemText
                                                    primary={item.text}
                                                    primaryTypographyProps={{ fontSize: '0.9rem' }}
                                                />
                                            </ListItemButton>
                                        ))}
                                    </List>
                                </Collapse>
                            </>
                        )}
                    </Box>
                ))}
            </List>

            <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

            {/* Shift Status Button */}
            <Box sx={{ p: 2 }}>
                <Button
                    fullWidth
                    variant={activeShift ? 'contained' : 'outlined'}
                    color={activeShift ? 'warning' : 'primary'}
                    onClick={handleShiftClick}
                    startIcon={activeShift ? <LockIcon /> : <LockOpenIcon />}
                    sx={{
                        py: 1.5,
                        borderRadius: 2,
                        justifyContent: 'flex-start',
                        textAlign: 'start'
                    }}
                >
                    <Box sx={{ textAlign: 'start' }}>
                        <Typography variant="body2" fontWeight="bold">
                            {activeShift ? t('shifts.closeShift') : t('shifts.openShift')}
                        </Typography>
                        {activeShift && (
                            <Typography variant="caption" sx={{ opacity: 0.8 }}>
                                {formatShiftDuration()}
                            </Typography>
                        )}
                    </Box>
                </Button>
            </Box>

            {/* User Info */}
            <Box sx={{ p: 2, pt: 0 }}>
                <Box
                    onClick={(e) => setAnchorEl(e.currentTarget)}
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        cursor: 'pointer',
                        p: 1.5,
                        borderRadius: 2,
                        bgcolor: 'rgba(255,255,255,0.05)',
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
                    }}
                >
                    <Avatar sx={{ bgcolor: 'secondary.main', width: 36, height: 36 }}>
                        {avatarInitial}
                    </Avatar>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography variant="subtitle2" noWrap fontWeight="bold" color="white">
                            {isRtl ? displayNameAr : displayNameEn}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'grey.400' }}>
                            {getRoleLabel()}
                        </Typography>
                    </Box>
                    <SettingsIcon fontSize="small" sx={{ color: 'grey.500' }} />
                </Box>
            </Box>

            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
                <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
                    <ListItemIcon><LogoutIcon fontSize="small" color="error" /></ListItemIcon>
                    <ListItemText>{t('auth.logout')}</ListItemText>
                </MenuItem>
            </Menu>
        </Box>
    )

    return (
        <Box
            dir={layoutIsRtl ? 'rtl' : 'ltr'}
            sx={{ display: 'flex', minHeight: '100vh' }}
        >
            <CssBaseline />

            {/* AppBar */}
            <AppBar
                position="fixed"
                elevation={1}
                sx={{
                    zIndex: theme.zIndex.drawer + 1,
                    bgcolor: 'background.paper',
                    color: 'text.primary',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                }}
            >
                <Toolbar sx={{ height: { xs: 56, md: 70 }, justifyContent: 'space-between', px: { xs: 1, md: 2 }, gap: { xs: 0.75, md: 0 } }}>

                    {/* RIGHT SIDE (Start in RTL): Menu, Date, Shift */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.75, md: 1.5 } }}>
                        {/* Menu Toggle */}
                        <IconButton
                            onClick={toggleDrawer}
                            edge="start"
                            sx={{
                                bgcolor: 'primary.soft',
                                color: 'primary.main',
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 2,
                                '&:hover': { bgcolor: 'primary.main', color: 'white' }
                            }}
                        >
                            <MenuIcon />
                        </IconButton>

                        {/* Date & Time */}
                        <Box sx={{
                            display: { xs: 'none', md: 'flex' },
                            alignItems: 'center',
                            gap: 1.5,
                            bgcolor: 'background.default',
                            px: 1.5,
                            py: 0.8,
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'divider'
                        }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <DateIcon fontSize="small" color="primary" sx={{ fontSize: 18 }} />
                                <Typography variant="caption" fontWeight="600" fontFamily="monospace">
                                    {currentTime.toLocaleDateString('en-GB')}
                                </Typography>
                            </Box>

                            <Divider orientation="vertical" flexItem sx={{ height: 14, my: 'auto' }} />

                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <ScheduleIcon fontSize="small" color="warning" sx={{ fontSize: 18 }} />
                                <Typography variant="caption" fontWeight="600" fontFamily="monospace">
                                    {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                </Typography>
                            </Box>
                        </Box>

                        {/* Active Shift Indicator */}
                        {activeShift && (
                            <Chip
                                label={t('shifts.shiftOpen')}
                                size="small"
                                color="success"
                                variant="outlined"
                                onClick={handleShiftClick}
                                icon={<LockOpenIcon fontSize="small" />}
                                sx={{
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    display: { xs: 'none', lg: 'flex' },
                                    borderRadius: 1.5
                                }}
                            />
                        )}
                    </Box>

                    {/* CENTER: System Name */}
                    <Typography
                        variant="h6"
                        noWrap
                        component="div"
                        sx={{
                            textAlign: 'center',
                            fontWeight: '800',
                            letterSpacing: -0.5,
                            background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                            backgroundClip: 'text',
                            textFillColor: 'transparent',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            display: { xs: 'none', sm: 'block' }
                        }}
                    >
                        Smart POS System
                    </Typography>

                    {/* LEFT SIDE (End in RTL): Notifications, User Profile */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, md: 1 } }}>

                        {/* Notifications */}
                        <Box sx={{ mr: 0.5 }}>
                            <NotificationCenter />
                        </Box>

                        <Divider orientation="vertical" flexItem sx={{ height: 24, my: 'auto', mx: 0.5, display: { xs: 'none', md: 'block' } }} />

                        {/* User Profile Dropdown */}
                        <Button
                            onClick={handleOpenUserMenu}
                            sx={{
                                textTransform: 'none',
                                color: 'text.primary',
                                borderRadius: 2,
                                py: 0.5,
                                px: { xs: 0.5, md: 1 },
                                minWidth: { xs: 44, md: 'auto' },
                                gap: { xs: 0, md: 1.5 },
                                border: '1px solid',
                                borderColor: 'transparent',
                                '&:hover': {
                                    bgcolor: 'background.default',
                                    borderColor: 'divider'
                                }
                            }}
                        >
                            <Box sx={{ textAlign: 'end', display: { xs: 'none', md: 'block' } }}>
                                <Typography variant="subtitle2" fontWeight="bold" lineHeight={1.2}>
                                    {displayNameAr || 'مدير النظام'}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" display="block" lineHeight={1}>
                                    {displayBranchName}
                                </Typography>
                            </Box>

                            <Avatar
                                sx={{
                                    width: { xs: 36, md: 40 },
                                    height: { xs: 36, md: 40 },
                                    bgcolor: 'primary.main',
                                    boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                                    fontSize: '1rem'
                                }}
                            >
                                {avatarInitial}
                            </Avatar>

                            <ArrowDropDownIcon color="action" fontSize="small" sx={{ display: { xs: 'none', md: 'block' } }} />
                        </Button>

                        <Menu
                            elevation={3}
                            sx={{ mt: 1.5 }}
                            anchorEl={anchorElUser}
                            anchorOrigin={{
                                vertical: 'bottom',
                                horizontal: 'left',
                            }}
                            transformOrigin={{
                                vertical: 'top',
                                horizontal: 'left',
                            }}
                            open={Boolean(anchorElUser)}
                            onClose={handleCloseUserMenu}
                            PaperProps={{
                                sx: {
                                    minWidth: 200,
                                    borderRadius: 3,
                                    mt: 1,
                                    overflow: 'visible',
                                    '&:before': { // Triangle arrow
                                        content: '""',
                                        display: 'block',
                                        position: 'absolute',
                                        top: 0,
                                        left: 20,
                                        width: 10,
                                        height: 10,
                                        bgcolor: 'background.paper',
                                        transform: 'translateY(-50%) rotate(45deg)',
                                        zIndex: 0,
                                    },
                                }
                            }}
                        >
                            <Box sx={{ px: 2, py: 1.5, bgcolor: 'primary.50' }}>
                                <Typography variant="subtitle2" fontWeight="bold" color="primary.main">
                                    {displayNameAr || 'المستخدم'}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {user?.email || 'user@system.com'}
                                </Typography>
                            </Box>
                            <Divider />

                            <MenuItem onClick={() => { handleCloseUserMenu(); navigate('/profile'); }} sx={{ py: 1.5 }}>
                                <ListItemIcon><ProfileIcon fontSize="small" /></ListItemIcon>
                                <Typography variant="body2">{t('auth.profile') || 'الملف الشخصي'}</Typography>
                            </MenuItem>
                            <MenuItem onClick={() => { handleCloseUserMenu(); navigate('/settings'); }} sx={{ py: 1.5 }}>
                                <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
                                <Typography variant="body2">{t('sidebar.settings') || 'الإعدادات'}</Typography>
                            </MenuItem>

                            <Divider />

                            <MenuItem onClick={handleLogout} sx={{ color: 'error.main', py: 1.5 }}>
                                <ListItemIcon><LogoutIcon fontSize="small" color="error" /></ListItemIcon>
                                <Typography variant="body2" fontWeight="bold">{t('auth.logout')}</Typography>
                            </MenuItem>
                        </Menu>
                    </Box>

                </Toolbar>
            </AppBar>

            {/* Sidebar Drawer */}
            <Drawer
                key={`drawer-${layoutIsRtl ? 'rtl' : 'ltr'}`}
                variant="temporary"
                anchor={drawerPhysicalRightAnchor}
                open={drawerOpen}
                onClose={toggleDrawer}
                ModalProps={{ keepMounted: true }}
                PaperProps={{
                    sx: {
                        width: { xs: 'min(88vw, 320px)', md: DRAWER_WIDTH },
                        bgcolor: '#1a2035',
                        color: 'white',
                        border: 'none',
                        maxHeight: { xs: '100dvh', md: '100vh' }
                    }
                }}
            >
                {drawerContent}
            </Drawer>

            {/* Mini shortcuts rail (desktop, when drawer is closed) */}
            {showMiniRail && (
                <Box
                    style={miniRailPositionStyle}
                    sx={{
                        position: 'fixed',
                        width: MINI_RAIL_WIDTH,
                        bgcolor: 'background.paper',
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 3,
                        boxShadow: '0 8px 22px rgba(0,0,0,0.08)',
                        zIndex: theme.zIndex.drawer,
                        display: { xs: 'none', md: 'flex' },
                        flexDirection: 'column',
                        overflow: 'hidden'
                    }}
                >
                    <Box sx={{ p: 1, display: 'flex', justifyContent: 'center' }}>
                        <Tooltip title={t('sidebar.menu') || 'القائمة'} placement={layoutIsRtl ? 'left' : 'right'}>
                            <IconButton
                                onClick={toggleDrawer}
                                size="small"
                                sx={{
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    borderRadius: 2,
                                    bgcolor: 'background.default',
                                    '&:hover': { bgcolor: 'primary.main', color: 'white' }
                                }}
                            >
                                <MenuIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                    <Divider />
                    <List sx={{ py: 1, overflowY: 'auto' }}>
                        {miniShortcuts.map((item) => (
                            <ListItem key={`mini-${item.key}`} disablePadding sx={{ px: 0.8, py: 0.3 }}>
                                <Tooltip title={item.label} placement={layoutIsRtl ? 'left' : 'right'}>
                                    <ListItemButton
                                        selected={isPathActive(item.path)}
                                        onClick={() => navigate(item.path)}
                                        sx={{
                                            borderRadius: 2,
                                            py: 1,
                                            px: 0.6,
                                            flexDirection: 'column',
                                            gap: 0.4,
                                            minHeight: 74,
                                            textAlign: 'center',
                                            '&.Mui-selected': {
                                                bgcolor: 'primary.main',
                                                color: 'white',
                                                '&:hover': { bgcolor: 'primary.dark' },
                                                '& .MuiListItemIcon-root': { color: 'white' },
                                                '& .MuiTypography-root': { color: 'white' }
                                            }
                                        }}
                                    >
                                        <ListItemIcon sx={{ minWidth: 0, color: 'primary.main' }}>
                                            {item.icon}
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={item.label}
                                            primaryTypographyProps={{
                                                variant: 'caption',
                                                fontWeight: 700,
                                                lineHeight: 1.1,
                                                sx: {
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 2,
                                                    WebkitBoxOrient: 'vertical',
                                                    overflow: 'hidden'
                                                }
                                            }}
                                        />
                                    </ListItemButton>
                                </Tooltip>
                            </ListItem>
                        ))}
                    </List>
                </Box>
            )}

            {/* Main Content */}
            <Box
                component="main"
                style={contentOffsetStyle}
                sx={{
                    flexGrow: 1,
                    p: { xs: 1.5, sm: 2, md: 3 },
                    mt: { xs: 7, md: 9 },
                    pb: { xs: '90px', md: 3 },  // Bottom padding for mobile nav
                    width: '100%',
                    minHeight: '100vh',
                    bgcolor: 'background.default',
                    // iOS safe area
                    paddingBottom: { xs: 'calc(80px + env(safe-area-inset-bottom, 0px))', md: '24px' }
                }}
            >
                <Outlet />
            </Box>

            {/* Mobile Bottom Navigation */}
            <MobileBottomNav hidden={drawerOpen} />

            {/* Shift Dialog */}
            <ShiftDialog />
        </Box>
    )
}
