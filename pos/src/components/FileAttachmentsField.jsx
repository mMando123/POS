import { useEffect, useMemo, useRef } from 'react'
import {
    Box,
    Button,
    Chip,
    Stack,
    Typography
} from '@mui/material'
import {
    AttachFile as AttachFileIcon,
    CloudDownload as CloudDownloadIcon,
    DeleteOutline as DeleteIcon,
    OpenInNew as OpenInNewIcon
} from '@mui/icons-material'

const defaultAccept =
    '.pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,image/jpeg,image/png,image/webp'

const getFileSizeText = (bytes = 0) => {
    const n = Number(bytes) || 0
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const fileKey = (f) => `${f.name}-${f.size}-${f.lastModified}`
const imageExtensions = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'])

const getFileName = (f = {}) => f.original_name || f.name || 'attachment'

const getExt = (name = '') => {
    const value = String(name || '')
    const idx = value.lastIndexOf('.')
    if (idx < 0) return ''
    return value.slice(idx + 1).toLowerCase()
}

const isImageFile = (f = {}) => {
    const mime = String(f.mime_type || f.type || '').toLowerCase()
    if (mime.startsWith('image/')) return true
    return imageExtensions.has(getExt(getFileName(f)))
}

const getExistingFileUrl = (f = {}) => (
    f.view_url ||
    f.preview_url ||
    f.open_url ||
    null
)

export default function FileAttachmentsField({
    title = 'المرفقات',
    pendingFiles = [],
    onPendingFilesChange,
    existingFiles = [],
    onDownloadExisting,
    onOpenExisting,
    onDeleteExisting,
    disabled = false,
    accept = defaultAccept,
    maxFiles = 10,
    maxFileSizeMB = 15,
    helperText = 'الأنواع المسموحة: PDF/Word/Excel/Images'
}) {
    const inputRef = useRef(null)
    const maxBytes = maxFileSizeMB * 1024 * 1024

    const pendingKeys = useMemo(
        () => new Set((pendingFiles || []).map((f) => fileKey(f))),
        [pendingFiles]
    )

    const pendingImagePreviews = useMemo(
        () => (pendingFiles || [])
            .filter((f) => isImageFile(f))
            .map((f) => ({ key: fileKey(f), file: f, url: URL.createObjectURL(f) })),
        [pendingFiles]
    )

    useEffect(() => () => {
        pendingImagePreviews.forEach((p) => {
            try { URL.revokeObjectURL(p.url) } catch (_) { }
        })
    }, [pendingImagePreviews])

    const existingImageFiles = useMemo(
        () => (existingFiles || []).filter((f) => isImageFile(f)),
        [existingFiles]
    )

    const pickFiles = (event) => {
        const selected = Array.from(event.target.files || [])
        event.target.value = ''
        if (!selected.length || !onPendingFilesChange) return

        const merged = [...(pendingFiles || [])]
        for (const f of selected) {
            if (f.size > maxBytes) continue
            if (pendingKeys.has(fileKey(f))) continue
            merged.push(f)
            if (merged.length >= maxFiles) break
        }
        onPendingFilesChange(merged.slice(0, maxFiles))
    }

    const removePending = (idx) => {
        if (!onPendingFilesChange) return
        const next = [...(pendingFiles || [])]
        next.splice(idx, 1)
        onPendingFilesChange(next)
    }

    const openInBrowser = (url) => {
        if (!url) return
        window.open(url, '_blank', 'noopener,noreferrer')
    }

    const handleOpenExisting = (file) => {
        if (onOpenExisting) {
            onOpenExisting(file)
            return
        }

        const url = getExistingFileUrl(file)
        if (url) {
            openInBrowser(url)
            return
        }

        if (onDownloadExisting) onDownloadExisting(file)
    }

    return (
        <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
                {title}
            </Typography>

            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept={accept}
                    hidden
                    onChange={pickFiles}
                />
                <Button
                    variant="outlined"
                    size="small"
                    startIcon={<AttachFileIcon />}
                    disabled={disabled || !onPendingFilesChange || (pendingFiles || []).length >= maxFiles}
                    onClick={() => inputRef.current?.click()}
                >
                    إرفاق ملفات
                </Button>
                <Typography variant="caption" color="text.secondary">
                    حد أقصى {maxFiles} ملفات - {maxFileSizeMB}MB لكل ملف
                </Typography>
            </Stack>

            {helperText && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    {helperText}
                </Typography>
            )}

            {(pendingFiles || []).length > 0 && (
                <Box sx={{ mb: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                        ملفات مرفوعة قبل الحفظ
                    </Typography>

                    {pendingImagePreviews.length > 0 && (
                        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1 }}>
                            {pendingImagePreviews.map((p) => (
                                <Box
                                    key={p.key}
                                    sx={{
                                        width: 120,
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        borderRadius: 1,
                                        overflow: 'hidden',
                                        mb: 1,
                                        bgcolor: 'background.paper'
                                    }}
                                >
                                    <Box
                                        component="img"
                                        src={p.url}
                                        alt={p.file.name}
                                        sx={{ width: '100%', height: 80, objectFit: 'cover', display: 'block', bgcolor: 'grey.100' }}
                                    />
                                    <Typography
                                        variant="caption"
                                        sx={{
                                            p: 0.5,
                                            display: 'block',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}
                                    >
                                        {p.file.name}
                                    </Typography>
                                </Box>
                            ))}
                        </Stack>
                    )}

                    <Stack direction="row" spacing={1} flexWrap="wrap">
                        {(pendingFiles || []).map((f, idx) => (
                            <Chip
                                key={fileKey(f)}
                                label={`${f.name} (${getFileSizeText(f.size)})`}
                                onDelete={disabled ? undefined : () => removePending(idx)}
                                deleteIcon={<DeleteIcon />}
                                sx={{ mb: 1 }}
                            />
                        ))}
                    </Stack>
                </Box>
            )}

            {(existingFiles || []).length > 0 && (
                <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                        ملفات محفوظة على القيد
                    </Typography>

                    {existingImageFiles.length > 0 && (
                        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1 }}>
                            {existingImageFiles.map((f) => {
                                const url = getExistingFileUrl(f)
                                return (
                                    <Box
                                        key={f.id}
                                        sx={{
                                            width: 140,
                                            border: '1px solid',
                                            borderColor: 'divider',
                                            borderRadius: 1,
                                            overflow: 'hidden',
                                            mb: 1,
                                            bgcolor: 'background.paper'
                                        }}
                                    >
                                        <Box
                                            component="img"
                                            src={url || ''}
                                            alt={getFileName(f)}
                                            onClick={() => handleOpenExisting(f)}
                                            sx={{
                                                width: '100%',
                                                height: 96,
                                                objectFit: 'cover',
                                                display: 'block',
                                                bgcolor: 'grey.100',
                                                cursor: (url || onDownloadExisting) ? 'pointer' : 'default'
                                            }}
                                        />
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                p: 0.75,
                                                display: 'block',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}
                                        >
                                            {getFileName(f)}
                                        </Typography>
                                    </Box>
                                )
                            })}
                        </Stack>
                    )}

                    <Stack direction="row" spacing={1} flexWrap="wrap">
                        {(existingFiles || []).map((f) => (
                            <Chip
                                key={f.id}
                                label={`${f.original_name || 'attachment'} (${getFileSizeText(f.file_size)})`}
                                onDelete={onDeleteExisting ? () => onDeleteExisting(f) : undefined}
                                deleteIcon={<DeleteIcon />}
                                onClick={() => handleOpenExisting(f)}
                                icon={getExistingFileUrl(f)
                                    ? <OpenInNewIcon fontSize="small" />
                                    : <CloudDownloadIcon fontSize="small" />}
                                clickable={Boolean(getExistingFileUrl(f) || onDownloadExisting || onOpenExisting)}
                                sx={{ mb: 1 }}
                            />
                        ))}
                    </Stack>
                </Box>
            )}
        </Box>
    )
}
