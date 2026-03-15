import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  IconButton,
  Paper,
  Snackbar,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  MenuItem,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add,
  AddCircleOutline,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ExpandLess,
  ExpandMore,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  Refresh,
  Save as SaveIcon,
  ToggleOff,
  ToggleOn,
  AccountTree as TreeIcon,
} from '@mui/icons-material';
import { accountingAPI } from '../services/api';
import { useTranslation } from '../contexts/ThemeContext';

const ROOT_TYPE_LABELS = {
  asset: 'أصول',
  liability: 'خصوم',
  equity: 'حقوق ملكية',
  income: 'إيرادات',
  expense: 'مصروفات',
};

const ROOT_TYPE_COLORS = {
  asset: '#1976d2',
  liability: '#d32f2f',
  equity: '#7b1fa2',
  income: '#2e7d32',
  expense: '#e65100',
};

const NORMAL_BALANCE_LABELS = {
  debit: 'مدين',
  credit: 'دائن',
};

const DEFAULT_BANKS = [
  { code: '1002-01', name_ar: 'بنك CIB', name_en: 'CIB Bank' },
  { code: '1002-02', name_ar: 'البنك الأهلي', name_en: 'National Bank' },
  { code: '1002-03', name_ar: 'بنك الراجحي', name_en: 'Al Rajhi Bank' },
  { code: '1002-04', name_ar: 'بنك القاهرة', name_en: 'Bank of Cairo' },
];

const EMPTY_FORM = {
  id: null,
  original_parent_id: null,
  parent_id: null,
  code: '',
  name_ar: '',
  name_en: '',
  root_type: 'asset',
  normal_balance: 'debit',
  account_type: '',
  is_group: false,
};

const asGroup = (account) =>
  account?.is_group === true ||
  account?.is_group === 1 ||
  String(account?.is_group).toLowerCase() === 'true';

