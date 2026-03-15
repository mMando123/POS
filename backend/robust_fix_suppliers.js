const fs = require('fs');
let c = fs.readFileSync('c:/Users/activ/Desktop/pos/pos/src/pages/Suppliers.jsx', 'utf8');

// 1. Update useForm to include watch and payment_account_code
const useFormOld = `    const {
        control: paymentControl,
        handleSubmit: handlePaymentSubmit,
        reset: resetPayment,
        formState: { errors: paymentErrors }
    } = useForm({
        defaultValues: {
            amount: '',
            payment_method: 'cash',
            reference: '',
            notes: '',
            payment_date: new Date().toISOString().split('T')[0]
        }
    })`;

const useFormNew = `    const {
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

c = c.replace(useFormOld, useFormNew);

// 2. Update the reset in the table action
const resetOld = `                                                    resetPayment({
                                                        amount: '',
                                                        payment_method: 'cash',
                                                        reference: '',
                                                        notes: '',
                                                        payment_date: new Date().toISOString().split('T')[0]
                                                    })`;
const resetNew = `                                                    resetPayment({
                                                        amount: '',
                                                        payment_method: 'cash',
                                                        payment_account_code: '',
                                                        reference: '',
                                                        notes: '',
                                                        payment_date: new Date().toISOString().split('T')[0]
                                                    })`;
c = c.replace(resetOld, resetNew);

// 3. Update the JSX to include the account selector
const jsxOld = `                            <Controller
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

const jsxNew = `                            <Controller
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

c = c.replace(jsxOld, jsxNew);

fs.writeFileSync('c:/Users/activ/Desktop/pos/pos/src/pages/Suppliers.jsx', c);
console.log('Suppliers.jsx updated successfully');
