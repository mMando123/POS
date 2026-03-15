import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Button,
  IconButton,
  useMediaQuery,
  useTheme,
  Badge,
  Chip,
  CircularProgress,
  Grid,
  Card,
  CardContent,
  CardMedia,
  Drawer,
  Fab,
  Paper,
  Tabs,
  Tab,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Divider as Div2,
  Tooltip
} from
  '@mui/material';
import {
  ShoppingCart,
  Search,
  Close,
  Delete,
  Add,
  Remove,
  ReceiptLong as ReceiptIcon,
  CreditCard as CardIcon,
  Payments as CashIcon,
  TableRestaurant as DineInIcon,
  TakeoutDining as TakeawayIcon,
  DeliveryDining as DeliveryIcon
} from
  '@mui/icons-material';
import toast from 'react-hot-toast';
import { menuAPI, categoryAPI, orderAPI, couponAPI, settingsAPI, pricingAPI, loyaltyAPI, inventoryAPI, warehouseAPI, deliveryAPI } from '../services/api';
import { setMenuItems, setCategories } from '../store/slices/menuSlice';
import { addToCart, removeFromCart, updateQuantity, clearCart, selectCartTotal } from '../store/slices/cartSlice';
import { setShowShiftDialog } from '../store/slices/shiftSlice';
import useDebounce from '../hooks/useDebounce';
import useSoundFeedback from '../hooks/useSoundFeedback';
import { printReceipt } from '../components/Receipt';
import { printKitchenOrder } from '../components/KitchenReceipt';
import offlineQueue from '../services/offlineQueue';
import { useThemeConfig } from '../contexts/ThemeContext';

const round2 = (value) => Math.round((parseFloat(value || 0) + Number.EPSILON) * 100) / 100;

// --- Components ---

const CategoryTabs = ({ categories, selected, onSelect }) =>
  <Paper elevation={0} sx={{ mb: 2, bgcolor: 'transparent' }}>
    <Tabs
      value={selected}
      onChange={(e, v) => onSelect(v)}
      variant="scrollable"
      scrollButtons="auto"
      allowScrollButtonsMobile
      sx={{
        '& .MuiTabs-scroller': {
          px: 0.5
        },
        '& .MuiTabs-flexContainer': {
          gap: 1,
          py: 0.25
        },
        '& .MuiTab-root': {
          minHeight: 46,
          minWidth: 88,
          borderRadius: 2,
          mr: 0,
          px: 1.5,
          whiteSpace: 'nowrap',
          textTransform: 'none',
          fontWeight: 'bold',
          fontSize: { xs: '0.95rem', sm: '1rem' },
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          '&.Mui-selected, &.Mui-selected:hover': {
            bgcolor: 'primary.main',
            color: 'white',
            borderColor: 'primary.main'
          }
        },
        '& .MuiTabs-indicator': { display: 'none' },
        '& .MuiTabs-scrollButtons.Mui-disabled': {
          opacity: 0.25
        }
      }}>

      <Tab label="الكل" value="all" />
      {categories.map((cat) =>
        <Tab key={cat.id} label={cat.name_ar} value={cat.id} />
      )}
    </Tabs>
  </Paper>;


const ProductCard = ({ item, onClick, formatCurrency }) =>
  <Card
    onClick={() => onClick(item)}
    sx={{
      height: '100%',
      cursor: 'pointer',
      transition: 'all 0.2s',
      borderRadius: 3,
      position: 'relative',
      overflow: 'visible',
      border: '1px solid transparent',
      '&:hover': { transform: 'translateY(-4px)', boxShadow: 6, borderColor: 'primary.light' }
    }}>

    <Box sx={{ position: 'relative', pt: '60%', bgcolor: 'grey.100', borderRadius: '12px 12px 0 0', overflow: 'hidden' }}>
      {item.image_url ?
        <CardMedia
          component="img"
          image={item.image_url.startsWith('http') ?
            item.image_url :
            `${import.meta.env.VITE_API_URL || ''}${item.image_url}`}
          onError={(e) => {
            e.target.onerror = null;
            e.target.style.display = 'none';
            e.target.parentNode.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:3rem">🖼️</div>';
          }}
          alt={item.name_ar}
          sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> :


        <Box sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>
          🖼️
        </Box>
      }
      <Chip
        label={formatCurrency(item.price)}
        color="primary"
        size="small"
        sx={{ position: 'absolute', bottom: 8, right: 8, fontWeight: 'bold' }} />

    </Box>
    <CardContent sx={{ p: 1.5, pb: '12px !important' }}>
      <Typography variant="subtitle2" fontWeight="bold" noWrap>{item.name_ar}</Typography>
    </CardContent>
  </Card>;


const CartItem = ({ item, onUpdate, onRemove, formatCurrency }) =>
  <Box sx={{ display: 'flex', p: 1.5, mb: 1, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider', transition: '0.2s', '&:hover': { borderColor: 'primary.main' }, minWidth: 0, alignItems: { xs: 'flex-start', sm: 'center' }, gap: 1, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
      <Typography variant="subtitle2" fontWeight="bold" noWrap>{item.name_ar}</Typography>
      <Typography variant="caption" color="text.secondary">{formatCurrency(item.price)} / للوحدة</Typography>
      {item.batch_number &&
        <Typography variant="caption" color="info.main" sx={{ display: 'block' }}>
          رقم التشغيلة: {item.batch_number}
        </Typography>
      }
    </Box>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, width: { xs: '100%', sm: 'auto' }, justifyContent: { xs: 'space-between', sm: 'flex-end' } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'grey.100', borderRadius: 2 }}>
        <IconButton size="small" onClick={() => onUpdate(item.menu_id, Math.max(0, item.quantity - 1))} color="error">
          <Remove fontSize="small" />
        </IconButton>
        <Typography variant="body2" fontWeight="bold" sx={{ minWidth: 20, textAlign: 'center' }}>{item.quantity}</Typography>
        <IconButton size="small" onClick={() => onUpdate(item.menu_id, item.quantity + 1)} color="primary">
          <Add fontSize="small" />
        </IconButton>
      </Box>
      <Typography variant="subtitle2" fontWeight="bold" sx={{ minWidth: 50, textAlign: 'right' }}>
        {formatCurrency(item.price * item.quantity)}
      </Typography>
    </Box>
  </Box>;


