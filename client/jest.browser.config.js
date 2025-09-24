/**
 * Jest configuration for browser-based tests using Playwright
 */

module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/browser/**/*.test.js'],
    setupFilesAfterEnv: [], // No setup files for browser tests
    moduleNameMapper: {},
    transformIgnorePatterns: [
        'node_modules/(?!(playwright)/)'
    ],
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/**/*.test.js'
    ],
    coverageDirectory: 'coverage-browser',
    coverageReporters: ['text', 'lcov', 'html'],
    testTimeout: 6 * 60 * 1000, // 6 minutes for browser tests
    verbose: true
};