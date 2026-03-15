const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const routesDir = path.join(projectRoot, 'backend', 'src', 'routes')

const METHOD_ORDER = ['get', 'post', 'put', 'patch', 'delete']
const mutativeMethods = new Set(['post', 'put', 'patch', 'delete'])

const routeStartRegex = /router\.(get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]+)\2/gi

const files = fs
    .readdirSync(routesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => entry.name)
    .sort()

const records = []

for (const fileName of files) {
    const absPath = path.join(routesDir, fileName)
    const source = fs.readFileSync(absPath, 'utf8')
    const hasGlobalAuthenticate = /router\.use\(\s*authenticate\s*\)/.test(source)

    let match
    while ((match = routeStartRegex.exec(source)) !== null) {
        const method = match[1].toLowerCase()
        const routePath = match[3]
        const snippet = source.slice(match.index, match.index + 900)

        const usesOptionalAuth = /\boptionalAuth\b/.test(snippet)
        const usesAuthenticate = hasGlobalAuthenticate || /\bauthenticate\b/.test(snippet)
        const usesAuthorize = /\bauthorize\s*\(/.test(snippet)
        const usesRequirePermission = /\brequirePermission\s*\(/.test(snippet)
        const usesRequireAnyPermission = /\brequireAnyPermission\s*\(/.test(snippet)

        records.push({
            file: fileName,
            method,
            path: routePath,
            optionalAuth: usesOptionalAuth,
            authenticate: usesAuthenticate || usesOptionalAuth,
            authorize: usesAuthorize,
            requirePermission: usesRequirePermission,
            requireAnyPermission: usesRequireAnyPermission,
            mutative: mutativeMethods.has(method)
        })
    }
}

const sortedRecords = records.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file)
    const methodDelta = METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method)
    if (methodDelta !== 0) return methodDelta
    return a.path.localeCompare(b.path)
})

const unsecuredOrPublic = sortedRecords.filter(
    (r) => !r.authenticate && !r.optionalAuth
)

const authOnlyMutative = sortedRecords.filter(
    (r) =>
        r.mutative &&
        r.authenticate &&
        !r.authorize &&
        !r.requirePermission &&
        !r.requireAnyPermission
)

const byFileCounts = new Map()
for (const row of sortedRecords) {
    const current = byFileCounts.get(row.file) || 0
    byFileCounts.set(row.file, current + 1)
}

const payload = {
    scanned_at: new Date().toISOString(),
    totals: {
        route_files: files.length,
        routes: sortedRecords.length,
        unsecured_or_public: unsecuredOrPublic.length,
        auth_only_mutative: authOnlyMutative.length
    },
    routes_per_file: Array.from(byFileCounts.entries())
        .map(([file, count]) => ({ file, count }))
        .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file)),
    unsecured_or_public: unsecuredOrPublic,
    auth_only_mutative: authOnlyMutative
}

const reportPath = path.join(projectRoot, 'PERMISSIONS_AUDIT_REPORT.json')
fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2), 'utf8')

console.log(`Scanned route files: ${files.length}`)
console.log(`Total routes: ${sortedRecords.length}`)
console.log(`Unsecured/Public routes: ${unsecuredOrPublic.length}`)
console.log(`Auth-only mutative routes: ${authOnlyMutative.length}`)
console.log(`Report written: ${reportPath}`)
