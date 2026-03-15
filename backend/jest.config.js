module.exports = {
    testEnvironment: 'node',
    // Coverage
    collectCoverageFrom: [
        'src/services/**/*.js',
        'src/utils/**/*.js',
        'src/middleware/auth.js'
    ],
    coverageDirectory: 'coverage',
    // Ignore
    testPathIgnorePatterns: [
        '/node_modules/',
        '/dist/'
    ],
    // Setup
    verbose: true,
    setupFilesAfterEnv: ['./tests/setup.js']
};
