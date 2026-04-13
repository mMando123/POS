const { v4: uuidv4 } = require('uuid')

const round2 = (value) => Math.round((parseFloat(value || 0) + Number.EPSILON) * 100) / 100

const cleanText = (value, { maxLength = 100, required = false, label = 'الحقل' } = {}) => {
    const text = String(value || '').trim()
    if (!text) {
        if (required) throw new Error(`${label} مطلوب`)
        return null
    }
    if (text.length > maxLength) {
        throw new Error(`${label} يجب ألا يتجاوز ${maxLength} حرف`)
    }
    return text
}

const normalizeOptionGroups = (optionGroups) => {
    if (optionGroups == null) return []
    if (!Array.isArray(optionGroups)) {
        throw new Error('option_groups يجب أن تكون مصفوفة')
    }

    return optionGroups.map((group, groupIndex) => {
        const groupName = cleanText(group?.name_ar, {
            maxLength: 100,
            required: true,
            label: `اسم المجموعة رقم ${groupIndex + 1}`
        })

        const groupType = String(group?.group_type || 'modifier').trim().toLowerCase() === 'variant'
            ? 'variant'
            : 'modifier'
        const selectionType = String(group?.selection_type || 'single').trim().toLowerCase() === 'multiple'
            ? 'multiple'
            : 'single'
        const options = Array.isArray(group?.options) ? group.options : []

        if (!options.length) {
            throw new Error(`مجموعة "${groupName}" يجب أن تحتوي على خيار واحد على الأقل`)
        }

        const normalizedOptions = options.map((option, optionIndex) => {
            const optionName = cleanText(option?.name_ar, {
                maxLength: 100,
                required: true,
                label: `اسم الخيار رقم ${optionIndex + 1} في "${groupName}"`
            })
            const priceDelta = round2(option?.price_delta || 0)

            return {
                id: String(option?.id || '').trim() || uuidv4(),
                name_ar: optionName,
                name_en: cleanText(option?.name_en, { maxLength: 100 }),
                price_delta: priceDelta,
                is_default: Boolean(option?.is_default)
            }
        })

        if (selectionType === 'single') {
            let defaultFound = false
            normalizedOptions.forEach((option) => {
                if (!option.is_default) return
                if (!defaultFound) {
                    defaultFound = true
                    return
                }
                option.is_default = false
            })
        }

        return {
            id: String(group?.id || '').trim() || uuidv4(),
            name_ar: groupName,
            name_en: cleanText(group?.name_en, { maxLength: 100 }),
            group_type: groupType,
            selection_type: selectionType,
            required: Boolean(group?.required),
            options: normalizedOptions
        }
    })
}

const normalizeSelectedOptions = (selectedOptions) => {
    if (!Array.isArray(selectedOptions)) return []

    const seen = new Set()
    const normalized = []

    for (const row of selectedOptions) {
        const groupId = String(row?.group_id || '').trim()
        const optionId = String(row?.option_id || '').trim()
        if (!groupId || !optionId) continue

        const key = `${groupId}:${optionId}`
        if (seen.has(key)) continue
        seen.add(key)
        normalized.push({ group_id: groupId, option_id: optionId })
    }

    return normalized
}

const resolveSelectedOptions = (optionGroups, selectedOptions) => {
    const normalizedGroups = Array.isArray(optionGroups) ? optionGroups : []
    if (!normalizedGroups.length) {
        return { selectedOptions: [], priceDelta: 0, summaryLines: [], summaryText: '' }
    }

    const requested = normalizeSelectedOptions(selectedOptions)
    const requestedByGroup = new Map()

    requested.forEach((row) => {
        const list = requestedByGroup.get(row.group_id) || []
        list.push(row.option_id)
        requestedByGroup.set(row.group_id, list)
    })

    const resolvedSelections = []
    const summaryLines = []

    for (const group of normalizedGroups) {
        const options = Array.isArray(group?.options) ? group.options : []
        const optionsById = new Map(options.map((option) => [String(option.id), option]))
        let selectedIds = requestedByGroup.get(String(group.id)) || []

        if (!selectedIds.length) {
            selectedIds = options
                .filter((option, index) => option.is_default || (group.required && group.selection_type === 'single' && options.length === 1 && index === 0))
                .map((option) => String(option.id))
        }

        if (group.required && !selectedIds.length) {
            throw new Error(`يجب اختيار قيمة لـ "${group.name_ar}"`)
        }

        if (group.selection_type === 'single' && selectedIds.length > 1) {
            throw new Error(`مجموعة "${group.name_ar}" تسمح بخيار واحد فقط`)
        }

        const selectedOptionLabels = []
        for (const optionId of selectedIds) {
            const option = optionsById.get(String(optionId))
            if (!option) {
                throw new Error(`الخيار المحدد في "${group.name_ar}" غير صالح`)
            }

            resolvedSelections.push({
                group_id: String(group.id),
                group_name_ar: group.name_ar,
                group_type: group.group_type || 'modifier',
                option_id: String(option.id),
                option_name_ar: option.name_ar,
                price_delta: round2(option.price_delta || 0)
            })
            selectedOptionLabels.push(option.name_ar)
        }

        if (selectedOptionLabels.length > 0) {
            summaryLines.push(`${group.name_ar}: ${selectedOptionLabels.join('، ')}`)
        }
    }

    const priceDelta = round2(resolvedSelections.reduce((sum, option) => sum + round2(option.price_delta || 0), 0))
    return {
        selectedOptions: resolvedSelections,
        priceDelta,
        summaryLines,
        summaryText: summaryLines.join(' | ')
    }
}

const composeItemNotes = (baseNotes, summaryText) => {
    const notes = String(baseNotes || '').trim()
    const summary = String(summaryText || '').trim()

    if (!summary) return notes || null
    if (!notes) return `خيارات: ${summary}`
    return `خيارات: ${summary}\n${notes}`
}

module.exports = {
    normalizeOptionGroups,
    normalizeSelectedOptions,
    resolveSelectedOptions,
    composeItemNotes,
    round2
}
