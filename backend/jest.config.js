module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  // index.ts only wires real infrastructure (database, HTTP server, signals) together and is
  // exercised by running the server, not by the interface tests.
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/dev/**'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'text-summary'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ],
};
