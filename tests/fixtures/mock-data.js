/**
 * Mock Data Fixtures for Testing
 * Provides realistic test data for Threads and Notion APIs
 */

// Mock Threads User Data
export const mockThreadsUser = {
  id: '123456789',
  username: 'testuser',
  threads_profile_picture_url: 'https://example.com/profile.jpg'
};

// Mock Threads Post Data
export const mockThreadPost = {
  id: 'thread_123',
  text: 'This is a test thread post with some content',
  title: 'This is a test thread post with some...',
  imageUrl: null,
  mediaType: 'TEXT',
  url: 'https://www.threads.net/@testuser/post/thread_123',
  createdAt: '2024-12-10T10:00:00.000Z',
  username: 'testuser',
  isQuotePost: false,
  hashtags: ['test', 'demo'],
  views: 1000,
  likes: 50,
  replies: 10,
  reposts: 5,
  quotes: 2
};

// Mock Threads API Response
export const mockThreadsApiResponse = {
  data: [
    {
      id: 'thread_123',
      text: 'This is a test thread post with some content',
      timestamp: '2024-12-10T10:00:00.000Z',
      media_type: 'TEXT',
      media_url: null,
      permalink: 'https://www.threads.net/@testuser/post/thread_123',
      username: 'testuser',
      is_quote_post: false
    },
    {
      id: 'thread_456',
      text: 'Another test post #testing',
      timestamp: '2024-12-09T15:30:00.000Z',
      media_type: 'IMAGE',
      media_url: 'https://example.com/image.jpg',
      permalink: 'https://www.threads.net/@testuser/post/thread_456',
      username: 'testuser',
      is_quote_post: false
    }
  ],
  paging: {
    cursors: {
      after: 'cursor_123'
    }
  }
};

// Mock Threads Insights Data
export const mockThreadInsights = {
  views: 1000,
  likes: 50,
  replies: 10,
  reposts: 5,
  quotes: 2
};

// Mock Account Insights
export const mockAccountInsights = {
  views: 5000,
  likes: 250,
  replies: 50,
  reposts: 25,
  quotes: 10,
  followers_count: 150,
  period: 7,
  fetchedAt: '2024-12-10T10:00:00.000Z'
};

// Mock Notion User
export const mockNotionUser = {
  object: 'user',
  id: 'notion_user_123',
  name: 'Test User',
  avatar_url: 'https://example.com/avatar.jpg',
  type: 'person',
  person: {
    email: 'test@example.com'
  }
};

// Mock Notion Database
export const mockNotionDatabase = {
  object: 'database',
  id: 'db_123',
  title: [
    {
      type: 'text',
      text: {
        content: 'Threads Archive'
      },
      plain_text: 'Threads Archive'
    }
  ],
  icon: {
    type: 'emoji',
    emoji: '🧵'
  },
  properties: {
    Name: {
      id: 'title',
      type: 'title',
      title: {}
    },
    Content: {
      id: 'content',
      type: 'rich_text',
      rich_text: {}
    },
    Created: {
      id: 'created',
      type: 'date',
      date: {}
    },
    URL: {
      id: 'url',
      type: 'url',
      url: {}
    },
    Views: {
      id: 'views',
      type: 'number',
      number: {
        format: 'number'
      }
    },
    Likes: {
      id: 'likes',
      type: 'number',
      number: {
        format: 'number'
      }
    }
  }
};

// Mock Notion Page Response
export const mockNotionPage = {
  object: 'page',
  id: 'page_123',
  created_time: '2024-12-10T10:00:00.000Z',
  last_edited_time: '2024-12-10T10:00:00.000Z',
  parent: {
    type: 'database_id',
    database_id: 'db_123'
  },
  properties: {
    Name: {
      id: 'title',
      type: 'title',
      title: [
        {
          type: 'text',
          text: {
            content: 'Test Thread'
          }
        }
      ]
    }
  },
  url: 'https://www.notion.so/page_123'
};

// Mock Storage Data
export const mockStorageData = {
  threadsAccessToken: 'test_threads_token_123',
  threadsAppSecret: 'test_app_secret_123',
  threadsTokenExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days from now
  notionSecret: 'test_notion_secret_123',
  notionDatabaseId: 'db_123',
  fieldMapping: {
    title: 'Name',
    content: 'Content',
    createdAt: 'Created',
    sourceUrl: 'URL',
    views: 'Views',
    likes: 'Likes',
    replies: 'Replies',
    reposts: 'Reposts',
    quotes: 'Quotes'
  },
  syncOptions: {
    autoSync: true,
    syncInterval: 5,
    dailyStatsRefresh: true
  },
  syncHistory: [
    {
      id: 'sync_1',
      threadId: 'thread_123',
      notionPageId: 'page_123',
      status: 'success',
      timestamp: '2024-12-10T10:00:00.000Z',
      title: 'Test Thread'
    }
  ],
  lastSyncTime: '2024-12-10T10:00:00.000Z',
  syncedThreadIds: ['thread_123', 'thread_456'],
  threadPageMappings: [
    {
      threadId: 'thread_123',
      notionPageId: 'page_123',
      sourceUrl: 'https://www.threads.net/@testuser/post/thread_123',
      postCreatedAt: '2024-12-10T10:00:00.000Z',
      title: 'Test Thread',
      insights: mockThreadInsights,
      insightsUpdatedAt: '2024-12-10T10:00:00.000Z',
      createdAt: '2024-12-10T10:00:00.000Z'
    }
  ]
};

// Mock Sync Status
export const mockSyncStatus = {
  isConfigured: true,
  isSyncing: false,
  lastSyncTime: '2024-12-10T10:00:00.000Z',
  autoSync: true,
  syncInterval: 5,
  recentStats: {
    success: 10,
    failed: 1,
    total: 11
  }
};

// Mock Sync Result
export const mockSyncResult = {
  success: true,
  syncedCount: 3,
  skippedCount: 2,
  errors: []
};

// Mock Token Status
export const mockTokenStatus = {
  hasToken: true,
  hasAppSecret: true,
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  remainingDays: 30,
  isExpired: false,
  isExpiringSoon: false
};

// Mock OAuth Response
export const mockOAuthResponse = {
  access_token: 'test_access_token_123',
  token_type: 'bearer',
  expires_in: 5184000, // 60 days in seconds
  user_id: '123456789'
};

// Error Messages
export const mockErrors = {
  networkError: new Error('Network request failed'),
  authError: new Error('Authentication failed'),
  notFoundError: new Error('Resource not found'),
  rateLimitError: new Error('Rate limit exceeded'),
  validationError: new Error('Validation failed')
};

// DOM Elements Mock Data
export const mockDOMElements = {
  button: {
    id: 'testButton',
    textContent: 'Click Me',
    disabled: false
  },
  input: {
    id: 'testInput',
    value: 'test value',
    type: 'text'
  },
  select: {
    id: 'testSelect',
    value: 'option1',
    options: [
      { value: '', textContent: 'Select...' },
      { value: 'option1', textContent: 'Option 1' },
      { value: 'option2', textContent: 'Option 2' }
    ]
  }
};
