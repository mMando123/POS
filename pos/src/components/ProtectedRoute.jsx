import { useSelector } from 'react-redux'
import { Navigate } from 'react-router-dom'
import { hasPermission, hasAnyPermission, PERMISSIONS } from '../utils/permissions'

/**
 * ProtectedRoute - Route protection based on permissions
 * 
 * Usage:
 *   <ProtectedRoute permission={PERMISSIONS.REPORTS_VIEW}>
 *     <Reports />
 *   </ProtectedRoute>
 */
export function ProtectedRoute({
    children,
    permission,
    permissions, // Array for multiple (OR logic)
    fallback = null, // What to show if no permission
    redirectTo = null // Redirect path if no permission
}) {
    const { user } = useSelector((state) => state.auth)
    const userRole = user?.role || 'cashier'

    let hasAccess = true

    if (permission) {
        hasAccess = hasPermission(userRole, permission)
    } else if (permissions?.length) {
        hasAccess = hasAnyPermission(userRole, permissions)
    }

    if (!hasAccess) {
        if (redirectTo) {
            return <Navigate to={redirectTo} replace />
        }
        return fallback
    }

    return children
}

/**
 * PermissionGate - Conditionally render content based on permission
 * 
 * Usage:
 *   <PermissionGate permission={PERMISSIONS.MENU_DELETE}>
 *     <DeleteButton />
 *   </PermissionGate>
 */
export function PermissionGate({ children, permission, permissions, fallback = null }) {
    const { user } = useSelector((state) => state.auth)
    const userRole = user?.role || 'cashier'

    let hasAccess = true

    if (permission) {
        hasAccess = hasPermission(userRole, permission)
    } else if (permissions?.length) {
        hasAccess = hasAnyPermission(userRole, permissions)
    }

    return hasAccess ? children : fallback
}

/**
 * usePermission hook - Check permission in components
 * 
 * Usage:
 *   const canDelete = usePermission(PERMISSIONS.MENU_DELETE)
 *   {canDelete && <DeleteButton />}
 */
export function usePermission(permission) {
    const { user } = useSelector((state) => state.auth)
    const userRole = user?.role || 'cashier'

    return hasPermission(userRole, permission)
}

/**
 * usePermissions hook - Check multiple permissions
 * 
 * Usage:
 *   const { canCreate, canDelete } = usePermissions({
 *     canCreate: PERMISSIONS.MENU_CREATE,
 *     canDelete: PERMISSIONS.MENU_DELETE,
 *   })
 */
export function usePermissions(permissionMap) {
    const { user } = useSelector((state) => state.auth)
    const userRole = user?.role || 'cashier'

    const result = {}
    for (const [key, permission] of Object.entries(permissionMap)) {
        result[key] = hasPermission(userRole, permission)
    }

    return result
}

// Re-export PERMISSIONS for convenience
export { PERMISSIONS }

export default ProtectedRoute
