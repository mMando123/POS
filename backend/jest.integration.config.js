const baseConfig = require('./jest.config')

module.exports = {
    ...baseConfig,
    testMatch: ['**/tests/integration/**/*.test.js']
}
