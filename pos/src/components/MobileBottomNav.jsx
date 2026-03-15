import { useLocation, useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
    Badge,
    BottomNavigation,
    BottomNavigationAction,
    Fab,
    Paper,
    useMediaQuery,
    useTheme
} from '@mui/material'
import {
    Add as AddIcon,
    Dashboard as DashboardIcon,
    LocalShipping as DeliveryIcon,
    Receipt as OrdersIcon,
    Restaurant as ReadyIcon
} from '@mui/icons-material'

export default function MobileBottomNav({ hidden = false }) {
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const navigate = useNavigate()
    const location = useLocation()
    const { user } = useSelector((state) => state.auth)
    const userRole = user?.role || 'cashier'

    if (!isMobile || hidden) return null

    const tabs = [
        { label: 'الديليفري', icon: <DeliveryIcon />, path: '/delivery-board', roles: [] },
        { label: 'جاهزة', icon: <ReadyIcon />, path: '/cashier-queue', roles: [] },
        { label: 'الطلبات', icon: <OrdersIcon />, path: '/orders', roles: [] },
        { label: 'لوحة التحكم', icon: <DashboardIcon />, path: '/', roles: ['admin', 'manager'] }
    ]

    const filteredTabs = tabs.filter((tab) => tab.roles.length === 0 || tab.roles.includes(userRole))
    const currentIndex = filteredTabs.findIndex((tab) => tab.path === location.pathname)

    return (
        <Paper
            elevation={10}
            sx={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: (muiTheme) => muiTheme.zIndex.drawer + 2,
                borderRadius: '16px 16px 0 0',
                overflow: 'visible',
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                display: { xs: 'block', md: 'none' },
                borderTop: '1px solid',
                borderColor: 'divider'
            }}
        >
            <Fab
                color="primary"
                size="medium"
                onClick={() => navigate('/new-order')}
                aria-label="طلب جديد"
                sx={{
                    position: 'absolute',
                    top: -22,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    boxShadow: '0 8px 18px rgba(25, 118, 210, 0.4)',
                    width: 52,
                    height: 52
                }}
            >
                <Badge color="error" variant="dot" invisible={location.pathname === '/new-order'}>
                    <AddIcon />
                </Badge>
            </Fab>

            <BottomNavigation
                value={currentIndex >= 0 ? currentIndex : false}
                onChange={(_, newValue) => {
                    if (filteredTabs[newValue]) navigate(filteredTabs[newValue].path)
                }}
                showLabels
                sx={{
                    height: 68,
                    bgcolor: 'background.paper',
                    px: 1,
                    '& .MuiBottomNavigationAction-root': {
                        minWidth: 'auto',
                        color: 'text.secondary',
                        py: 0.7,
                        '& .MuiBottomNavigationAction-label': {
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            mt: 0.3,
                            '&.Mui-selected': {
                                fontSize: '0.72rem'
                            }
                        },
                        '& .MuiSvgIcon-root': {
                            fontSize: '1.45rem'
                        },
                        '&.Mui-selected': {
                            color: 'primary.main'
                        }
                    }
                }}
            >
                {filteredTabs.map((tab) => (
                    <BottomNavigationAction key={tab.path} label={tab.label} icon={tab.icon} />
                ))}
            </BottomNavigation>
        </Paper>
    )
}
