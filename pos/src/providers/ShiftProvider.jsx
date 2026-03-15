/**
 * ShiftProvider - Centralized Shift State Management
 * 
 * This provider ensures:
 * 1. Single source of truth for shift state
 * 2. Shift validation happens ONCE on app load
 * 3. No duplicate shift dialogs across pages
 * 4. Persistent shift state across navigation
 */

import { createContext, useContext, useEffect, useCallback, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useLocation, useNavigate } from 'react-router-dom'
import { shiftAPI } from '../services/api'
import { setActiveShift, setShowShiftDialog, setLoading } from '../store/slices/shiftSlice'

const ShiftContext = createContext(null)

// Pages that REQUIRE an active shift to function
const SHIFT_REQUIRED_PAGES = ['/new-order']

// Pages that are exempt from shift checks (admin areas)
const SHIFT_EXEMPT_PAGES = ['/login', '/settings', '/users', '/menu', '/reports', '/devices']

export function ShiftProvider({ children }) {
    const dispatch = useDispatch()
    const navigate = useNavigate()
    const location = useLocation()

    const { isAuthenticated, user } = useSelector((state) => state.auth)
    const { activeShift, loading } = useSelector((state) => state.shift)

    // Track if we've already validated this session
    const validatedRef = useRef(false)
    const validatingRef = useRef(false)

    /**
     * Validate shift status with backend
     * This is called ONCE when the app loads or user logs in
     */
    const validateShift = useCallback(async () => {
        // Prevent duplicate validation calls
        if (validatingRef.current) return
        if (!isAuthenticated || !user) return

        validatingRef.current = true

        try {
            const response = await shiftAPI.validate()
            const { hasShift, shift, action } = response.data

            if (hasShift && shift) {
                // User has an active shift - store it
                dispatch(setActiveShift({
                    id: shift.id,
                    start_time: shift.startTime,
                    starting_cash: shift.startingCash,
                    status: shift.status,
                    user_id: shift.userId,
                    branch_id: shift.branchId
                }))
                dispatch(setShowShiftDialog(false))
                validatedRef.current = true
            } else {
                // No active shift
                dispatch(setActiveShift(null))

                // Only show dialog if on a page that requires shift
                const currentPath = location.pathname
                if (SHIFT_REQUIRED_PAGES.some(p => currentPath.startsWith(p))) {
                    dispatch(setShowShiftDialog(true))
                }
            }
        } catch (error) {
            console.error('Shift validation error:', error)
            // On error, try to get current shift as fallback
            try {
                const fallback = await shiftAPI.getCurrent()
                if (fallback.data?.data) {
                    dispatch(setActiveShift(fallback.data.data))
                    dispatch(setShowShiftDialog(false))
                }
            } catch (e) {
                // No shift available
                dispatch(setActiveShift(null))
            }
        } finally {
            validatingRef.current = false
        }
    }, [isAuthenticated, user, dispatch, location.pathname])

    // Validate on mount and when auth changes
    useEffect(() => {
        if (isAuthenticated && user && !validatedRef.current) {
            validateShift()
        }

        // Reset validation flag on logout
        if (!isAuthenticated) {
            validatedRef.current = false
            dispatch(setActiveShift(null))
        }
    }, [isAuthenticated, user, validateShift, dispatch])

    // Handle navigation - check if shift is required for target page
    useEffect(() => {
        if (!isAuthenticated) return

        const currentPath = location.pathname

        // Check if current page requires shift
        const requiresShift = SHIFT_REQUIRED_PAGES.some(p => currentPath.startsWith(p))
        const isExempt = SHIFT_EXEMPT_PAGES.some(p => currentPath.startsWith(p))

        if (requiresShift && !activeShift && validatedRef.current) {
            // Page requires shift but none exists - show dialog
            dispatch(setShowShiftDialog(true))
        } else if (isExempt) {
            // Exempt page - don't show dialog
            dispatch(setShowShiftDialog(false))
        }
    }, [location.pathname, activeShift, isAuthenticated, dispatch])

    // Context value with utility functions
    const contextValue = {
        activeShift,
        loading,
        hasShift: !!activeShift,

        // Force refresh shift status
        refreshShift: validateShift,

        // Check if current page requires shift
        isShiftRequired: () => {
            return SHIFT_REQUIRED_PAGES.some(p => location.pathname.startsWith(p))
        },

        // Open shift dialog manually
        openShiftDialog: () => {
            dispatch(setShowShiftDialog(true))
        }
    }

    return (
        <ShiftContext.Provider value={contextValue}>
            {children}
        </ShiftContext.Provider>
    )
}

// Hook to use shift context
export function useShift() {
    const context = useContext(ShiftContext)
    if (!context) {
        throw new Error('useShift must be used within ShiftProvider')
    }
    return context
}

export default ShiftProvider
