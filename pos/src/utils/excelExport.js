import * as XLSX from 'xlsx';

/**
 * Export JSON data to an Excel file
 * @param {Array} data - Array of objects to export
 * @param {string} fileName - Name of the file (without extension)
 * @param {string} sheetName - Name of the worksheet (optional, default "Sheet1")
 */
export const exportToExcel = (data, fileName, sheetName = "Sheet1") => {
    try {
        // 1. Create a WorkBook
        const workbook = XLSX.utils.book_new();

        // 2. Create a WorkSheet
        const worksheet = XLSX.utils.json_to_sheet(data);

        // Optional: Auto-width columns based on content length
        const maxWidth = data.reduce((w, r) => Math.max(w, JSON.stringify(r).length), 10);
        const wscols = Object.keys(data[0] || {}).map(k => ({ wch: Math.max(k.length + 5, 20) }));
        worksheet['!cols'] = wscols;

        // 3. Append worksheet to workbook
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

        // 4. Generate & Save File
        XLSX.writeFile(workbook, `${fileName}.xlsx`);

        return true;
    } catch (error) {
        console.error("Export failed:", error);
        return false;
    }
};
