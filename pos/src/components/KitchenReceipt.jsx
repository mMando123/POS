// Kitchen Order Receipt — prints items + quantities only (NO prices)
// Used when KDS is disabled and printKitchenReceipt is enabled

const generateKitchenOrderHTML = (order, settings = {}) => {
    if (!order) return ''

    const storeName = settings?.store?.storeName || settings?.storeName || 'المطبخ'

    const orderTypeLabels = {
        takeaway: '🥡 تيك أواي',
        dine_in: '🍽️ صالة',
        delivery: '🛵 ديليفري',
        online: '🌐 أونلاين',
        walkin: '🚶 حضوري'
    }
    const orderType = orderTypeLabels[order.order_type] || 'طلب'

    const formatTime = (date) => {
        try {
            const d = new Date(date)
            return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
        } catch { return '' }
    }

    const itemsHTML = order.items?.map(item => {
        const qty = item.quantity || 1
        const name = item.name_ar || item.item_name_ar || 'منتج'
        const notes = item.notes ? `<div class="item-notes">⚠️ ${item.notes}</div>` : ''
        return `
            <div class="kitchen-item">
                <span class="k-qty">${qty}x</span>
                <span class="k-name">${name}</span>
            </div>
            ${notes}
        `
    }).join('') || ''

    return `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <title>أمر مطبخ #${order.order_number || ''}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Courier New', monospace;
                    font-size: 14px;
                    width: 100%; max-width: 80mm;
                    margin: 0 auto; padding: 3mm;
                    direction: rtl; background: white; color: black;
                    line-height: 1.5;
                }
                .kitchen-header { text-align: center; padding: 8px 0; border-bottom: 3px double #000; margin-bottom: 10px; }
                .kitchen-title { font-size: 22px; font-weight: bold; }
                .kitchen-order-num { font-size: 28px; font-weight: bold; background: #000; color: #fff; padding: 6px 12px; margin: 8px 0; display: inline-block; }
                .kitchen-type { font-size: 16px; font-weight: bold; border: 2px solid #000; padding: 4px 12px; display: inline-block; margin: 4px 0; }
                .kitchen-time { font-size: 14px; margin: 4px 0; font-weight: bold; }
                .kitchen-items { margin: 10px 0; padding: 8px 0; border-top: 2px solid #000; border-bottom: 2px solid #000; }
                .kitchen-item { display: flex; align-items: center; padding: 6px 4px; border-bottom: 1px dashed #999; font-size: 16px; }
                .kitchen-item:last-child { border-bottom: none; }
                .k-qty { font-size: 20px; font-weight: bold; min-width: 40px; text-align: center; background: #eee; padding: 2px 6px; margin-left: 8px; border-radius: 4px; }
                .k-name { font-size: 16px; font-weight: bold; flex: 1; }
                .item-notes { font-size: 12px; color: #333; padding: 2px 8px 4px 48px; font-style: italic; }
                .kitchen-footer { text-align: center; padding-top: 8px; font-size: 12px; }
                .kitchen-table { font-size: 18px; font-weight: bold; text-align: center; margin: 6px 0; border: 2px solid #000; padding: 6px; }
                .kitchen-notes { background: #f5f5f5; border: 1px solid #000; padding: 6px; margin: 6px 0; font-size: 13px; }
                @page { size: 80mm auto; margin: 0; }
                @media print { body { width: 80mm; } }
            </style>
        </head>
        <body>
            <div class="kitchen-header">
                <div class="kitchen-title">🍳 أمر مطبخ</div>
                <div class="kitchen-order-num">#${order.order_number || 'N/A'}</div>
                <div class="kitchen-type">${orderType}</div>
                <div class="kitchen-time">⏰ ${formatTime(order.created_at)}</div>
            </div>
            ${order.table_number ? `<div class="kitchen-table">🪑 طاولة: ${order.table_number}</div>` : ''}
            <div class="kitchen-items">${itemsHTML}</div>
            ${order.notes ? `<div class="kitchen-notes">📝 ملاحظات: ${order.notes}</div>` : ''}
            <div class="kitchen-footer"><div>${storeName}</div></div>
        </body>
        </html>
    `
}

// Print kitchen order ticket (no prices)
export const printKitchenOrder = async (order) => {
    if (!order) return
    let settings = {}
    try {
        const res = await fetch('/api/settings/public').then(r => r.json())
        settings = res.data || {}
    } catch (e) {
        console.error('Failed to fetch settings for kitchen print:', e)
    }
    const html = generateKitchenOrderHTML(order, settings)
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:absolute;width:0;height:0;border:none;left:-9999px'
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow.document
    doc.open()
    doc.write(html)
    doc.close()
    iframe.onload = () => {
        setTimeout(() => {
            iframe.contentWindow.focus()
            iframe.contentWindow.print()
            setTimeout(() => { document.body.removeChild(iframe) }, 1000)
        }, 300)
    }
}
