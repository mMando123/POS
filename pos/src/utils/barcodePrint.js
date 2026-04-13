import JsBarcode from 'jsbarcode'

const SVG_NS = 'http://www.w3.org/2000/svg'

const createBarcodeSvgMarkup = (value) => {
    const barcode = String(value || '').trim()
    if (!barcode) return ''

    const svg = document.createElementNS(SVG_NS, 'svg')
    JsBarcode(svg, barcode, {
        format: 'CODE128',
        displayValue: true,
        margin: 0,
        width: 1.6,
        height: 52,
        fontOptions: 'bold',
        fontSize: 16,
        textMargin: 6
    })

    return svg.outerHTML
}

export const openBarcodePrintWindow = ({ items, copies = 1, title = 'طباعة باركود المنتجات' }) => {
    const printableItems = Array.isArray(items) ? items.filter((item) => String(item?.barcode || '').trim()) : []
    if (!printableItems.length) {
        throw new Error('لا توجد أصناف تحتوي على باركود للطباعة')
    }

    const safeCopies = Math.max(1, parseInt(copies, 10) || 1)
    const labels = printableItems.flatMap((item) => (
        Array.from({ length: safeCopies }, (_, index) => ({
            ...item,
            copyIndex: index + 1
        }))
    ))

    const markup = labels.map((item) => {
        const barcodeMarkup = createBarcodeSvgMarkup(item.barcode)
        return `
            <article class="label">
                <div class="name">${String(item.name_ar || '').trim() || 'صنف بدون اسم'}</div>
                ${item.sku ? `<div class="meta">SKU: ${String(item.sku).trim()}</div>` : ''}
                <div class="barcode-wrap">${barcodeMarkup}</div>
                <div class="meta">الباركود: ${String(item.barcode || '').trim()}</div>
            </article>
        `
    }).join('')

    const printWindow = window.open('', '_blank', 'width=1200,height=900')
    if (!printWindow) {
        throw new Error('تعذر فتح نافذة الطباعة. تأكد من السماح بالنوافذ المنبثقة.')
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="utf-8" />
            <title>${title}</title>
            <style>
                @page {
                    size: A4;
                    margin: 10mm;
                }
                * {
                    box-sizing: border-box;
                }
                body {
                    margin: 0;
                    font-family: "Segoe UI", Tahoma, Arial, sans-serif;
                    background: #fff;
                    color: #111827;
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid #dbe2ea;
                }
                .title {
                    font-size: 20px;
                    font-weight: 700;
                }
                .meta-top {
                    font-size: 12px;
                    color: #4b5563;
                }
                .grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 8mm;
                }
                .label {
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    padding: 6mm 5mm;
                    min-height: 42mm;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    break-inside: avoid;
                }
                .name {
                    font-size: 15px;
                    font-weight: 700;
                    line-height: 1.35;
                    margin-bottom: 4px;
                }
                .meta {
                    font-size: 11px;
                    color: #374151;
                    word-break: break-word;
                }
                .barcode-wrap {
                    margin: 6px 0 4px;
                    min-height: 76px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .barcode-wrap svg {
                    width: 100%;
                    height: auto;
                }
            </style>
        </head>
        <body>
            <header class="header">
                <div class="title">${title}</div>
                <div class="meta-top">عدد الملصقات: ${labels.length}</div>
            </header>
            <main class="grid">${markup}</main>
            <script>
                window.onload = () => {
                    setTimeout(() => {
                        window.focus();
                        window.print();
                    }, 200);
                };
            </script>
        </body>
        </html>
    `)
    printWindow.document.close()
}
