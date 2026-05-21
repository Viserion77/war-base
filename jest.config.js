export default {
    testEnvironment: 'node',
    testMatch: ['<rootDir>/tests/**/*.test.js'],
    transform: {},
    collectCoverageFrom: ['server.js', 'public/**/*.js', 'ai/**/*.js'],
    coverageReporters: ['text', 'lcov'],
    coverageThreshold: {
        global: {
            statements: 100,
            branches: 100,
            functions: 100,
            lines: 100,
        },
    },
}
