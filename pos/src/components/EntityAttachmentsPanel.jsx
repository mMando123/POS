import { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Button, CircularProgress, Typography } from '@mui/material'
import { CloudUpload as UploadIcon } from '@mui/icons-material'
import toast from 'react-hot-toast'
import FileAttachmentsField from './FileAttachmentsField'
import { entityAttachmentAPI } from '../services/api'

function triggerBrowserDownload(blob, fileName) {
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName || 'attachment'
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
}

export default function EntityAttachmentsPanel({
    entityType,
    entityId,
    title = 'المرفقات',
    helperText = 'PDF / Word / Excel / CSV / Images',
    readOnly = false,
    disabled = false,
    maxFiles = 10,
    maxFileSizeMB = 15,
}) {
    const [loading, setLoading] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [existingFiles, setExistingFiles] = useState([])
    const [pendingFiles, setPendingFiles] = useState([])

    const canModify = useMemo(() => !readOnly && !disabled, [readOnly, disabled])

    const loadAttachments = useCallback(async () => {
        if (!entityType || !entityId) {
            setExistingFiles([])
            return
        }

        setLoading(true)
        try {
            const res = await entityAttachmentAPI.list(entityType, entityId)
            setExistingFiles(res?.data?.data || [])
        } catch (error) {
            setExistingFiles([])
            toast.error(error?.response?.data?.message || 'فشل تحميل المرفقات')
        } finally {
            setLoading(false)
        }
    }, [entityType, entityId])

    useEffect(() => {
        loadAttachments()
    }, [loadAttachments])

    const handleUpload = async () => {
        if (!entityId || !entityType || pendingFiles.length === 0) return

        setUploading(true)
        try {
            await entityAttachmentAPI.upload(entityType, entityId, pendingFiles)
            setPendingFiles([])
            await loadAttachments()
            toast.success('تم رفع المرفقات بنجاح')
        } catch (error) {
            toast.error(error?.response?.data?.message || 'فشل رفع المرفقات')
        } finally {
            setUploading(false)
        }
    }

    const handleDownloadExisting = async (attachment) => {
        try {
            const res = await entityAttachmentAPI.download(entityType, entityId, attachment.id)
            triggerBrowserDownload(res.data, attachment.original_name)
        } catch (error) {
            toast.error(error?.response?.data?.message || 'فشل تنزيل المرفق')
        }
    }

    const handleDeleteExisting = async (attachment) => {
        if (!canModify) return
        try {
            await entityAttachmentAPI.remove(entityType, entityId, attachment.id)
            await loadAttachments()
            toast.success('تم حذف المرفق')
        } catch (error) {
            toast.error(error?.response?.data?.message || 'فشل حذف المرفق')
        }
    }

    return (
        <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 700 }}>
                {title}
            </Typography>

            {loading && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <CircularProgress size={16} />
                    <Typography variant="body2" color="text.secondary">
                        جارٍ تحميل المرفقات...
                    </Typography>
                </Box>
            )}

            <FileAttachmentsField
                pendingFiles={pendingFiles}
                onPendingFilesChange={setPendingFiles}
                existingFiles={existingFiles}
                onDownloadExisting={handleDownloadExisting}
                onDeleteExisting={canModify ? handleDeleteExisting : undefined}
                maxFiles={maxFiles}
                maxFileSizeMB={maxFileSizeMB}
                disabled={!canModify || uploading}
                title={title}
                helperText={helperText}
            />

            {canModify && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                    <Button
                        variant="contained"
                        size="small"
                        startIcon={<UploadIcon />}
                        disabled={uploading || pendingFiles.length === 0 || !entityId}
                        onClick={handleUpload}
                    >
                        {uploading ? 'جارٍ الرفع...' : 'رفع المرفقات'}
                    </Button>
                </Box>
            )}
        </Box>
    )
}