const CartSummary = ({ rawSubtotal, discount, subtotal, tax, total, taxRate, onCheckout, loading, formatCurrency, compact = false }) =>
  <Paper sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 3, borderTop: '1px solid', borderColor: 'divider', mt: 'auto', bgcolor: 'grey.50' }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
      <Typography variant="body2" color="text.secondary">المجموع الفرعي</Typography>
      <Typography variant="body2" fontWeight="bold">{formatCurrency(rawSubtotal)}</Typography>
    </Box>
    {discount > 0 &&
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="body2" color="success.main">خصم</Typography>
        <Typography variant="body2" fontWeight="bold" color="success.main">-{formatCurrency(discount)}</Typography>
      </Box>
    }
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
      <Typography variant="body2" color="text.secondary">بعد الخصم</Typography>
      <Typography variant="body2" fontWeight="bold">{formatCurrency(subtotal)}</Typography>
    </Box>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
      <Typography variant="body2" color="text.secondary">الضريبة ({taxRate}%)</Typography>
      <Typography variant="body2" fontWeight="bold">{formatCurrency(tax)}</Typography>
    </Box>
    <Divider sx={{ mb: 2 }} />
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: { xs: 2, sm: 3 } }}>
      <Typography variant="h6" fontWeight="bold">الإجمالي</Typography>
      <Typography variant={compact ? 'h4' : 'h5'} fontWeight="900" color="primary.main">{formatCurrency(total)}</Typography>
    </Box>

    <Grid container spacing={2}>
      <Grid item xs={6}>
        <Button
          fullWidth
          variant="contained"
          color="success"
          size="large"
          startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <CashIcon />}
          onClick={() => onCheckout('cash')}
          disabled={loading}
          sx={{ py: { xs: 1.2, sm: 1.5 }, borderRadius: 2 }}>

          نقدي
        </Button>
      </Grid>
      <Grid item xs={6}>
        <Button
          fullWidth
          variant="contained"
          color="primary"
          size="large"
          startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <CardIcon />}
          onClick={() => onCheckout('card')}
          disabled={loading}
          sx={{ py: { xs: 1.2, sm: 1.5 }, borderRadius: 2 }}>

          بطاقة
        </Button>
      </Grid>
      <Grid item xs={12}>
        <Button
          fullWidth
          variant="outlined"
          size="large"
          onClick={() => onCheckout('multi')}
          disabled={loading}
          sx={{ py: { xs: 1.05, sm: 1.2 }, borderRadius: 2 }}>

          دفع متعدد
        </Button>
      </Grid>
    </Grid>
  </Paper>;


// --- Main Page ---

