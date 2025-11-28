# Testing Infrastructure

## Overview

This directory contains the test suite for the BinanceUSBot trading application. We use **Jest** with **ts-jest** for TypeScript support.

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with Coverage Report
```bash
npm run test:coverage
```

## Test Structure

```
__tests__/
├── utils/           # Utility function tests
│   ├── constants.test.ts
│   └── structuredLogger.test.ts
└── services/        # Service layer tests (future)
```

## Writing Tests

### Example Test File

```typescript
import { myFunction } from '../../utils/myModule';

describe('MyModule', () => {
  describe('myFunction', () => {
    it('should return expected value', () => {
      const result = myFunction(input);
      expect(result).toBe(expected);
    });
  });
});
```

### Best Practices

1. **Organize by Feature**: Group related tests using `describe()` blocks
2. **Clear Test Names**: Use descriptive `it()` statements that explain what is being tested
3. **Arrange-Act-Assert**: Structure tests with clear setup, execution, and verification
4. **Mock External Dependencies**: Use `jest.mock()` for external services (APIs, databases)
5. **Test Edge Cases**: Include tests for boundary conditions and error scenarios

## Current Test Coverage

### Utils
- ✅ **constants.ts** - 18 tests
  - Exponential backoff calculations
  - Percentage/basis points conversions
  - Formatting functions
  - Constant value validation

- ✅ **structuredLogger.ts** - 21 tests
  - Log level methods (info, warn, error, debug)
  - Specialized logging (signals, orders, trades)
  - Context-aware logging
  - Factory function

## Future Test Additions

### Priority 1 (Low Risk)
- [ ] `utils/password.ts` - Password hashing and validation
- [ ] `utils/auth.ts` - Authentication utilities
- [ ] `models/*` - Database model validation

### Priority 2 (Moderate Risk)
- [ ] `services/executionRouter.ts` - Order execution logic (requires mocking)
- [ ] `services/playbooks/*` - Signal generation (requires market data mocks)

### Priority 3 (High Risk - Requires Careful Mocking)
- [ ] `services/tradingEngine/*` - Core trading engine
- [ ] `services/binanceService.ts` - Exchange integration

## Configuration

See `jest.config.js` for Jest configuration details.

### Key Settings
- **Test Environment**: Node.js
- **Transform**: ts-jest with ESM support
- **Coverage**: Services, utils, and models
- **Timeout**: 10 seconds per test

## Continuous Integration

Tests should be run:
- Before committing code changes
- In CI/CD pipeline before deployment
- After any dependency updates

## Troubleshooting

### Common Issues

**Issue**: `Cannot find module 'X'`
**Solution**: Ensure the module is installed and the import path is correct

**Issue**: `Timeout exceeded`
**Solution**: Increase timeout in `jest.config.js` or use `jest.setTimeout()` in specific tests

**Issue**: `Module not mocked properly`
**Solution**: Ensure `jest.mock()` is called before imports and returns proper mock structure

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [ts-jest Documentation](https://kulshekhar.github.io/ts-jest/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
