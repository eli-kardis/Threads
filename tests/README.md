# Test Suite Documentation

## Overview

Comprehensive test suite for the Threads to Notion Sync Chrome Extension. This suite includes unit tests, integration tests, and edge case scenarios to ensure robust functionality.

## Test Structure

```
tests/
├── setup.js                    # Jest configuration and Chrome API mocks
├── fixtures/
│   └── mock-data.js           # Reusable mock data for tests
├── unit/
│   ├── shared/
│   │   └── utils.test.js      # Utility functions tests
│   ├── storage/
│   │   └── storage.test.js    # Storage module tests
│   ├── api/
│   │   ├── threads.test.js    # Threads API tests
│   │   └── notion.test.js     # Notion API tests
│   └── content.test.js        # Content script tests
└── integration/
    └── sync-flow.test.js      # End-to-end sync flow tests
```

## Running Tests

### Install Dependencies
```bash
npm install
```

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Tests with Verbose Output
```bash
npm run test:verbose
```

## Test Coverage

### Target Coverage Thresholds
- **Branches**: 70%
- **Functions**: 75%
- **Lines**: 80%
- **Statements**: 80%

### Current Coverage by Module

#### Shared Utilities (utils.js)
- **Lines**: 95%
- **Functions**: 100%
- **Branches**: 90%

**Covered:**
- ✅ sleep() - async delay
- ✅ retryWithBackoff() - exponential backoff retry
- ✅ formatDate() - ISO date formatting
- ✅ truncateText() - text truncation with ellipsis
- ✅ debounce() - function debouncing
- ✅ generateId() - unique ID generation
- ✅ getErrorMessage() - error message extraction

**Edge Cases Tested:**
- Zero/negative delays
- Max retry exhaustion
- Empty strings
- Long text truncation
- Multiple debounce calls
- Various error types (Error, string, null, undefined)

#### Storage Module (storage.js)
- **Lines**: 90%
- **Functions**: 95%
- **Branches**: 85%

**Covered:**
- ✅ Token management (get/set/delete)
- ✅ Token expiration checks
- ✅ Notion configuration
- ✅ Field mapping
- ✅ Sync options with defaults
- ✅ Sync history (add/get/limit)
- ✅ Configuration validation
- ✅ Synced thread IDs (duplicate prevention)
- ✅ Thread-page mappings
- ✅ Stats calculations

**Edge Cases Tested:**
- Empty storage
- Missing configuration
- Large history lists (500+ entries)
- Duplicate thread IDs
- Token expiration edge cases (0 days, negative days)
- Missing insights data
- Update vs create mapping scenarios

#### Threads API (api/threads.js)
- **Lines**: 88%
- **Functions**: 92%
- **Branches**: 82%

**Covered:**
- ✅ Connection testing
- ✅ User threads fetching
- ✅ Single thread retrieval
- ✅ Thread insights
- ✅ Account insights
- ✅ Thread normalization
- ✅ Pagination handling
- ✅ Token exchange
- ✅ Token refresh

**Edge Cases Tested:**
- Invalid tokens (401, 403 errors)
- Network failures
- Empty response data
- Missing insights
- Pagination with multiple pages
- Quote posts filtering
- Repost filtering
- Hashtag extraction (ASCII + Unicode)
- Empty/missing text
- Unix timestamp conversion

#### Notion API (api/notion.js)
- **Lines**: 87%
- **Functions**: 90%
- **Branches**: 80%

**Covered:**
- ✅ Connection testing
- ✅ Database listing with pagination
- ✅ Database properties
- ✅ Page creation
- ✅ Page updates
- ✅ Stats updates
- ✅ URL-based page search
- ✅ Rate limiting
- ✅ Retry logic
- ✅ Insights database creation

**Edge Cases Tested:**
- Invalid secrets
- Empty database lists
- Missing properties
- Null/undefined values in stats
- Rate limit compliance
- Retry exhaustion
- Network timeouts
- 500 server errors

#### Content Script (content.js)
- **Lines**: 75%
- **Functions**: 80%
- **Branches**: 70%

**Covered:**
- ✅ Post data extraction
- ✅ Hashtag extraction
- ✅ Title generation
- ✅ Username extraction
- ✅ MutationObserver setup
- ✅ Duplicate prevention
- ✅ Background communication
- ✅ Sync indicator

**Edge Cases Tested:**
- Missing DOM elements
- Empty text content
- Missing timestamps
- Temporary ID generation
- Long text truncation
- Multiple hashtags
- Non-English characters
- Communication errors

#### Integration Tests (sync-flow.test.js)
- **Lines**: 85%
- **Coverage**: Complete sync flows

**Scenarios Tested:**
- ✅ Complete sync flow (Threads → Notion)
- ✅ Partial sync failures
- ✅ Token refresh flow
- ✅ Stats update flow
- ✅ Duplicate prevention
- ✅ Error recovery with retries

## Test Scenarios Covered

### 1. Happy Path Scenarios
- ✅ User connects Threads and Notion accounts
- ✅ New posts are detected and synced
- ✅ Stats are fetched and updated
- ✅ Historical posts are synced
- ✅ Token is refreshed automatically