export default function NewOrder() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Selectors & State
  const { user } = useSelector((state) => state.auth);
  const { items: menuItems, categories } = useSelector((state) => state.menu);
  const { items: cartItems } = useSelector((state) => state.cart);
  const { activeShift, shiftChecked } = useSelector((state) => state.shift);
  const cartTotal = useSelector(selectCartTotal);

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState('');
  const [pricingPreview, setPricingPreview] = useState(null);
  const [taxRate, setTaxRate] = useState(15);
  const [cartOpen, setCartOpen] = useState(false); // For mobile drawer
  const [priceLists, setPriceLists] = useState([]);
  const [selectedPriceListId, setSelectedPriceListId] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [couponInfo, setCouponInfo] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [loyaltyInfo, setLoyaltyInfo] = useState(null);
  const [redeemPoints, setRedeemPoints] = useState('');
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [splitPayment, setSplitPayment] = useState({ cash: '', card: '', online: '' });
  const [selectedBatches, setSelectedBatches] = useState({});
  const [batchDialog, setBatchDialog] = useState({
    open: false,
    item: null,
    batches: [],
    selectedBatch: ''
  });
  const [offlineCount, setOfflineCount] = useState(offlineQueue.count());
  // Order type & delivery
  const [orderType, setOrderType] = useState('takeaway');
  const [tableNumber, setTableNumber] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('');
  const [deliveryPersonnelId, setDeliveryPersonnelId] = useState('');
  const [deliveryPersonnel, setDeliveryPersonnel] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [operationModes, setOperationModes] = useState({ enableDelivery: true, enableOnlineOrders: true, autoCompleteOrders: false });
  const [orderNumberConfig, setOrderNumberConfig] = useState({ prefix: 'ORD', start: 1000 });
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(localStorage.getItem('pos_selected_warehouse_id') || '');
  const [branchStockRows, setBranchStockRows] = useState([]);

  const debouncedSearch = useDebounce(searchTerm, 300);
  const debouncedCustomerPhone = useDebounce(customerPhone, 400);
  const { playBeep, playSuccess, playError } = useSoundFeedback();
  const { formatCurrency, isRtl } = useThemeConfig();
  const layoutIsRtl = Boolean(
    isRtl ||
    theme.direction === 'rtl' ||
    (typeof document !== 'undefined' && (document.documentElement?.dir === 'rtl' || document.body?.dir === 'rtl'))
  );
  // MUI may invert horizontal drawer anchors in RTL mode.
  // This keeps the cart drawer physically on the right side.
  const cartDrawerAnchor = layoutIsRtl ? 'left' : 'right';
  const activeBranchId = activeShift?.branch_id || activeShift?.branchId || null;
  const assignedWarehouseId = user?.default_warehouse_id || user?.defaultWarehouseId || user?.defaultWarehouse?.id || '';
  const isWarehouseLockedForUser = user?.role === 'cashier' && !!assignedWarehouseId;

  // Calculations (local fallback + server-side pricing preview)
  const localCouponDiscount = round2(couponInfo?.discount_amount || 0);
  const localDiscountedSubtotal = round2(Math.max(0, cartTotal - localCouponDiscount));
  const localTax = round2(localDiscountedSubtotal * (taxRate / 100));
  const localGrandTotal = round2(localDiscountedSubtotal + localTax);

  const effectiveSubtotal = pricingPreview ? round2(pricingPreview.subtotal) : cartTotal;
  const discountAmount = pricingPreview ? round2(pricingPreview.discount) : localCouponDiscount;
  const discountedSubtotal = round2(Math.max(0, effectiveSubtotal - discountAmount));
  const tax = pricingPreview ? round2(pricingPreview.tax) : localTax;
  const grandTotal = pricingPreview ? round2(pricingPreview.total) : localGrandTotal;

  const fetchBranchStockSnapshot = useCallback(async (warehouseRows) => {
    if (!Array.isArray(warehouseRows) || warehouseRows.length === 0) {
      setBranchStockRows([]);
      return;
    }
    const allowedWarehouseIds = new Set(warehouseRows.map((w) => String(w.id)));
    const stockRes = await inventoryAPI.getStock();
    const rows = Array.isArray(stockRes.data?.data) ? stockRes.data.data : [];
    setBranchStockRows(rows.filter((row) => allowedWarehouseIds.has(String(row.warehouseId))));
  }, []);

  const selectedWarehouseName = useMemo(() => {
    const selected = warehouses.find((w) => String(w.id) === String(selectedWarehouseId));
    return selected?.nameAr || selected?.nameEn || 'المخزن المحدد';
  }, [warehouses, selectedWarehouseId]);

  const orderNumberPreview = useMemo(() => {
    const today = new Date();
    const datePart = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const normalizedPrefix = String(orderNumberConfig.prefix || '').trim().replace(/-+$/g, '');
    const parsedStart = parseInt(orderNumberConfig.start, 10);
    const startFrom = Number.isFinite(parsedStart) && parsedStart > 0 ? parsedStart : 1;
    const seq = String(startFrom).padStart(Math.max(4, String(startFrom).length), '0');
    return [normalizedPrefix, datePart, seq].filter(Boolean).join('-');
  }, [orderNumberConfig]);

  const selectedWarehouseAvailableByMenu = useMemo(() => {
    const map = new Map();
    if (!selectedWarehouseId) return map;
    branchStockRows.forEach((row) => {
      if (String(row.warehouseId) !== String(selectedWarehouseId)) return;
      map.set(String(row.menuId), parseFloat(row.available || 0));
    });
    return map;
  }, [branchStockRows, selectedWarehouseId]);

  const alternativeWarehousesByMenu = useMemo(() => {
    const map = new Map();
    const namesById = new Map(warehouses.map((w) => [
      String(w.id),
      w.nameAr || w.nameEn || 'مخزن آخر'
    ]));

    branchStockRows.forEach((row) => {
      const available = parseFloat(row.available || 0);
      if (!(available > 0)) return;

      const rowWarehouseId = String(row.warehouseId || '');
      if (!rowWarehouseId || rowWarehouseId === String(selectedWarehouseId || '')) return;

      const menuId = String(row.menuId);
      const warehouseName = namesById.get(rowWarehouseId);
      if (!warehouseName) return;

      const current = map.get(menuId) || [];
      if (!current.includes(warehouseName)) current.push(warehouseName);
      map.set(menuId, current);
    });

    return map;
  }, [branchStockRows, warehouses, selectedWarehouseId]);

  const visibleMenuItems = useMemo(() => {
    if (!selectedWarehouseId) return menuItems;
    return menuItems.filter((item) => {
      if (!item.track_stock) return true;
      const available = selectedWarehouseAvailableByMenu.get(String(item.id)) || 0;
      return available > 0;
    });
  }, [menuItems, selectedWarehouseAvailableByMenu, selectedWarehouseId]);


  useEffect(() => {
    if (orderType === 'delivery' && deliveryPersonnel.length === 0) {
      deliveryAPI.getPersonnel({ status: 'available', active: 'true' })
        .then(r => setDeliveryPersonnel(r.data.data || []))
        .catch(() => { })
    }
  }, [orderType]);

  // Fetch Data
  useEffect(() => {
    const init = async () => {
      try {
        // Fetch Settings
        const settingsRes = await settingsAPI.getPublic();
        const pubSettings = settingsRes.data?.data || {};
        const configuredTax = Number(pubSettings.taxRate);
        if (Number.isFinite(configuredTax) && configuredTax >= 0) {
          setTaxRate(configuredTax);
        }
        // Store operation modes
        setOperationModes({
          enableDelivery: pubSettings.enableDelivery !== false,
          enableOnlineOrders: pubSettings.enableOnlineOrders !== false,
          autoCompleteOrders: pubSettings.autoCompleteOrders === true,
        });
        setOrderNumberConfig({
          prefix: String(pubSettings.orderNumberPrefix || 'ORD-'),
          start: parseInt(pubSettings.orderNumberStart, 10) > 0 ? parseInt(pubSettings.orderNumberStart, 10) : 1000
        });

        // Fetch Menu & Categories
        if (activeShift) {
          const [menuRes, catRes, priceListRes, warehousesRes] = await Promise.all([
            menuAPI.getAll({ available_only: true }),
            categoryAPI.getAll({ active_only: true }),
            pricingAPI.getPriceLists({ active_only: true, branch_id: activeBranchId }),
            warehouseAPI.getAll({ branch_id: activeBranchId, status: 'active' })]
          );
          dispatch(setMenuItems(menuRes.data.data || []));
          dispatch(setCategories(catRes.data.data || []));
          setPriceLists(priceListRes.data?.data || []);
          const warehouseRows = Array.isArray(warehousesRes.data?.data) ? warehousesRes.data.data : [];
          const activeWarehouses = warehouseRows.filter((w) => w.status === 'active');
          const effectiveWarehouses = isWarehouseLockedForUser ?
            activeWarehouses.filter((w) => String(w.id) === String(assignedWarehouseId)) :
            activeWarehouses;
          setWarehouses(effectiveWarehouses);

          const savedWarehouseId = localStorage.getItem('pos_selected_warehouse_id');
          const resolvedWarehouseId = isWarehouseLockedForUser ?
            String(effectiveWarehouses[0]?.id || '') :
            (effectiveWarehouses.some((w) => String(w.id) === String(savedWarehouseId)) ?
              String(savedWarehouseId) :
              String(effectiveWarehouses.find((w) => w.isDefault)?.id || effectiveWarehouses[0]?.id || ''));

          setSelectedWarehouseId(resolvedWarehouseId);
          if (resolvedWarehouseId) {
            localStorage.setItem('pos_selected_warehouse_id', resolvedWarehouseId);
          } else {
            localStorage.removeItem('pos_selected_warehouse_id');
          }

          await fetchBranchStockSnapshot(effectiveWarehouses);
        } else {
          setWarehouses([]);
          setSelectedWarehouseId('');
          setBranchStockRows([]);
        }
      } catch (error) {
        console.error(error);
        toast.error("حدث خطأ في تحميل البيانات");
      }
    };
    init();
  }, [activeShift, activeBranchId, dispatch, fetchBranchStockSnapshot, isWarehouseLockedForUser, assignedWarehouseId]);

  useEffect(() => {
    if (selectedWarehouseId) {
      localStorage.setItem('pos_selected_warehouse_id', String(selectedWarehouseId));
    } else {
      localStorage.removeItem('pos_selected_warehouse_id');
    }
  }, [selectedWarehouseId]);

  useEffect(() => {
    if (!activeShift || !warehouses.length || !selectedWarehouseId) return;
    fetchBranchStockSnapshot(warehouses).catch(() => {

      // Soft-fail: keep last known snapshot.
    });
  }, [activeShift, warehouses, selectedWarehouseId, fetchBranchStockSnapshot]);

  useEffect(() => {
    const flushQueuedOrders = async () => {
      if (!navigator.onLine) return;
      const queue = offlineQueue.list();
      if (!queue.length) return;

      let synced = 0;
      for (const row of queue) {
        try {
          await orderAPI.create(row.payload);
          offlineQueue.remove(row.id);
          synced += 1;
        } catch (_) {

          // Keep item in queue if sync fails
        }
      }

      setOfflineCount(offlineQueue.count());
      if (synced > 0) {
        toast.success(`تمت مزامنة ${synced} طلب/طلبات من وضع الأوفلاين`);
      }
    };

    flushQueuedOrders();
    window.addEventListener('online', flushQueuedOrders);
    return () => window.removeEventListener('online', flushQueuedOrders);
  }, []);

  useEffect(() => {
    const loadLoyalty = async () => {
      const phone = debouncedCustomerPhone.trim();
      if (phone.length < 6) {
        setLoyaltyInfo(null);
        return;
      }
      try {
        const res = await loyaltyAPI.getByPhone(phone);
        setLoyaltyInfo(res.data?.data || null);
      } catch (_) {
        setLoyaltyInfo(null);
      }
    };
    loadLoyalty();
  }, [debouncedCustomerPhone]);

  useEffect(() => {
    let active = true;

    const runPreview = async () => {
      if (!cartItems.length) {
        if (active) {
          setPricingPreview(null);
          setPricingError('');
          setPricingLoading(false);
        }
        return;
      }

      if (!activeBranchId) return;

      setPricingLoading(true);
      try {
        const payload = {
          branch_id: activeBranchId,
          items: cartItems.map((i) => ({
            menu_id: i.menu_id,
            quantity: i.quantity,
            batch_number: selectedBatches[i.menu_id] || i.batch_number || undefined
          })),
          coupon_code: couponInfo?.code || undefined,
          customer_phone: customerPhone.trim() || undefined,
          redeem_points: redeemPoints ? parseInt(redeemPoints, 10) || 0 : 0,
          price_list_id: selectedPriceListId || undefined
        };

        const res = await pricingAPI.preview(payload);
        if (!active) return;
        setPricingPreview(res.data?.data || null);
        setPricingError('');
      } catch (error) {
        if (!active) return;
        setPricingPreview(null);
        setPricingError(error?.response?.data?.message || 'تعذر حساب معاينة التسعير');
      } finally {
        if (active) setPricingLoading(false);
      }
    };

    const timer = setTimeout(runPreview, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [cartItems, activeBranchId, couponInfo?.code, customerPhone, redeemPoints, selectedPriceListId, selectedBatches]);

  useEffect(() => {
    if (cartItems.length === 0) {
      setCouponInfo(null);
      setCouponCode('');
      setSplitPayment({ cash: '', card: '', online: '' });
      setRedeemPoints('');
      setPricingPreview(null);
      setPricingError('');
      setSelectedBatches({});
    }
  }, [cartItems.length]);

  // Handlers
  const handleWarehouseChange = useCallback((nextWarehouseId) => {
    const normalizedWarehouseId = String(nextWarehouseId || '').trim();
    if (!normalizedWarehouseId) return;

    if (isWarehouseLockedForUser) {
      toast.error('تم تحديد مخزن البيع لهذا المستخدم من الإدارة');
      return;
    }

    if (cartItems.length > 0) {
      toast.error('افرغ السلة قبل تغيير مخزن البيع');
      return;
    }

    setSelectedWarehouseId(normalizedWarehouseId);
    setSelectedBatches({});
    setBatchDialog({ open: false, item: null, batches: [], selectedBatch: '' });
  }, [cartItems.length, isWarehouseLockedForUser]);

  const pushItemToCart = useCallback((item, batchNumber = null) => {
    dispatch(addToCart({
      menu_id: item.id,
      name_ar: item.name_ar,
      price: parseFloat(item.price),
      active_image: item.image_url,
      batch_number: batchNumber || null
    }));
    playBeep();
  }, [dispatch, playBeep]);

  const handleAddToCart = useCallback(async (item) => {
    if (item.track_stock) {
      const availableInSelectedWarehouse = selectedWarehouseAvailableByMenu.get(String(item.id)) || 0;
      if (selectedWarehouseId && !(availableInSelectedWarehouse > 0)) {
        const alternatives = alternativeWarehousesByMenu.get(String(item.id)) || [];
        if (alternatives.length > 0) {
          toast.error(`الصنف غير متوفر في "${selectedWarehouseName}"، ومتوفر في: ${alternatives.join('، ')}`);
        } else {
          toast.error(`الصنف غير متوفر في "${selectedWarehouseName}"`);
        }
        return;
      }

      try {
        const res = await orderAPI.getStockBatches(item.id, selectedWarehouseId ? { warehouse_id: selectedWarehouseId } : {});
        const payload = res.data?.data;
        const batches = Array.isArray(payload) ? payload : Array.isArray(payload?.batches) ? payload.batches : [];
        if (batches.length > 0) {
          const current = selectedBatches[item.id] || batches[0]?.batch_number || '';
          setBatchDialog({
            open: true,
            item,
            batches,
            selectedBatch: current
          });
          return;
        }
      } catch (_) {

        // Continue normal flow if batch fetch fails
      }
    }
    pushItemToCart(item, selectedBatches[item.id] || null);
  }, [
    pushItemToCart,
    selectedBatches,
    selectedWarehouseAvailableByMenu,
    selectedWarehouseId,
    alternativeWarehousesByMenu,
    selectedWarehouseName]);

  const handleBatchConfirm = () => {
    const item = batchDialog.item;
    if (!item) {
      setBatchDialog({ open: false, item: null, batches: [], selectedBatch: '' });
      return;
    }

    const selected = batchDialog.selectedBatch || null;
    if (selected) {
      setSelectedBatches((prev) => ({ ...prev, [item.id]: selected }));
    }

    pushItemToCart(item, selected);
    setBatchDialog({ open: false, item: null, batches: [], selectedBatch: '' });
  };

  const buildClientReference = () => `pos_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const submitOrder = async ({ paymentMethod, paymentBreakdown = null }) => {
    const orderData = {
      order_type: orderType,
      ...(orderType === 'dine_in' && tableNumber ? { table_number: tableNumber } : {}),
      ...(orderType === 'delivery' && deliveryAddress ? { delivery_address: deliveryAddress } : {}),
      ...(orderType === 'delivery' && deliveryFee ? { delivery_fee: parseFloat(deliveryFee) || 0 } : {}),
      ...(orderType === 'delivery' && deliveryPersonnelId ? { delivery_personnel_id: deliveryPersonnelId, delivery_status: 'assigned' } : { delivery_status: orderType === 'delivery' ? 'pending' : undefined }),
      payment_method: paymentMethod,
      payment_status: 'paid',
      items: cartItems.map((i) => ({
        menu_id: i.menu_id,
        quantity: i.quantity,
        batch_number: selectedBatches[i.menu_id] || i.batch_number || undefined
      })),
      client_reference: buildClientReference(),
      ...(couponInfo?.code ? { coupon_code: couponInfo.code } : {}),
      ...(customerPhone.trim() ? { customer_phone: customerPhone.trim() } : {}),
      ...(customerName.trim() ? { customer_name: customerName.trim() } : {}),
      ...(redeemPoints ? { redeem_points: parseInt(redeemPoints, 10) || 0 } : {}),
      ...(selectedPriceListId ? { price_list_id: selectedPriceListId } : {}),
      ...(Array.isArray(paymentBreakdown) ? { payment_breakdown: paymentBreakdown } : {})
    };

    try {
      const res = await orderAPI.create(orderData);
      const createdOrder = res.data.data;
      const wasAutoCompleted = res.data.autoCompleted === true;

      // --- Smart Printing based on settings ---
      try {
        const settingsRes = await fetch('/api/settings/public').then(r => r.json());
        const wf = settingsRes?.data || {};
        const copies = Math.max(1, parseInt(wf.receiptCopies) || 1);
        const shouldPrintKitchen = wf.printKitchenReceipt !== false;

        // Print customer receipt (N copies)
        for (let i = 0; i < copies; i++) {
          printReceipt(createdOrder);
        }

        // Print kitchen order (no prices) if enabled
        if (shouldPrintKitchen) {
          printKitchenOrder(createdOrder);
        }
      } catch (printErr) {
        console.warn('Print settings fetch failed, printing single receipt:', printErr);
        printReceipt(createdOrder);
      }

      playSuccess();
      dispatch(clearCart());
      setCartOpen(false);
      setCouponInfo(null);
      setCouponCode('');
      setRedeemPoints('');
      setSelectedBatches({});
      if (warehouses.length > 0) {
        fetchBranchStockSnapshot(warehouses).catch(() => {

          // Keep UI flow even if stock refresh fails.
        });
      }
      toast.success(wasAutoCompleted ? 'تم إنشاء وإكمال الطلب تلقائياً ✅' : 'تم إنشاء الطلب بنجاح');
      return true;
    } catch (error) {
      // Offline baseline: queue order when network/server is unreachable
      if (!error.response || !navigator.onLine) {
        offlineQueue.enqueue(orderData);
        const queued = offlineQueue.count();
        setOfflineCount(queued);
        playError();
        toast('تم حفظ الطلب محليًا وسيتم مزامنته تلقائيًا');
        return false;
      }
      throw error;
    }
  };

  const handleCheckout = async (paymentMethod) => {
    if (cartItems.length === 0) return toast.error('السلة فارغة');
    if (warehouses.length > 0 && !selectedWarehouseId) return toast.error('يرجى اختيار مخزن البيع أولاً');
    if (pricingLoading) return toast('جارٍ حساب التسعير...');
    if (pricingError) return toast.error(pricingError);
    if (parseInt(redeemPoints || 0, 10) > 0 && !customerPhone.trim()) {
      return toast.error('يجب إدخال رقم العميل لاستخدام نقاط الولاء');
    }

    if (paymentMethod === 'multi') {
      setSplitPayment({
        cash: grandTotal.toFixed(2),
        card: '',
        online: ''
      });
      setSplitDialogOpen(true);
      return;
    }

    setLoading(true);
    try {
      await submitOrder({ paymentMethod });
    } catch (error) {
      playError();
      toast.error(error.response?.data?.message || 'فشل إنشاء الطلب');
    } finally {
      setLoading(false);
    }
  };

  const handleSplitConfirm = async () => {
    const cash = round2(splitPayment.cash || 0);
    const card = round2(splitPayment.card || 0);
    const online = round2(splitPayment.online || 0);
    const sum = round2(cash + card + online);

    if (sum <= 0) {
      return toast.error('يجب إدخال مبلغ دفع أكبر من صفر');
    }
    if (sum !== round2(grandTotal)) {
      return toast.error(`مجموع وسائل الدفع (${formatCurrency(sum)}) يجب أن يساوي الإجمالي (${formatCurrency(grandTotal)})`);
    }

    const paymentBreakdown = [
      ...(cash > 0 ? [{ method: 'cash', amount: cash }] : []),
      ...(card > 0 ? [{ method: 'card', amount: card }] : []),
      ...(online > 0 ? [{ method: 'online', amount: online }] : [])];


    setLoading(true);
    try {
      await submitOrder({
        paymentMethod: 'multi',
        paymentBreakdown
      });
      setSplitDialogOpen(false);
    } catch (error) {
      playError();
      toast.error(error.response?.data?.message || 'فشل إنشاء الطلب');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponInfo(null);
      return;
    }

    setCouponLoading(true);
    try {
      const res = await couponAPI.validate({
        code: couponCode.trim(),
        subtotal: effectiveSubtotal,
        branch_id: activeBranchId
      });
      const data = res.data?.data;
      if (!data) throw new Error('Invalid coupon response');

      setCouponInfo({
        code: data.code,
        discount_amount: round2(data.discount_amount)
      });
      toast.success(`تم تطبيق الكوبون (${data.code})`);
    } catch (error) {
      setCouponInfo(null);
      toast.error(error.response?.data?.message || 'كوبون غير صالح');
    } finally {
      setCouponLoading(false);
    }
  };

  // Loading while checking shift status
  if (!shiftChecked) {
    return (
      <Box sx={{ height: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <CircularProgress size={48} sx={{ mb: 2 }} />
        <Typography variant="h6" color="text.secondary">جاري التحقق من الوردية...</Typography>
      </Box>);

  }

  // Blocking Screen if No Shift
  if (!activeShift) {
    return (
      <Box sx={{ height: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <Typography variant="h2" sx={{ mb: 2 }}>🔒</Typography>
        <Typography variant="h4" fontWeight="bold" gutterBottom>عذرًا، الصندوق مغلق</Typography>
        <Button variant="contained" size="large" onClick={() => dispatch(setShowShiftDialog(true))}>
          فتح وردية جديدة
        </Button>
      </Box>);

  }

  const handleSearchKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    const term = String(searchTerm || '').trim().toLowerCase();
    if (!term) return;

    const exact = visibleMenuItems.find((item) => {
      const inCategory = selectedCategory === 'all' || item.category_id === selectedCategory;
      if (!inCategory) return false;
      const barcode = String(item.barcode || '').trim().toLowerCase();
      const sku = String(item.sku || '').trim().toLowerCase();
      return term === barcode || term === sku;
    });

    if (exact) {
      void handleAddToCart(exact);
      setSearchTerm('');
      return;
    }

    const hiddenExact = menuItems.find((item) => {
      const inCategory = selectedCategory === 'all' || item.category_id === selectedCategory;
      if (!inCategory) return false;
      const barcode = String(item.barcode || '').trim().toLowerCase();
      const sku = String(item.sku || '').trim().toLowerCase();
      return term === barcode || term === sku;
    });

    if (hiddenExact?.track_stock) {
      const alternatives = alternativeWarehousesByMenu.get(String(hiddenExact.id)) || [];
      if (alternatives.length > 0) {
        toast.error(`الصنف غير متوفر في "${selectedWarehouseName}"، ومتوفر في: ${alternatives.join('، ')}`);
      } else {
        toast.error(`الصنف غير متوفر في "${selectedWarehouseName}"`);
      }
    }
  };

  // Filter Logic
  const filteredItems = visibleMenuItems.filter((item) => {
    const matchesCategory = selectedCategory === 'all' || item.category_id === selectedCategory;
    const q = debouncedSearch.toLowerCase().trim();
    if (!q) return matchesCategory;

    const haystacks = [
      item.name_ar,
      item.name_en,
      item.sku,
      item.barcode].

      map((v) => String(v || '').toLowerCase()).
      filter(Boolean);
    const matchesSearch = haystacks.some((v) => v.includes(q));
    return matchesCategory && matchesSearch;
  });

  const cartContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ─── FIXED TOP: Header + Order Type ─── */}
      <Box sx={{ flexShrink: 0, px: 2, pt: 2 }}>

        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
          <Typography variant="h6" fontWeight="bold" sx={{ flexGrow: 1 }}>سلة الطلبات</Typography>
          <IconButton color="error" onClick={() => dispatch(clearCart())} disabled={cartItems.length === 0} size="small">
            <Delete />
          </IconButton>
          {isMobile && <IconButton onClick={() => setCartOpen(false)} size="small"><Close /></IconButton>}
        </Box>

        {/* نوع الطلب */}
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            color={operationModes.enableOnlineOrders ? 'success' : 'warning'}
            label={operationModes.enableOnlineOrders ? 'الطلبات الأونلاين: مفعلة' : 'الطلبات الأونلاين: متوقفة'}
          />
          <Chip size="small" variant="outlined" label={`ترقيم الطلب: ${orderNumberPreview}`} />
        </Box>

        <Box sx={{ mb: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          <ToggleButtonGroup
            value={orderType}
            exclusive
            onChange={(e, v) => { if (v) setOrderType(v) }}
            fullWidth
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                flex: 1,
                minHeight: 52,
                flexDirection: 'column',
                py: 0.75,
                px: 0.5,
                gap: 0.4,
                fontSize: 12,
                border: 'none',
                '&.Mui-selected, &.Mui-selected:hover': { bgcolor: 'primary.main', color: 'white' }
              }
            }}
          >
            <ToggleButton value="takeaway">
              <TakeawayIcon sx={{ fontSize: 18 }} />
              <span>تيك أواي</span>
            </ToggleButton>
            <ToggleButton value="dine_in">
              <DineInIcon sx={{ fontSize: 18 }} />
              <span>صالة</span>
            </ToggleButton>
            {operationModes.enableDelivery && (
              <ToggleButton value="delivery">
                <DeliveryIcon sx={{ fontSize: 18 }} />
                <span>ديليفري</span>
              </ToggleButton>
            )}
          </ToggleButtonGroup>
        </Box>

        {/* Extra fields for dine_in */}
        {orderType === 'dine_in' && (
          <TextField
            fullWidth size="small" label="🪑 رقم الطاولة"
            value={tableNumber}
            onChange={e => setTableNumber(e.target.value)}
            sx={{ mb: 1 }}
          />
        )}

        {/* Extra fields for delivery */}
        {orderType === 'delivery' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1 }}>
            <TextField
              select fullWidth size="small" label="🛵 موظف الديليفري"
              value={deliveryPersonnelId}
              onChange={e => setDeliveryPersonnelId(e.target.value)}
            >
              <MenuItem value="">— بدون تعيين الآن —</MenuItem>
              {deliveryPersonnel.map(r => (
                <MenuItem key={r.id} value={r.id}>{r.name_ar} • {r.phone}</MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth size="small" label="📍 عنوان التوصيل"
              value={deliveryAddress}
              onChange={e => setDeliveryAddress(e.target.value)}
            />
            <TextField
              fullWidth size="small" label="💰 رسوم التوصيل (ر.س)"
              value={deliveryFee} type="number"
              onChange={e => setDeliveryFee(e.target.value)}
            />
          </Box>
        )}
      </Box>

      {/* ─── SCROLLABLE MIDDLE ─── */}
      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', px: 2, pb: 1 }}>

        {/* Cart Items */}
        <Box sx={{
          mb: 1.5,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          p: 1,
          minHeight: 80
        }}>
          {cartItems.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
              <ShoppingCart sx={{ fontSize: 44, opacity: 0.2, mb: 1 }} />
              <Typography variant="body2">السلة فارغة</Typography>
            </Box>
          ) : (
            cartItems.map((item) => (
              <CartItem
                key={item.menu_id}
                item={item}
                onUpdate={(id, qty) => dispatch(updateQuantity({ menu_id: id, quantity: qty }))}
                formatCurrency={formatCurrency}
              />
            ))
          )}
        </Box>

        {offlineCount > 0 && (
          <Alert severity="warning" sx={{ mb: 1 }}>
            يوجد {offlineCount} طلب محفوظ أوفلاين
          </Alert>
        )}

        <TextField fullWidth size="small" label="رقم العميل (اختياري)"
          value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} sx={{ mb: 1 }} />

        <TextField fullWidth size="small" label="اسم العميل (اختياري)"
          value={customerName} onChange={(e) => setCustomerName(e.target.value)} sx={{ mb: 1 }} />

        <TextField select fullWidth size="small" label="قائمة الأسعار"
          value={selectedPriceListId} onChange={(e) => setSelectedPriceListId(e.target.value)} sx={{ mb: 1 }}>
          <MenuItem value="">افتراضي</MenuItem>
          {priceLists.map((list) => <MenuItem key={list.id} value={list.id}>{list.name}</MenuItem>)}
        </TextField>

        {loyaltyInfo?.customer && (
          <Alert severity="info" sx={{ mb: 1 }}>رصيد النقاط: <b>{loyaltyInfo.customer.loyalty_points}</b></Alert>
        )}

        <TextField fullWidth size="small" label="استخدام نقاط الولاء" type="number"
          value={redeemPoints} onChange={(e) => setRedeemPoints(e.target.value)}
          inputProps={{ min: 0, max: loyaltyInfo?.customer?.loyalty_points || undefined }}
          sx={{ mb: 1 }} />

        <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
          <TextField size="small" fullWidth label="كود الكوبون"
            value={couponCode} onChange={(e) => setCouponCode(e.target.value)} />
          <Button variant="outlined" onClick={handleApplyCoupon} disabled={couponLoading || cartItems.length === 0}>
            {couponLoading ? '...' : 'تطبيق'}
          </Button>
        </Box>

        {couponInfo && (
          <Alert severity="success" sx={{ mb: 1 }}
            action={<Button color="inherit" size="small" onClick={() => { setCouponInfo(null); setCouponCode('') }}>إزالة</Button>}>
            كوبون {couponInfo.code} — خصم {formatCurrency(localCouponDiscount)}
          </Alert>
        )}

        {pricingLoading && <Alert severity="info" sx={{ mb: 1 }}>جارٍ احتساب التسعير...</Alert>}
        {pricingError && <Alert severity="error" sx={{ mb: 1 }}>{pricingError}</Alert>}

        {pricingPreview?.applied?.promotions?.length > 0 && (
          <Alert severity="success" sx={{ mb: 1 }}>
            عروض: {pricingPreview.applied.promotions.map((x) => x.name).join(', ')}
          </Alert>
        )}



      </Box>

      {/* ─── FIXED BOTTOM: Summary + Checkout ─── */}
      <Box sx={{ flexShrink: 0, px: 2, pb: 2 }}>
        <CartSummary
          rawSubtotal={effectiveSubtotal}
          discount={discountAmount}
          subtotal={discountedSubtotal}
          tax={tax}
          total={grandTotal}
          taxRate={taxRate}
          onCheckout={handleCheckout}
          loading={loading}
          formatCurrency={formatCurrency}
          compact={isMobile}
        />
      </Box>

    </Box>
  );


  return (
    <Box sx={{ height: { xs: 'calc(100vh - 170px)', md: 'calc(100vh - 80px)' }, display: 'flex', gap: 3 }}>
      {/* Left Side: Menu Grid */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Search & Categories */}
        <Box sx={{ mb: 3 }}>
          <TextField
            select
            fullWidth
            label="مخزن البيع"
            value={selectedWarehouseId}
            onChange={(e) => handleWarehouseChange(e.target.value)}
            disabled={warehouses.length === 0 || isWarehouseLockedForUser}
            sx={{ mb: 2 }}>

            {warehouses.length === 0 ?
              <MenuItem value="" disabled>لا يوجد مخازن نشطة لهذا الفرع</MenuItem> :
              warehouses.map((warehouse) =>
                <MenuItem key={warehouse.id} value={warehouse.id}>
                  {warehouse.nameAr}{warehouse.isDefault ? ' (افتراضي)' : ''}
                </MenuItem>
              )
            }
          </TextField>

          {selectedWarehouseId &&
            <Alert severity="info" sx={{ mb: 2 }}>
              مخزن البيع الحالي: <b>{selectedWarehouseName}</b>
              {isWarehouseLockedForUser ? ' (محدد من الإدارة)' : ''}
            </Alert>
          }

          <TextField
            fullWidth
            placeholder="ابحث بالاسم / الباركود / SKU"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            InputProps={{
              startAdornment: <InputAdornment position="start"><Search /></InputAdornment>,
              sx: { borderRadius: 3, bgcolor: 'background.paper' }
            }}
            sx={{ mb: 2 }} />

          <CategoryTabs categories={categories} selected={selectedCategory} onSelect={setSelectedCategory} />
        </Box>

        {/* Items Grid */}
        <Box sx={{ flexGrow: 1, overflowY: 'auto', pb: 10 }}>
          {filteredItems.length === 0 ?
            <Alert severity="warning">
              لا توجد أصناف متاحة في المخزن المحدد حاليًا.
            </Alert> :
            <Grid container spacing={2}>
              {filteredItems.map((item) =>
                <Grid item xs={6} sm={4} md={3} lg={3} xl={2} key={item.id}>
                  <ProductCard item={item} onClick={handleAddToCart} formatCurrency={formatCurrency} />
                </Grid>
              )}
            </Grid>
          }
        </Box>
      </Box>

      {/* Right Side: Cart (Desktop) */}
      {!isMobile && (
        <Paper
          elevation={0}
          sx={{
            width: { xs: '100%', sm: 400, md: 400, lg: 420 },
            flexShrink: 0,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 3,
            bgcolor: 'background.paper',
            overflow: 'hidden'
          }}>
          {cartContent}
        </Paper>
      )}

      {/* Mobile Cart Drawer */}
      <Drawer
        anchor={cartDrawerAnchor}
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        ModalProps={{ keepMounted: true }}
        PaperProps={{ sx: { width: 'min(92vw, 480px)' } }}>

        {cartContent}
      </Drawer>

      <Dialog
        open={batchDialog.open}
        onClose={() => setBatchDialog({ open: false, item: null, batches: [], selectedBatch: '' })}
        fullWidth
        maxWidth="sm">

        <DialogTitle>اختيار الدفعة</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            اختر الدفعة للعنصر: <b>{batchDialog.item?.name_ar}</b>
          </Typography>
          <TextField
            select
            fullWidth
            value={batchDialog.selectedBatch}
            onChange={(e) => setBatchDialog((prev) => ({ ...prev, selectedBatch: e.target.value }))}
            label="Batch Number">

            {batchDialog.batches.map((b) =>
              <MenuItem key={`${b.movement_id}-${b.batch_number || 'none'}`} value={b.batch_number || ''}>
                {b.batch_number || 'No Batch'} - Qty: {b.remaining_quantity}
                {b.expiry_date ? ` - Exp: ${b.expiry_date}` : ''}
              </MenuItem>
            )}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBatchDialog({ open: false, item: null, batches: [], selectedBatch: '' })}>
            إلغاء
          </Button>
          <Button variant="contained" onClick={handleBatchConfirm}>
            تأكيد
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={splitDialogOpen} onClose={() => setSplitDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>الدفع المتعدد</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            الإجمالي المطلوب: <b>{formatCurrency(grandTotal)}</b>
          </Typography>
          <TextField
            fullWidth
            margin="dense"
            label="نقدي"
            type="number"
            value={splitPayment.cash}
            onChange={(e) => setSplitPayment((prev) => ({ ...prev, cash: e.target.value }))} />

          <TextField
            fullWidth
            margin="dense"
            label="بطاقة"
            type="number"
            value={splitPayment.card}
            onChange={(e) => setSplitPayment((prev) => ({ ...prev, card: e.target.value }))} />

          <TextField
            fullWidth
            margin="dense"
            label="أونلاين"
            type="number"
            value={splitPayment.online}
            onChange={(e) => setSplitPayment((prev) => ({ ...prev, online: e.target.value }))} />

          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            المجموع الحالي: {formatCurrency(round2(splitPayment.cash || 0) + round2(splitPayment.card || 0) + round2(splitPayment.online || 0))}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSplitDialogOpen(false)}>إلغاء</Button>
          <Button variant="contained" onClick={handleSplitConfirm} disabled={loading}>
            تأكيد الدفع
          </Button>
        </DialogActions>
      </Dialog>

      {/* Mobile Fab */}
      {isMobile && !cartOpen &&
        <Fab
          color="primary"
          sx={{
            position: 'fixed',
            bottom: { xs: 104, sm: 92 },
            insetInlineEnd: 16
          }}
          onClick={() => setCartOpen(true)}>

          <Badge badgeContent={cartItems.reduce((a, b) => a + b.quantity, 0)} color="error">
            <ShoppingCart />
          </Badge>
        </Fab>
      }
    </Box>);

}

