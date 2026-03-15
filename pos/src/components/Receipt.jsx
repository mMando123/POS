import React from 'react'

// Generate professional receipt HTML for thermal printing (80mm)
const generateReceiptHTML = (order, settings = {}) => {
    if (!order) return ''

    const store = settings.store || {}
    const receipt = settings.receipt || {}
    const system = settings.system || {}
    const template = settings.template || {}
    const currencyCode = String(system.currency || store.currency || 'SAR').toUpperCase()
    const currencySymbolsByCode = {
        SAR: 'ر.س',
        USD: '$',
        EUR: '€',
        GBP: '£',
        AED: 'د.إ',
        KWD: 'د.ك',
        QAR: 'ر.ق',
        BHD: 'د.ب',
        OMR: 'ر.ع',
        EGP: 'ج.م',
        JOD: 'د.أ'
    }
    const currencySymbol = currencySymbolsByCode[currencyCode]
        || String(system.currencySymbol || store.currencySymbol || currencyCode || 'ر.س').trim()
        || 'ر.س'
    const currencyDecimalsByCode = { KWD: 3, BHD: 3, OMR: 3, JOD: 3 }
    const currencyDecimals = currencyDecimalsByCode[currencyCode] ?? 2

    const formatMoney = (value, { withSymbol = true } = {}) => {
        const amount = parseFloat(value || 0)
        const normalized = Number.isFinite(amount) ? amount : 0
        const formatted = normalized.toFixed(currencyDecimals)
        return withSymbol ? `${formatted} ${currencySymbol}` : formatted
    }

    // Format date as DD/MM/YYYY
    const formatDate = (date) => {
        try {
            const d = new Date(date)
            return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`
        } catch {
            return new Date().toLocaleDateString('ar-EG')
        }
    }

    // Format time as HH:MM
    const formatTime = (date) => {
        try {
            const d = new Date(date)
            return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
        } catch {
            return ''
        }
    }

    // Build items table rows
    const itemsHTML = order.items?.map(item => {
        const unitPrice = parseFloat(item.price || item.unit_price || 0)
        const qty = item.quantity || 1
        const total = unitPrice * qty
        return `
            <tr>
                <td class="item-name">${item.name_ar || item.item_name_ar || 'منتج'}</td>
                <td class="item-qty">${qty}</td>
                <td class="item-price">${unitPrice.toFixed(2)}</td>
                <td class="item-total">${total.toFixed(2)}</td>
            </tr>
        `
    }).join('') || ''

    // Logo URL - check template first, then store settings
    const templateLogo = template.logoUrl || template.headerLogo
    const storeLogo = store.logo || store.storeLogo
    const logoSource = templateLogo || storeLogo
    const logoUrl = logoSource ? (logoSource.startsWith('http') ? logoSource : `${window.location.origin}${logoSource}`) : null
    const showLogo = template.showLogo !== false && receipt.showLogo !== false

    // Store name and header text
    const storeName = store.storeName || store.store_name || 'المطعم'
    const headerText = template.headerText || ''

    // Visibility Toggles
    const showCashier = template.showCashier !== false
    const showDate = template.showDate !== false
    const showBarcode = template.showBarcode === true // Default to false unless enabled

    // Cashier name - try multiple sources
    const cashierName = order.cashier_name || order.User?.name_ar || order.user?.name_ar || 'الكاشير'

    // Payment method display
    const paymentType = order.payment_method === 'cash' ? 'كاش' : order.payment_method === 'card' ? 'شبكة' : 'أونلاين'

    // Order type display
    const orderType = order.order_type === 'delivery'
        ? 'توصيل'
        : order.order_type === 'dine_in'
            ? 'صالة'
            : order.order_type === 'takeaway'
                ? 'تيك أواي'
                : order.order_type === 'online'
                    ? 'أونلاين'
                    : 'حضوري'

    // Calculations
    const subtotal = parseFloat(order.subtotal || 0)
    const tax = parseFloat(order.tax || 0)
    const discount = parseFloat(order.discount || 0)
    const total = parseFloat(order.total || 0)
    const paid = parseFloat(order.paid_amount || total)
    const balance = paid - total

    // QR Code display
    const showQr = template.showQr !== false

    return `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <title>فاتورة #${order.order_number || ''}</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39+Text&display=swap" rel="stylesheet">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Courier New', 'Lucida Console', monospace;
                    font-size: 12px;
                    width: 100%;
                    max-width: 80mm;
                    margin: 0 auto;
                    padding: 3mm;
                    direction: rtl;
                    text-align: right;
                    background: white;
                    color: black;
                    line-height: 1.4;
                }
                
                /* Header Section */
                .header {
                    text-align: center;
                    padding-bottom: 8px;
                    border-bottom: 2px solid #000;
                    margin-bottom: 8px;
                }
                .payment-type {
                    font-size: 14px;
                    font-weight: bold;
                    background: #000;
                    color: #fff;
                    padding: 2px 10px;
                    display: inline-block;
                    margin-bottom: 5px;
                }
                .store-name {
                    font-size: 20px;
                    font-weight: bold;
                    margin: 8px 0;
                }
                .order-type {
                    font-size: 13px;
                    font-weight: bold;
                    border: 1px solid #000;
                    padding: 2px 8px;
                    display: inline-block;
                }
                .header-subtitle {
                    font-size: 11px;
                    margin: 5px 0;
                    white-space: pre-line;
                }
                .qr-container {
                    text-align: center;
                    margin: 10px 0;
                }
                .qr-placeholder {
                    width: 60px;
                    height: 60px;
                    border: 2px solid #000;
                    margin: 0 auto;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                    font-size: 14px;
                }
                .qr-text {
                    font-size: 9px;
                    margin-top: 3px;
                }
                .barcode-container {
                    text-align: center;
                    margin: 10px 0;
                }
                .barcode {
                    font-family: 'Libre Barcode 39 Text', cursive;
                    font-size: 40px;
                    display: block;
                }
                .logo-container {
                    margin-bottom: 8px;
                }
                .logo-container img {
                    max-width: 35mm;
                    max-height: 18mm;
                }
                
                /* Order Info Section */
                .order-info {
                    border: 2px solid #000;
                    padding: 8px;
                    margin-bottom: 10px;
                }
                .order-number {
                    text-align: center;
                    font-size: 18px;
                    font-weight: bold;
                    border: 2px solid #000;
                    padding: 5px;
                    margin-bottom: 8px;
                    background: #f0f0f0;
                }
                .info-row {
                    display: flex;
                    justify-content: space-between;
                    margin: 4px 0;
                    font-size: 11px;
                }
                .info-label {
                    font-weight: bold;
                }
                
                /* Items Table */
                .items-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 10px 0;
                    font-size: 11px;
                }
                .items-table th {
                    background: #000;
                    color: #fff;
                    padding: 5px 3px;
                    text-align: center;
                    font-weight: bold;
                }
                .items-table td {
                    padding: 4px 3px;
                    border-bottom: 1px dashed #ccc;
                    text-align: center;
                }
                .items-table .item-name {
                    text-align: right;
                    width: 40%;
                }
                .items-table .item-qty { width: 15%; }
                .items-table .item-price { width: 22%; }
                .items-table .item-total { width: 23%; font-weight: bold; }
                
                /* Calculations Section */
                .calculations {
                    margin: 10px 0;
                    padding: 8px;
                    border: 1px solid #000;
                }
                .calc-row {
                    display: flex;
                    justify-content: space-between;
                    margin: 4px 0;
                    font-size: 12px;
                }
                .total-box {
                    background: #000;
                    color: #fff;
                    padding: 8px;
                    margin: 8px 0;
                    font-size: 16px;
                    font-weight: bold;
                    display: flex;
                    justify-content: space-between;
                }
                .paid-row, .balance-row {
                    font-size: 13px;
                    font-weight: bold;
                }
                
                /* Footer Section */
                .footer {
                    text-align: center;
                    padding-top: 10px;
                    border-top: 2px solid #000;
                    margin-top: 10px;
                    font-size: 10px;
                }
                .footer-line {
                    margin: 3px 0;
                }
                .footer-bold {
                    font-weight: bold;
                    font-size: 11px;
                }
                .divider {
                    border-top: 1px dashed #000;
                    margin: 8px 0;
                }
                .thanks {
                    font-size: 13px;
                    font-weight: bold;
                    margin: 10px 0;
                }
                
                @page { size: 80mm auto; margin: 0; }
                @media print {
                    body { width: 80mm; }
                }
            </style>
        </head>
        <body>
            <!-- Header -->
            <div class="header">
                ${showLogo && logoUrl ? `
                <div class="logo-container">
                    <img src="${logoUrl}" alt="Logo" onerror="this.style.display='none'">
                </div>
                ` : ''}
                
                <div class="payment-type">${paymentType}</div>
                <div class="store-name">${storeName}</div>
                ${headerText ? `<div class="header-subtitle">${headerText}</div>` : ''}
                <div class="order-type">${orderType}</div>
            </div>
            
            <!-- Order Info -->
            <div class="order-info">
                <div class="order-number">طلب رقم: ${order.order_number || 'N/A'}</div>
                ${showDate ? `
                <div class="info-row">
                    <span class="info-label">التاريخ:</span>
                    <span>${formatDate(order.created_at)}</span>
                </div>` : ''}
                ${showCashier ? `
                <div class="info-row">
                    <span class="info-label">الكاشير:</span>
                    <span>${cashierName}</span>
                </div>` : ''}
            </div>
            
            <!-- Items Table -->
            <table class="items-table">
                <thead>
                    <tr>
                        <th>الصنف</th>
                        <th>الكمية</th>
                        <th>السعر</th>
                        <th>الإجمالي</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHTML}
                </tbody>
            </table>
            
            <!-- Calculations -->
            <div class="calculations">
                ${discount > 0 ? `
                <div class="calc-row">
                    <span>الخصم:</span>
                    <span>${formatMoney(discount)}</span>
                </div>
                ` : ''}
                
                <div class="total-box">
                    <span>الإجمالي المطلوب:</span>
                    <span>${formatMoney(total)}</span>
                </div>
                
                <div class="calc-row paid-row">
                    <span>المدفوع:</span>
                    <span>${formatMoney(paid)}</span>
                </div>
                
                <div class="calc-row balance-row">
                    <span>المتبقي:</span>
                    <span>${balance >= 0 ? formatMoney(balance) : formatMoney(0)}</span>
                </div>
            </div>
            
            <!-- Footer -->
            <div class="footer">
                ${showQr ? `
                <div class="qr-container">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
        `Store: ${storeName}\nDate: ${order.created_at}\nTotal: ${formatMoney(total)}\nTax No: ${store.taxNumber || 'N/A'}`
    )}" alt="QR Code" style="width: 100px; height: 100px;" />
                    <div class="qr-text">امسح الكود لتفاصيل الفاتورة</div>
                </div>
                ` : ''}

                ${showBarcode ? `
                <div class="barcode-container">
                    <span class="barcode">*${order.order_number || '000'}*</span>
                </div>
                ` : ''}
                
                <div class="divider"></div>
                <div class="thanks">${template.footerText || receipt.footerText || 'شكراً لزيارتكم!'}</div>
                
                <div class="footer-line">
                    ${formatDate(order.created_at)} - ${formatTime(order.created_at)}
                </div>
                <div class="footer-line footer-bold">
                    فاتورة رقم: ${order.order_number || 'N/A'}
                </div>
                ${store.address || store.storeAddress ? `<div class="footer-line">${store.address || store.storeAddress}</div>` : ''}
                ${store.phone || store.storePhone ? `<div class="footer-line">📞 ${store.phone || store.storePhone}</div>` : ''}
                ${store.taxNumber ? `<div class="footer-line">الرقم الضريبي: ${store.taxNumber}</div>` : ''}
            </div>
        </body>
        </html>
    `
}

// Print function using iframe
export const printReceipt = async (order) => {
    if (!order) {
        console.error('No order data to print')
        return
    }

    let settings = {}
    let template = null

    try {
        // Fetch Settings & Templates in parallel
        const [settingsRes, templatesRes] = await Promise.all([
            fetch('/api/settings/public').then(r => r.json()),
            fetch('/api/devices/templates/all', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            }).then(r => r.json()).catch(() => ({ data: [] }))
        ])

        settings = settingsRes.data || {}

        // Map public settings to expected structure if needed
        if (!settings.store) {
            settings.store = {
                storeName: settings.storeName,
                storeNameEn: settings.storeNameEn,
                logo: settings.logo,
                taxRate: settings.taxRate,
                currency: settings.currency,
                currencySymbol: settings.currencySymbol
            }
        }
        if (!settings.system) {
            settings.system = {
                currency: settings.currency || settings.store?.currency || 'SAR',
                currencySymbol: settings.currencySymbol || settings.store?.currencySymbol || 'ر.س'
            }
        }
        const templates = templatesRes.data || []
        template = templates.find(t => t.type === 'receipt' && t.is_default) || templates.find(t => t.type === 'receipt')

    } catch (error) {
        console.error('Failed to fetch print data:', error)
    }

    // Merge template data into settings for generateReceiptHTML
    if (template) {
        if (!settings.store) settings.store = {}
        if (!settings.receipt) settings.receipt = {}

        // Override logo settings from template
        if (template.header_logo) {
            settings.store.logo = template.header_logo
        }
        settings.receipt.showLogo = template.show_logo !== false

        // Pass template object to generator with all necessary fields
        settings.template = {
            headerText: template.header_text,
            footerText: template.footer_text,
            fontSize: template.font_size,
            showQr: template.show_qr,
            showBarcode: template.show_barcode, // Added this line
            showCashier: template.show_cashier, // Added this line
            showDate: template.show_date, // Added this line
            showLogo: template.show_logo !== false,
            logoUrl: template.header_logo,
            headerLogo: template.header_logo
        }
    } else {
        // Default settings if no template
        if (!settings.receipt) settings.receipt = {}
        settings.receipt.showLogo = true
        settings.template = { showQr: true, showLogo: true }
    }

    const receiptHTML = generateReceiptHTML(order, settings)

    // Create hidden iframe
    const iframe = document.createElement('iframe')
    iframe.style.position = 'absolute'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = 'none'
    iframe.style.left = '-9999px'

    document.body.appendChild(iframe)

    // Write content to iframe
    const doc = iframe.contentWindow.document
    doc.open()
    doc.write(receiptHTML)
    doc.close()

    // Wait for content to load then print
    iframe.onload = () => {
        setTimeout(() => {
            iframe.contentWindow.focus()
            iframe.contentWindow.print()

            // Remove iframe after print dialog closes
            setTimeout(() => {
                document.body.removeChild(iframe)
            }, 1000)
        }, 500) // Increased to 500ms to allow fonts to load
    }
}

// React component (optional, for preview)
const Receipt = ({ order }) => {
    if (!order) return null

    return (
        <div style={{ display: 'none' }} id="receipt-preview">
            {/* Hidden preview - actual print uses iframe */}
        </div>
    )
}

export default Receipt
