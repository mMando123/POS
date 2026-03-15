const fs = require('fs');

let c = fs.readFileSync('c:/Users/activ/Desktop/pos/pos/src/pages/Suppliers.jsx', 'utf8');

// Add expenseAPI import
if (!c.includes('expenseAPI')) {
    c = c.replace(
        "import { supplierAPI, purchaseOrderAPI, warehouseAPI, inventoryAPI, categoryAPI, accountingAPI } from '../services/api'",
        "import { supplierAPI, purchaseOrderAPI, warehouseAPI, inventoryAPI, categoryAPI, accountingAPI, expenseAPI } from '../services/api'"
    );
    // If it's a different import string, let's just do a generic replace:
    c = c.replace(
        "import { expenseAPI }", "" // just in case
    );
    c = c.replace(
        "import { supplierAPI } from '../services/api'",
        "import { supplierAPI, expenseAPI } from '../services/api'"
    );
}

// Ensure expenseAPI is imported if previous attempt failed
if (!c.includes('expenseAPI')) {
    c = c.replace("from '../services/api'", ", expenseAPI } from '../services/api'");
}

// Add state for payment accounts
const stateSearch = `    const [deleteConfirm, setDeleteConfirm] = useState(null)
    const [paymentDialog, setPaymentDialog] = useState(null)`;
const stateReplace = `    const [deleteConfirm, setDeleteConfirm] = useState(null)
    const [paymentDialog, setPaymentDialog] = useState(null)
    
    // Payment Accounts
    const [paymentAccounts, setPaymentAccounts] = useState([])
    const [loadingPaymentAccounts, setLoadingPaymentAccounts] = useState(false)
`;

c = c.replace(stateSearch, stateReplace);

// Add fetch inside the component
const fetchSearch = `    const { control: paymentControl, handleSubmit: handlePaymentSubmit, reset: resetPayment, formState: { errors: paymentErrors } } = useForm({
        defaultValues: {
            amount: '',
            payment_method: 'cash',
            reference: '',
            notes: '',
            payment_date: new Date().toISOString().split('T')[0]
        }
    })`;

const fetchReplace = `    const { control: paymentControl, handleSubmit: handlePaymentSubmit, reset: resetPayment, watch: watchPayment, setValue: setPaymentValue, formState: { errors: paymentErrors } } = useForm({
        defaultValues: {
            amount: '',
            payment_method: 'cash',
            payment_account_code: '',
            reference: '',
            notes: '',
            payment_date: new Date().toISOString().split('T')[0]
        }
    })

    const watchPaymentMethod = watchPayment('payment_method')

    const fetchPaymentAccounts = useCallback(async (method) => {
        if (!method) {
            setPaymentAccounts([])
            return
        }
        try {
            setLoadingPaymentAccounts(true)
            const response = await expenseAPI.getPaymentAccounts(method)
            setPaymentAccounts(response.data.data || [])
            if (response.data.data?.length === 1) {
                setPaymentValue('payment_account_code', response.data.data[0].code)
            } else if (response.data.data?.length > 0) {
                setPaymentValue('payment_account_code', '')
            }
        } catch (err) {
            console.error('Failed to fetch payment accounts:', err)
        } finally {
            setLoadingPaymentAccounts(false)
        }
    }, [setPaymentValue])

    useEffect(() => {
        if (paymentDialog) {
            fetchPaymentAccounts(watchPaymentMethod)
        }
    }, [watchPaymentMethod, paymentDialog, fetchPaymentAccounts])`;

c = c.replace(fetchSearch, fetchReplace);

// Default value on reset payment dialog
c = c.replace(`resetPayment({
                                                        amount: '',
                                                        payment_method: 'cash',
                                                        reference: '',
                                                        notes: '',
                                                        payment_date: new Date().toISOString().split('T')[0]
                                                    })`, `resetPayment({
                                                        amount: '',
                                                        payment_method: 'cash',
                                                        payment_account_code: '',
                                                        reference: '',
                                                        notes: '',
                                                        payment_date: new Date().toISOString().split('T')[0]
                                                    })`);

// Display in JSX
const jsxSearch = `                            <Controller
                                name="payment_method"
                                control={paymentControl}
                                rules={{ required: true }}
                                render={({ field }) => (
                                    <TextField {...field} select label="طريقة الدفع" fullWidth>
                                        <MenuItem value="cash">نقدي (Cash)</MenuItem>
                                        <MenuItem value="bank_transfer">تحويل بنكي</MenuItem>
                                        <MenuItem value="check">شيك</MenuItem>
                                        <MenuItem value="card">بطاقة</MenuItem>
                                    </TextField>
                                )}
                            />`;

const jsxReplace = `                            <Controller
                                name="payment_method"
                                control={paymentControl}
                                rules={{ required: true }}
                                render={({ field }) => (
                                    <TextField {...field} select label="طريقة الدفع" fullWidth>
                                        <MenuItem value="cash">نقدي (Cash)</MenuItem>
                                        <MenuItem value="bank_transfer">تحويل بنكي</MenuItem>
                                        <MenuItem value="check">شيك</MenuItem>
                                        <MenuItem value="card">بطاقة</MenuItem>
                                    </TextField>
                                )}
                            />
                            <Controller
                                name="payment_account_code"
                                control={paymentControl}
                                rules={{ required: 'حساب الدفع مطلوب' }}
                                render={({ field }) => (
                                    <TextField
                                        {...field}
                                        select
                                        label="حساب الدفع"
                                        fullWidth
                                        required
                                        disabled={loadingPaymentAccounts}
                                        error={!!paymentErrors.payment_account_code}
                                        helperText={paymentErrors.payment_account_code?.message}
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
                            />`;

c = c.replace(jsxSearch, jsxReplace);

fs.writeFileSync('c:/Users/activ/Desktop/pos/pos/src/pages/Suppliers.jsx', c);
console.log("Suppliers.jsx patched.");