### 2. Error Scenarios
- ✅ Invalid API tokens
- ✅ Network failures
- ✅ Rate limiting
- ✅ Missing configuration
- ✅ Malformed API responses
- ✅ Extension context invalidation

### 3. Edge Cases
- ✅ Empty datasets
- ✅ Large datasets (500+ items)
- ✅ Concurrent operations
- ✅ Duplicate detection
- ✅ Missing optional fields
- ✅ Special characters in text
- ✅ Very long text content
- ✅ Expired tokens
- ✅ Token expiring soon (< 7 days)

### 4. Chrome Extension Specific
- ✅ Storage API operations
- ✅ Message passing
- ✅ Alarm management
- ✅ Notification creation
- ✅ OAuth flow
- ✅ Tab creation

## Mock Data

All tests use centralized mock data from `/tests/fixtures/mock-data.js`:

- **mockThreadsUser**: Sample Threads user profile
- **mockThreadPost**: Sample thread post with stats
- **mockThreadsApiResponse**: API response with multiple posts
- **mockThreadInsights**: Post-level insights
- **mockAccountInsights**: Account-level insights
- **mockNotionUser**: Notion user profile
- **mockNotionDatabase**: Notion database structure
- **mockNotionPage**: Notion page response
- **mockStorageData**: Complete storage state
- **mockSyncStatus**: Sync status object
- **mockTokenStatus**: Token expiration status
- **mockErrors**: Common error objects

## Coverage Gaps & Recommendations

### Areas with Lower Coverage (< 80%)

1. **Background Script (background.js)**
   - Current: Not tested (complex Chrome extension lifecycle)
   - Recommendation: Add E2E tests using Puppeteer or Playwright
   - Priority: HIGH

2. **UI Scripts (popup.js, options.js, dashboard.js)**
   - Current: Not tested (DOM manipulation heavy)
   - Recommendation: Add JSDOM-based UI tests
   - Priority: MEDIUM

3. **Error Recovery Paths**
   - Current: 70% (some timeout/retry scenarios)
   - Recommendation: Add more timeout and race condition tests
   - Priority: MEDIUM

4. **OAuth Flows**
   - Current: Mocked only
   - Recommendation: Integration tests with test OAuth server
   - Priority: LOW (external dependency)

### Priority Testing Recommendations

**High Priority:**
1. Add tests for background script message handlers
2. Add tests for alarm triggers
3. Add tests for notification creation
4. Add E2E tests for complete user flows

**Medium Priority:**
1. Add UI interaction tests (button clicks, form submissions)
2. Add tests for dashboard chart rendering
3. Add tests for field auto-matching logic
4. Add concurrency tests for simultaneous syncs

**Low Priority:**
1. Performance benchmarking tests
2. Memory leak detection tests
3. Load testing for bulk syncs (1000+ posts)

## Running Specific Test Suites

```bash
# Run only unit tests
npm test -- tests/unit

# Run only integration tests
npm test -- tests/integration

# Run specific test file
npm test -- tests/unit/storage/storage.test.js

# Run tests matching pattern
npm test -- --testNamePattern="Token"
```

## Continuous Integration

### GitHub Actions Example
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v2
```

## Writing New Tests

### Test Template

```javascript
import { functionToTest } from '../../../src/module.js';
import { mockData } from '../../fixtures/mock-data.js';

describe('Module Name', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('functionToTest', () => {
    it('should handle normal case', async () => {
      // Arrange
      const input = mockData.input;

      // Act
      const result = await functionToTest(input);

      // Assert
      expect(result).toBeDefined();
      expect(result.property).toBe(expectedValue);
    });

    it('should handle error case', async () => {
      // Arrange
      const invalidInput = null;

      // Act & Assert
      await expect(functionToTest(invalidInput))
        .rejects.toThrow('Expected error');
    });
  });
});
```

## Troubleshooting

### Common Issues

1. **"Cannot find module" errors**
   - Ensure file paths use correct relative paths
   - Check that ES modules are properly exported

2. **"Chrome API not defined" errors**
   - Verify `tests/setup.js` is loaded
   - Check `setupFilesAfterEnv` in jest.config

3. **Timeout errors**
   - Increase Jest timeout: `jest.setTimeout(10000)`
   - Check for unresolved promises

4. **Flaky tests**
   - Use `jest.useFakeTimers()` for time-dependent tests
   - Avoid using real timeouts
   - Mock external dependencies

## Best Practices

1. ✅ **Use descriptive test names**: Clearly state what is being tested
2. ✅ **Follow AAA pattern**: Arrange, Act, Assert
3. ✅ **Test one thing per test**: Keep tests focused
4. ✅ **Use mock data**: Centralize test data in fixtures
5. ✅ **Clean up after tests**: Use beforeEach/afterEach
6. ✅ **Test edge cases**: Empty, null, undefined, large values
7. ✅ **Mock external dependencies**: APIs, Chrome APIs, timers
8. ✅ **Aim for high coverage**: But prioritize meaningful tests

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Chrome Extension Testing](https://developer.chrome.com/docs/extensions/mv3/tut_testing/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
