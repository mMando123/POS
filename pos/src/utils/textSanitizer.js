const MOJIBAKE_PATTERN = /[\u00C3\u00C2\u00D8\u00D9\u00D0\u00D1\u00CF\uFFFD]/
const ARABIC_PATTERN = /[\u0600-\u06FF]/g
const LATIN_PATTERN = /[A-Za-z]/g
const DIGIT_PATTERN = /[0-9]/g
const GARBLED_PATTERN = /[\u00C3\u00C2\u00D8\u00D9\u00D0\u00D1\u00CF\uFFFD]/g
const CONTROL_CHARS_PATTERN = /[\u0000-\u001F\u007F]/g

const normalizeCandidate = (value) =>
    String(value || '')
        .replace(CONTROL_CHARS_PATTERN, '')
        .trim()

const scoreTextQuality = (value) => {
    if (typeof value !== 'string' || !value.length) return Number.NEGATIVE_INFINITY

    const normalized = normalizeCandidate(value)
    if (!normalized) return Number.NEGATIVE_INFINITY

    const arabicCount = (normalized.match(ARABIC_PATTERN) || []).length
    const latinCount = (normalized.match(LATIN_PATTERN) || []).length
    const digitCount = (normalized.match(DIGIT_PATTERN) || []).length
    const garbledCount = (normalized.match(GARBLED_PATTERN) || []).length
    const questionMarks = (normalized.match(/\?/g) || []).length

    return (arabicCount * 3) + (latinCount * 2) + digitCount - (garbledCount * 2) - (questionMarks * 2)
}

const decodeLatin1AsUtf8 = (value) => {
    try {
        const bytes = Uint8Array.from(value, (ch) => ch.charCodeAt(0) & 0xff)
        return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    } catch {
        return value
    }
}

export const fixMojibakeText = (value) => {
    if (typeof value !== 'string') return value

    const source = normalizeCandidate(value)
    if (!source) return source
    if (!MOJIBAKE_PATTERN.test(source)) return source

    let best = source
    let bestScore = scoreTextQuality(source)
    let current = source

    // Some values were double-encoded, so we try up to 3 rounds.
    for (let i = 0; i < 3; i += 1) {
        const decoded = normalizeCandidate(decodeLatin1AsUtf8(current))
        if (!decoded || decoded === current) break

        const decodedScore = scoreTextQuality(decoded)
        if (decodedScore > bestScore) {
            best = decoded
            bestScore = decodedScore
        }

        current = decoded
    }

    return best
}

const isLowQualityText = (value) => {
    const normalized = normalizeCandidate(value)
    if (!normalized) return true

    const arabicCount = (normalized.match(ARABIC_PATTERN) || []).length
    const latinCount = (normalized.match(LATIN_PATTERN) || []).length
    const digitCount = (normalized.match(DIGIT_PATTERN) || []).length
    const garbledCount = (normalized.match(GARBLED_PATTERN) || []).length
    const questionMarks = (normalized.match(/\?/g) || []).length

    const meaningfulChars = arabicCount + latinCount + digitCount
    if ((garbledCount > 0 || questionMarks > 0) && meaningfulChars === 0) {
        return true
    }

    const noiseRatio = (garbledCount + questionMarks) / normalized.length
    return noiseRatio >= 0.35
}

export const toReadableText = (value, fallback = '') => {
    const fixedValue = fixMojibakeText(value)
    const normalizedValue = typeof fixedValue === 'string' ? normalizeCandidate(fixedValue) : ''

    if (!normalizedValue || /^\?+$/.test(normalizedValue) || isLowQualityText(normalizedValue)) {
        const fixedFallback = fixMojibakeText(fallback)
        const normalizedFallback = typeof fixedFallback === 'string' ? normalizeCandidate(fixedFallback) : ''
        return isLowQualityText(normalizedFallback) ? '' : normalizedFallback
    }

    return normalizedValue
}
