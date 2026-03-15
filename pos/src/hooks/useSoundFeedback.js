// Sound Feedback Hook for POS actions
// Usage: const { playBeep, playSuccess, playError } = useSoundFeedback()

import { useCallback, useRef } from 'react'

const useSoundFeedback = (enabled = true) => {
    const audioContextRef = useRef(null)

    const initAudioContext = useCallback(() => {
        if (!audioContextRef.current && enabled) {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
        }
        return audioContextRef.current
    }, [enabled])

    const playTone = useCallback((frequency, duration = 100, volume = 0.3) => {
        if (!enabled) return

        try {
            const ctx = initAudioContext()
            if (!ctx) return

            const oscillator = ctx.createOscillator()
            const gainNode = ctx.createGain()

            oscillator.connect(gainNode)
            gainNode.connect(ctx.destination)

            oscillator.frequency.value = frequency
            oscillator.type = 'sine'
            gainNode.gain.value = volume

            oscillator.start(ctx.currentTime)
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000)
            oscillator.stop(ctx.currentTime + duration / 1000)
        } catch (e) {
            console.warn('Audio playback failed:', e)
        }
    }, [enabled, initAudioContext])

    const playBeep = useCallback(() => {
        // Short beep for add to cart
        playTone(800, 80, 0.2)
    }, [playTone])

    const playSuccess = useCallback(() => {
        // Success sound (checkout complete)
        playTone(600, 100, 0.25)
        setTimeout(() => playTone(800, 100, 0.25), 120)
    }, [playTone])

    const playError = useCallback(() => {
        // Error sound
        playTone(300, 150, 0.3)
    }, [playTone])

    const playClick = useCallback(() => {
        // Subtle click for button press
        playTone(1200, 30, 0.1)
    }, [playTone])

    const playRemove = useCallback(() => {
        // Remove from cart sound
        playTone(600, 80, 0.15)
    }, [playTone])

    return {
        playBeep,
        playSuccess,
        playError,
        playClick,
        playRemove,
    }
}

export default useSoundFeedback
