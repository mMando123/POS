const fs = require('fs');
let c = fs.readFileSync('c:/Users/activ/Desktop/pos/pos/src/pages/Suppliers.jsx', 'utf8');

// 1. Hook update using regex
const formRegex = /const\s+\{\s*control:\s*paymentControl,\s*handleSubmit:\s*handlePaymentSubmit,\s*reset:\s*resetPayment,\s*formState:\s*\{\s*errors:\s*paymentErrors\s*\}\s*\}\s*=\s*useForm\(\{\s*defaultValues:\s*\{\s*amount:\s*'',\s*payment_method:\s*'cash',\s*reference:\s*'',\s*notes:\s*'',\s*payment_date:\s*new\s*Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]\s*\}\s*\}\)/;

const useFormNew = `const {
        control: paymentControl,
        handleSubmit: handlePaymentSubmit,
        reset: resetPayment,
        watch: watchPayment,
        setValue: setPaymentValue,
        formState: { errors: paymentErrors }
    } = useForm({
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

if (formRegex.test(c)) {
    c = c.replace(formRegex, useFormNew);
    console.log('Hook updated with regex');
} else {
    console.log('Hook regex failed');
}

// 2. resetPayment update
const resetRegex = /resetPayment\(\{\s*amount:\s*'',\s*payment_method:\s*'cash',\s*reference:\s*'',\s*notes:\s*'',\s*payment_date:\s*new\s*Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]\s*\}\)/;
const resetNew = `resetPayment({
                                                        amount: '',
                                                        payment_method: 'cash',
                                                        payment_account_code: '',
                                                        reference: '',
                                                        notes: '',
                                                        payment_date: new Date().toISOString().split('T')[0]
                                                    })`;
if (resetRegex.test(c)) {
    c = c.replace(resetRegex, resetNew);
    console.log('Reset updated with regex');
} else {
    console.log('Reset regex failed');
}

// 3. JSX update
const jsxRegex = /<Controller\s+name="payment_method"\s+control=\{paymentControl\}\s+rules=\{\{\s*required:\s*true\s*\}\}\s+render=\{\(\{\s*field\s*\}\)\s+=>\s+\(\s+<TextField\s+\{\.\.\.field\}\s+select\s+label="طريقة\s+الدفع"\s+fullWidth>\s+<MenuItem\s+value="cash">نقدي\s+\(Cash\)<\/MenuItem>\s+<MenuItem\s+value="bank_transfer">تحويل\s+بنكي<\/MenuItem>\s+<MenuItem\s+value="check">شيك<\/MenuItem>\s+<MenuItem\s+value="card">بطاقة<\/MenuItem>\s+<\/TextField>\s+\)\}\s+\/>/;

const jsxNew = `<Controller
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
                            {watchPaymentMethod && (
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
                                            sx={{ mt: 1 }}
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
                            )}`;

if (jsxRegex.test(c)) {
    c = c.replace(jsxRegex, jsxNew);
    console.log('JSX updated with regex');
} else {
    console.log('JSX regex failed');
}

fs.writeFileSync('c:/Users/activ/Desktop/pos/pos/src/pages/Suppliers.jsx', c);
