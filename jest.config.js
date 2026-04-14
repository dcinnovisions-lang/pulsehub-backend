/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/src/__tests__/**/*.test.js'],
  // Run setup before tests to inject env vars
  setupFiles: ['./src/__tests__/helpers/setup.js'],
  // Suppress console.log noise from production code during tests
  silent: false,
  verbose: true,
  // Collect coverage from controllers and middleware
  collectCoverageFrom: [
    'src/controllers/**/*.js',
    'src/middleware/**/*.js',
    '!src/**/__tests__/**',
  ],
  coverageReporters: ['text', 'lcov'],
  // Increase timeout for any async DB-style mock operations
  testTimeout: 10000,
};
