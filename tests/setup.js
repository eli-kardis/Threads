/**
 * Jest Test Setup for Chrome Extension
 * Mocks Chrome APIs and global objects
 */

// Mock Chrome APIs
global.chrome = {
  runtime: {
    id: 'test-extension-id',
    onInstalled: {
      addListener: jest.fn()
    },
    onMessage: {
      addListener: jest.fn()
    },
    sendMessage: jest.fn((message, callback) => {
      if (callback) callback({});
      return Promise.resolve({});
    }),
    getURL: jest.fn((path) => `chrome-extension://test-extension-id/${path}`),
    openOptionsPage: jest.fn()
  },
  storage: {
    local: {
      get: jest.fn((keys) => Promise.resolve({})),
      set: jest.fn((items) => Promise.resolve()),
      remove: jest.fn((keys) => Promise.resolve()),
      clear: jest.fn(() => Promise.resolve())
    }
  },
  alarms: {
    create: jest.fn(),
    clear: jest.fn(),
    onAlarm: {
      addListener: jest.fn()
    }
  },
  notifications: {
    create: jest.fn()
  },
  identity: {
    launchWebAuthFlow: jest.fn((options) =>
      Promise.resolve(`${options.url}?code=test-auth-code`)
    )
  },
  tabs: {
    create: jest.fn()
  }
};

// Mock fetch API
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve('')
  })
);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
};

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});
