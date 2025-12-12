# Testing Quick Start Guide

## Installation

```bash
# Install test dependencies
npm install

# Verify installation
npm test -- --version
```

## Running Tests

### Basic Commands

```bash
# Run all tests
npm test

# Run tests in watch mode (auto-rerun on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run tests with detailed output
npm run test:verbose
```

### Targeted Testing

```bash
# Run specific test file
npm test -- tests/unit/storage/storage.test.js

# Run tests matching pattern
npm test -- --testNamePattern="Token"

# Run only unit tests
npm test -- tests/unit

# Run only integration tests
npm test -- tests/integration
```

## Understanding Test Output

### Successful Test Run
```
PASS tests/unit/shared/utils.test.js
  Utility Functions
    sleep
      ✓ should wait for specified milliseconds (105ms)
      ✓ should return a promise (2ms)

Test Suites: 6 passed, 6 total
Tests:       151 passed, 151 total
Time:        2.543s
```

### Failed Test
```
FAIL tests/unit/api/threads.test.js
  Threads API Module
    testConnection
      ✕ should return success with user data (50ms)

  ● Threads API Module › testConnection › should return success

    expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: false
```

### Coverage Report
```
----------------------|---------|----------|---------|---------|
File                  | % Stmts | % Branch | % Funcs | % Lines |
----------------------|---------|----------|---------|---------|
All files             |   85.67 |    78.45 |   88.23 |   86.12 |
 src/shared/utils.js  |   95.00 |    90.00 |  100.00 |   95.00 |
 src/storage/         |   90.23 |    85.12 |   95.45 |   90.67 |
 src/api/threads.js   |   88.45 |    82.30 |   92.00 |   88.90 |
 src/api/notion.js    |   87.12 |    80.45 |   90.23 |   87.56 |
----------------------|---------|----------|---------|---------|
```

## Common Testing Scenarios

### 1. Before Committing Code

```bash
# Run full test suite
npm test

# If passing, you're good to commit!
git commit -m "Your commit message"
```

### 2. After Making Changes

```bash
# Watch mode - tests auto-rerun on save
npm run test:watch

# Make your changes
# Watch tests update in real-time
```

### 3. Checking Coverage

```bash
# Generate coverage report
npm run test:coverage

# Open HTML report in browser
open coverage/lcov-report/index.html
```

### 4. Debugging a Failing Test

```bash
# Run only the failing test with verbose output
npm test -- --testNamePattern="failing test name" --verbose

# Or add console.log() and run:
npm test -- tests/unit/specific-file.test.js
```

## Writing Your First Test

### 1. Create Test File
Create `tests/unit/my-module.test.js`:

```javascript
import { myFunction } from '../../src/my-module.js';

describe('My Module', () => {
  it('should do something', () => {
    const result = myFunction('input');
    expect(result).toBe('expected output');
  });
});
```

### 2. Run Your Test
```bash
npm test -- tests/unit/my-module.test.js
```

### 3. See It Pass!
```
PASS tests/unit/my-module.test.js
  My Module
    ✓ should do something (3ms)
```

## Test File Structure

```javascript
// Import what you're testing
import { functionName } from '../../src/module.js';
import { mockData } from '../fixtures/mock-data.js';

// Describe the module
describe('Module Name', () => {

  // Setup before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Describe a function or feature
  describe('functionName', () => {

    // Test case 1
    it('should handle normal case', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = functionName(input);

      // Assert
      expect(result).toBe('expected');
    });

    // Test case 2
    it('should handle error case', () => {
      expect(() => functionName(null))
        .toThrow('Error message');
    });
  });
});
```

## Common Assertions

```javascript
// Equality
expect(value).toBe(expected);           // Strict equality (===)
expect(value).toEqual(expected);        // Deep equality

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeUndefined();
expect(value).toBeDefined();

// Numbers
expect(number).toBeGreaterThan(3);
expect(number).toBeLessThan(10);
expect(float).toBeCloseTo(0.3, 5);      // 5 decimal places

// Strings
expect(string).toMatch(/regex/);
expect(string).toContain('substring');

// Arrays
expect(array).toContain(item);
expect(array).toHaveLength(3);

// Objects
expect(object).toHaveProperty('key');
expect(object).toMatchObject({ key: 'value' });

// Async
await expect(promise).resolves.toBe(value);
await expect(promise).rejects.toThrow(error);

// Functions
expect(fn).toHaveBeenCalled();
expect(fn).toHaveBeenCalledTimes(2);
expect(fn).toHaveBeenCalledWith(arg1, arg2);
```

## Mocking Examples

### Mock a Function
```javascript
const mockFn = jest.fn();
mockFn.mockReturnValue('mocked value');
mockFn.mockResolvedValue('async value');
mockFn.mockRejectedValue(new Error('error'));

// Call it
mockFn('arg');

// Verify
expect(mockFn).toHaveBeenCalledWith('arg');
```

### Mock Chrome APIs
```javascript
// Already mocked in setup.js
chrome.storage.local.get.mockResolvedValue({ key: 'value' });
chrome.runtime.sendMessage.mockResolvedValue({ success: true });
```

### Mock Fetch
```javascript
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: async () => ({ data: 'mock data' })
  })
);
```

## Troubleshooting

### Tests Fail with "Cannot find module"
- Check file paths (use relative paths from test file)
- Ensure files are exported properly

### "Chrome API not defined"
- Verify `tests/setup.js` is in `setupFilesAfterEnv`
- Check jest.config in package.json

### Tests Timeout
```javascript
// Increase timeout for specific test
it('slow test', async () => {
  // ...
}, 10000); // 10 seconds

// Or globally
jest.setTimeout(10000);
```

### Flaky Tests (Pass Sometimes, Fail Sometimes)
- Use `jest.useFakeTimers()` for time-dependent code
- Mock external dependencies properly
- Avoid relying on execution timing

### "Cannot read property of undefined"
- Check that mocks are set up in beforeEach
- Verify mock data structure matches what code expects

## Best Practices

### ✅ DO
- Write tests before fixing bugs
- Test one thing per test case
- Use descriptive test names
- Mock external dependencies
- Clean up after tests (beforeEach/afterEach)
- Test edge cases (null, empty, large values)

### ❌ DON'T
- Test implementation details
- Write tests that depend on each other
- Use real API calls in tests
- Forget to clean up mocks
- Skip error cases
- Write overly complex tests

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v2

    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '18'

    - name: Install dependencies
      run: npm install

    - name: Run tests
      run: npm test -- --coverage

    - name: Upload coverage
      uses: codecov/codecov-action@v2
      with:
        files: ./coverage/lcov.info
```

## Quick Reference Card

```bash
# Install
npm install

# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage

# Specific file
npm test -- path/to/file.test.js

# Pattern match
npm test -- --testNamePattern="pattern"

# Update snapshots
npm test -- -u

# Debug
npm test -- --verbose
```

## Getting Help

1. **Check test output** - Error messages usually point to the problem
2. **Read test documentation** - See `tests/README.md`
3. **Check coverage report** - See `TEST_COVERAGE_REPORT.md`
4. **Consult Jest docs** - https://jestjs.io/docs/getting-started

## Next Steps

After mastering the basics:
1. Read `tests/README.md` for detailed documentation
2. Review `TEST_COVERAGE_REPORT.md` for coverage analysis
3. Explore existing tests in `tests/unit/` for examples
4. Write tests for new features before implementing them (TDD)
5. Aim for >80% coverage on new code

Happy Testing! 🧪