const buildTree = (items) => {
  const nodeMap = {};
  const roots = [];

  for (const item of items) {
    nodeMap[item.id] = { ...item, _children: [] };
  }

  for (const item of items) {
    if (item.parent_id && nodeMap[item.parent_id]) {
      nodeMap[item.parent_id]._children.push(nodeMap[item.id]);
    } else {
      roots.push(nodeMap[item.id]);
    }
  }

  const byCode = (a, b) => (a.code || '').localeCompare(b.code || '');
  roots.sort(byCode);
  Object.values(nodeMap).forEach((node) => node._children.sort(byCode));

  return roots;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const accountLabel = (account, isArabic) =>
  `${account.code || '-'} - ${isArabic ? account.name_ar || account.name_en || '' : account.name_en || account.name_ar || ''}`;
const shouldAutoRenumberWithParent = (currentCode, parentCode) =>
  String(currentCode || '').includes('-') || String(parentCode || '').includes('-');

const COAManager = () => {
  const { language } = useTranslation();
  const isArabic = language === 'ar';

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quickAdding, setQuickAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [error, setError] = useState('');
  const [snack, setSnack] = useState({
    open: false,
    severity: 'success',
    message: '',
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mode, setMode] = useState('edit');
  const [form, setForm] = useState(EMPTY_FORM);

  const toast = useCallback((severity, message) => {
    setSnack({ open: true, severity, message });
  }, []);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await accountingAPI.getCOAFlat({ includeInactive: true });
      if (response?.data?.success) {
        setAccounts(response.data.data || []);
      } else {
        setError('فشل تحميل شجرة الحسابات');
      }
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'حدث خطأ أثناء تحميل الحسابات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((account) => {
      if (!showInactive && account.is_active === false) return false;
      if (!q) return true;
      return (
        (account.code || '').toLowerCase().includes(q) ||
        (account.name_ar || '').toLowerCase().includes(q) ||
        (account.name_en || '').toLowerCase().includes(q)
      );
    });
  }, [accounts, search, showInactive]);

  const tree = useMemo(() => buildTree(filteredAccounts), [filteredAccounts]);

  const bankHeader = useMemo(
    () => accounts.find((account) => account.code === '1002') || null,
    [accounts]
  );

  useEffect(() => {
    if (!tree.length || Object.keys(expanded).length) return;
    const defaults = {};
    tree.forEach((root) => {
      defaults[root.id] = true;
    });
    setExpanded(defaults);
  }, [tree, expanded]);

  const stats = useMemo(
    () => ({
      total: accounts.length,
      groups: accounts.filter((account) => asGroup(account)).length,
      posting: accounts.filter((account) => !asGroup(account)).length,
      inactive: accounts.filter((account) => account.is_active === false).length,
    }),
    [accounts]
  );

  const descendantsByParent = useMemo(() => {
    const childrenMap = new Map();
    for (const account of accounts) {
      const parentId = account.parent_id || null;
      if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
      childrenMap.get(parentId).push(account.id);
    }

    const isDescendant = (targetId, maybeDescendantId) => {
      const queue = [...(childrenMap.get(targetId) || [])];
      const seen = new Set();
      while (queue.length) {
        const current = queue.shift();
        if (!current || seen.has(current)) continue;
        seen.add(current);
        if (current === maybeDescendantId) return true;
        const children = childrenMap.get(current) || [];
        queue.push(...children);
      }
      return false;
    };

    return { isDescendant };
  }, [accounts]);

  const availableParents = useMemo(() => {
    if (!form.id) return accounts;
    return accounts.filter((candidate) => {
      if (candidate.id === form.id) return false;
      if (descendantsByParent.isDescendant(form.id, candidate.id)) return false;
      return true;
    });
  }, [accounts, descendantsByParent, form.id]);

  const suggestChildCode = useCallback(
    (parentCode, excludeId = null) => {
      const regex = new RegExp(`^${escapeRegex(parentCode || '')}-(\\d+)$`);
      const maxSuffix =
        accounts.reduce((max, account) => {
          if (excludeId && account.id === excludeId) return max;
          const match = (account.code || '').match(regex);
          return match ? Math.max(max, parseInt(match[1], 10) || 0) : max;
        }, 0) + 1;
      return `${parentCode}-${String(maxSuffix).padStart(2, '0')}`;
    },
    [accounts]
  );

  const openEdit = (account) => {
    setMode('edit');
    setForm({
      id: account.id,
      original_parent_id: account.parent_id || null,
      parent_id: account.parent_id || null,
      code: account.code || '',
      name_ar: account.name_ar || '',
      name_en: account.name_en || '',
      root_type: account.root_type || 'asset',
      normal_balance: account.normal_balance || 'debit',
      account_type: account.account_type || '',
      is_group: asGroup(account),
    });
    setDialogOpen(true);
  };

  const openAddChild = (parent) => {
    const nextCode = suggestChildCode(parent.code, null);

    setMode('add');
    setForm({
      ...EMPTY_FORM,
      original_parent_id: parent.id,
      parent_id: parent.id,
      code: nextCode,
      root_type: parent.root_type,
      normal_balance: parent.normal_balance,
      account_type: parent.account_type,
    });
    setDialogOpen(true);
  };

  const saveForm = async () => {
    const requestedCode = form.code.trim();
    const nameAr = form.name_ar.trim();
    const nameEn = form.name_en.trim();

    if (!requestedCode || !nameAr || !nameEn) {
      toast('error', 'الكود والاسم العربي والاسم الإنجليزي حقول مطلوبة');
      return;
    }

    if (form.id && form.parent_id === form.id) {
      toast('error', 'لا يمكن جعل الحساب أبًا لنفسه');
      return;
    }

    if (form.id && form.parent_id && descendantsByParent.isDescendant(form.id, form.parent_id)) {
      toast('error', 'لا يمكن ربط الحساب تحت أحد أبنائه (حلقة في الشجرة)');
      return;
    }

    const selectedParent = form.parent_id
      ? accounts.find((account) => account.id === form.parent_id)
      : null;

    if (selectedParent && selectedParent.root_type !== form.root_type) {
      toast(
        'error',
        `نوع الأب (${ROOT_TYPE_LABELS[selectedParent.root_type] || selectedParent.root_type}) يجب أن يطابق نوع الحساب (${ROOT_TYPE_LABELS[form.root_type] || form.root_type})`
      );
      return;
    }

    const parentChanged =
      mode === 'add' ||
      (form.original_parent_id || null) !== (form.parent_id || null);

    const autoRenumber =
      selectedParent &&
      parentChanged &&
      shouldAutoRenumberWithParent(requestedCode, selectedParent.code);

    const code = autoRenumber ? suggestChildCode(selectedParent.code, form.id) : requestedCode;

    if (accounts.some((account) => account.code === code && account.id !== form.id)) {
      toast('error', `كود الحساب "${code}" موجود مسبقًا`);
      return;
    }

    setSaving(true);
    try {
      if (selectedParent && !asGroup(selectedParent)) {
        await accountingAPI.updateCOAAccount(selectedParent.id, { is_group: true });
      }

      if (mode === 'add') {
        await accountingAPI.createCOAAccount({
          ...form,
          original_parent_id: undefined,
          code,
          name_ar: nameAr,
          name_en: nameEn,
          is_active: true,
        });
        toast('success', 'تم إنشاء الحساب بنجاح');
      } else {
        await accountingAPI.updateCOAAccount(form.id, {
          ...form,
          original_parent_id: undefined,
          code,
          name_ar: nameAr,
          name_en: nameEn,
        });
        if (code !== requestedCode) {
          toast('success', `تم تحديث الحساب بنجاح بكود جديد: ${code}`);
        } else {
          toast('success', 'تم تحديث الحساب بنجاح');
        }
      }

      setDialogOpen(false);
      setForm(EMPTY_FORM);
      await loadAccounts();
    } catch (err) {
      toast('error', err?.response?.data?.error || err?.message || 'فشل حفظ الحساب');
    } finally {
      setSaving(false);
    }
  };

  const setAccountStatus = async (account, active) => {
    try {
      await accountingAPI.setCOAAccountStatus(account.id, active);
      await loadAccounts();
      toast('success', active ? 'تم تفعيل الحساب' : 'تم تعطيل الحساب');
    } catch (err) {
      toast('error', err?.response?.data?.error || 'فشل تحديث حالة الحساب');
    }
  };

  const createDefaultBanks = async () => {
    if (!bankHeader) {
      toast('error', 'لم يتم العثور على حساب البنوك (1002)');
      return;
    }

    setQuickAdding(true);
    let created = 0;
    let skipped = 0;

    try {
      for (const bank of DEFAULT_BANKS) {
        if (accounts.some((account) => account.code === bank.code)) {
          skipped += 1;
          continue;
        }

        await accountingAPI.createCOAAccount({
          ...bank,
          parent_id: bankHeader.id,
          root_type: bankHeader.root_type,
          normal_balance: bankHeader.normal_balance,
          account_type: bankHeader.account_type,
          is_group: false,
          is_active: true,
        });
        created += 1;
      }

      await loadAccounts();
      toast('success', `تمت إضافة ${created} بنك، وتخطي ${skipped} موجود مسبقًا`);
    } catch (err) {
      toast('error', err?.response?.data?.error || err?.message || 'فشل إضافة البنوك');
    } finally {
      setQuickAdding(false);
    }
  };

  const renderRows = (nodes, level = 0) =>
    nodes.map((account) => {
      const children = account._children || [];
      const hasChildren = children.length > 0 || asGroup(account);
      const isOpen = expanded[account.id] === true;

      return (
        <React.Fragment key={account.id}>
          <TableRow hover sx={{ opacity: account.is_active === false ? 0.55 : 1 }}>
            <TableCell sx={{ pl: 2 + level * 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {hasChildren ? (
                  <IconButton
                    size="small"
                    onClick={() => setExpanded((prev) => ({ ...prev, [account.id]: !prev[account.id] }))}
                  >
                    {isOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                  </IconButton>
                ) : (
                  <Box sx={{ width: 28 }} />
                )}
                {hasChildren ? isOpen ? <FolderOpenIcon fontSize="small" color="primary" /> : <FolderIcon fontSize="small" /> : null}
                <Chip size="small" label={account.code} variant="outlined" />
              </Box>
            </TableCell>

            <TableCell>{isArabic ? account.name_ar || account.name_en : account.name_en || account.name_ar}</TableCell>
            <TableCell>
              <Chip
                size="small"
                label={ROOT_TYPE_LABELS[account.root_type] || account.root_type}
                sx={{ bgcolor: ROOT_TYPE_COLORS[account.root_type] || 'grey.600', color: '#fff' }}
              />
            </TableCell>
            <TableCell>
              <Chip
                size="small"
                variant="outlined"
                color={account.normal_balance === 'debit' ? 'success' : 'error'}
                label={NORMAL_BALANCE_LABELS[account.normal_balance] || account.normal_balance}
              />
            </TableCell>
            <TableCell align="center">
              <Chip
                size="small"
                label={
                  children.length
                    ? `${asGroup(account) ? 'مجموعة' : 'فرعي'} (${children.length})`
                    : asGroup(account)
                    ? 'مجموعة'
                    : 'ترحيل'
                }
              />
            </TableCell>
            <TableCell>
              <Chip
                size="small"
                color={account.is_active === false ? 'default' : 'success'}
                label={account.is_active === false ? 'معطل' : 'نشط'}
              />
            </TableCell>
            <TableCell align="center">
              <Tooltip title="إضافة حساب فرعي">
                <IconButton size="small" color="primary" onClick={() => openAddChild(account)}>
                  <AddCircleOutline fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="تعديل الحساب">
                <IconButton size="small" onClick={() => openEdit(account)}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="تعطيل الحساب">
                <span>
                  <IconButton
                    size="small"
                    color="warning"
                    disabled={account.is_active === false}
                    onClick={() => setAccountStatus(account, false)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={account.is_active === false ? 'تفعيل الحساب' : 'تعطيل الحساب'}>
                <IconButton
                  size="small"
                  onClick={() => setAccountStatus(account, account.is_active === false)}
                >
                  {account.is_active === false ? <ToggleOff fontSize="small" /> : <ToggleOn color="success" fontSize="small" />}
                </IconButton>
              </Tooltip>
            </TableCell>
          </TableRow>
          {isOpen ? renderRows(children, level + 1) : null}
        </React.Fragment>
      );
    });

  if (loading) {
    return (
      <Box sx={{ minHeight: 380, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 } }}>
      <Box
        sx={{
          mb: 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <TreeIcon color="primary" />
          <Typography variant="h4" fontWeight="bold">
            شجرة الحسابات
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<Refresh />} onClick={loadAccounts}>
          تحديث
        </Button>
      </Box>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              size="small"
              placeholder="بحث بالكود أو الاسم"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Grid>

          <Grid item xs={12} md={2}>
            <FormControlLabel
              control={
                <Switch checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              }
              label={`المعطلة (${stats.inactive})`}
            />
          </Grid>

          <Grid item xs={12} md={4}>
            <Typography variant="body2">
              {stats.total} حساب - {stats.groups} مجموعة - {stats.posting} ترحيل
            </Typography>
          </Grid>

          <Grid item xs={12} md={3}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={quickAdding ? <CircularProgress size={14} /> : <Add />}
              onClick={createDefaultBanks}
              disabled={quickAdding}
            >
              إضافة البنوك الافتراضية
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>الكود</TableCell>
              <TableCell>الاسم</TableCell>
              <TableCell>النوع</TableCell>
              <TableCell>الطبيعة</TableCell>
              <TableCell align="center">الفئة</TableCell>
              <TableCell>الحالة</TableCell>
              <TableCell align="center">إجراءات</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tree.length ? (
              renderRows(tree)
            ) : (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  لا توجد حسابات
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={() => !saving && setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{mode === 'add' ? 'إضافة حساب فرعي' : 'تعديل حساب'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                size="small"
                label="الكود"
                value={form.code}
                onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                size="small"
                label="الاسم العربي"
                value={form.name_ar}
                onChange={(e) => setForm((prev) => ({ ...prev, name_ar: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                size="small"
                label="English Name"
                value={form.name_en}
                onChange={(e) => setForm((prev) => ({ ...prev, name_en: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                select
                fullWidth
                size="small"
                label="الحساب الأب (اختياري)"
                value={form.parent_id || ''}
                onChange={(e) => {
                  const nextParentId = e.target.value || null;
                  const parent = nextParentId
                    ? accounts.find((account) => account.id === nextParentId)
                    : null;
                  setForm((prev) => ({
                    ...prev,
                    parent_id: nextParentId,
                    code:
                      parent && shouldAutoRenumberWithParent(prev.code, parent.code)
                        ? suggestChildCode(parent.code, form.id)
                        : prev.code,
                    root_type: parent?.root_type || prev.root_type,
                    normal_balance: parent?.normal_balance || prev.normal_balance,
                    account_type: parent?.account_type || prev.account_type,
                  }));
                }}
              >
                <MenuItem value="">بدون أب (حساب جذري)</MenuItem>
                {availableParents.map((candidate) => (
                  <MenuItem key={candidate.id} value={candidate.id}>
                    {accountLabel(candidate, isArabic)}
                    {!asGroup(candidate) ? ' (سيتم تحويله إلى مجموعة)' : ''}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                size="small"
                label="نوع الحساب"
                value={ROOT_TYPE_LABELS[form.root_type] || form.root_type}
                disabled
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                size="small"
                label="الطبيعة"
                value={NORMAL_BALANCE_LABELS[form.normal_balance] || form.normal_balance}
                disabled
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControlLabel
                control={
                  <Switch
                    checked={form.is_group}
                    onChange={(e) => setForm((prev) => ({ ...prev, is_group: e.target.checked }))}
                  />
                }
                label={form.is_group ? 'مجموعة' : 'ترحيل'}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>إلغاء</Button>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
            onClick={saveForm}
            disabled={saving}
          >
            حفظ
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
        <Alert
          severity={snack.severity}
          variant="filled"
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default COAManager;
