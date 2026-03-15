const fs = require('fs');
let c = fs.readFileSync('c:/Users/activ/Desktop/pos/pos/src/pages/PurchaseReceipts.jsx', 'utf8');

c = c.replace(
    "import { purchaseAPI, warehouseAPI, inventoryAPI, supplierAPI, categoryAPI } from '../services/api'",
    "import { purchaseAPI, warehouseAPI, inventoryAPI, supplierAPI, categoryAPI, expenseAPI } from '../services/api'\n\nconst PAYMENT_METHODS = [\n    { value: 'credit', label: 'آجل (حساب المورد)' },\n    { value: 'cash', label: 'نقدي' },\n    { value: 'bank_transfer', label: 'تحويل بنكي' },\n    { value: 'check', label: 'شيك' },\n    { value: 'card', label: 'بطاقة' }\n]"
);

const formInit = `    const { control, register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({
        defaultValues: {
            items: [{ menu_id: '', quantity: 1, unit_cost: 0 }]
        }
    })`;

const newFormInit = `    const [paymentAccounts, setPaymentAccounts] = useState([])
    const [loadingPaymentAccounts, setLoadingPaymentAccounts] = useState(false)

    const { control, register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({
        defaultValues: {
            items: [{ menu_id: '', quantity: 1, unit_cost: 0 }],
            payment_method: 'credit',
            payment_account_code: ''
        }
    })
    
    const watchPaymentMethod = watch('payment_method')

    const fetchPaymentAccounts = useCallback(async (method) => {
        if (!method || method === 'credit') {
            setPaymentAccounts([])
            return
        }
        try {
            setLoadingPaymentAccounts(true)
            const response = await expenseAPI.getPaymentAccounts(method)
            setPaymentAccounts(response.data.data || [])
            if (response.data.data?.length === 1) {
                setValue('payment_account_code', response.data.data[0].code)
            } else if (response.data.data?.length > 0) {
                setValue('payment_account_code', '')
            }
        } catch (err) {
            console.error('Failed to fetch payment accounts:', err)
        } finally {
            setLoadingPaymentAccounts(false)
        }
    }, [setValue])

    useEffect(() => {
        fetchPaymentAccounts(watchPaymentMethod)
    }, [watchPaymentMethod, fetchPaymentAccounts])`

c = c.replace(formInit, newFormInit);

const jsxTarget = `<Controller
                                    name="warehouse_id"
                                    control={control}
                                    rules={{ required: 'Warehouse is required' }}
                                    render={({ field }) => (`

const jsxReplacement = `<Controller
                                    name="payment_method"
                                    control={control}
                                    render={({ field }) => (
                                        <TextField
                                            {...field}
                                            select
                                            label="طريقة الدفع"
                                            fullWidth
                                            sx={{ mb: 2 }}
                                        >
                                            {PAYMENT_METHODS.map(m => (
                                                <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                                            ))}
                                        </TextField>
                                    )}
                                />
                                {watchPaymentMethod !== 'credit' && (
                                    <Controller
                                        name="payment_account_code"
                                        control={control}
                                        rules={{ required: 'حساب الدفع مطلوب' }}
                                        render={({ field }) => (
                                            <TextField
                                                {...field}
                                                select
                                                label="حساب الدفع"
                                                fullWidth
                                                required
                                                disabled={loadingPaymentAccounts}
                                                error={!!errors.payment_account_code}
                                                helperText={errors.payment_account_code?.message}
                                            >
                                                {loadingPaymentAccounts ? (
                                                    <MenuItem disabled>جاري التحميل...</MenuItem>
                                                ) : paymentAccounts.length === 0 ? (
                                                    <MenuItem disabled>لا يوجد حسابات متاحة</MenuItem>
                                                ) : (
                                                    paymentAccounts.map(acc => (
                                                        <MenuItem key={acc.code} value={acc.code}>
                                                            {acc.name_ar} {acc.balance ? \`(\${parseFloat(acc.balance).toFixed(2)})\` : ''}
                                                        </MenuItem>
                                                    ))
                                                )}
                                            </TextField>
                                        )}
                                    />
                                )}
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Controller
                                    name="warehouse_id"
                                    control={control}
                                    rules={{ required: 'Warehouse is required' }}
                                    render={({ field }) => (`

c = c.replace(jsxTarget, jsxReplacement);

fs.writeFileSync('c:/Users/activ/Desktop/pos/pos/src/pages/PurchaseReceipts.jsx', c);
console.log('JSX replacement done.');
