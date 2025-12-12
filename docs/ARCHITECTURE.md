# Architecture Overview

## System Architecture

Threads to Notion Sync is a Chrome Extension (Manifest V3) that synchronizes Threads posts to Notion databases with real-time analytics.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Chrome Extension                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────┐      ┌─────────────────────────────────┐   │
│  │  Content       │      │  Background Service Worker      │   │
│  │  Script        │─────▶│  (Core Logic)                   │   │
│  │  (Threads.net) │      │  - Sync Management              │   │
│  └────────────────┘      │  - Token Refresh                │   │
│                           │  - Statistics Aggregation       │   │
│                           └──────────┬──────────────────────┘   │
│                                      │                           │
│  ┌────────────────┐                 │                           │
│  │  Popup UI      │◀────────────────┤                           │
│  │  (Quick Stats) │                 │                           │
│  └────────────────┘                 │                           │
│                                      │                           │
│  ┌────────────────┐                 │                           │
│  │  Options Page  │◀────────────────┤                           │
│  │  (Config)      │                 │                           │
│  └────────────────┘                 │                           │
│                                      │                           │
│  ┌────────────────┐                 │                           │
│  │  Dashboard     │◀────────────────┘                           │
│  │  (Analytics)   │                                              │
│  └────────────────┘                                              │
│                                                                   │
└───────────────────────────┬──────────────┬──────────────────────┘
                            │              │
                    ┌───────▼─────┐  ┌────▼───────┐
                    │  Threads    │  │  Notion    │
                    │  Graph API  │  │  API       │
                    └─────────────┘  └────────────┘
```

## Core Components

### 1. Background Service Worker

**File:** `src/background.js`

**Responsibilities:**
- Central message hub for all extension components
- Manages synchronization lifecycle
- Handles Chrome alarms (periodic sync, daily stats refresh, token checks)
- Token expiration management
- Statistics aggregation
- Error handling and notifications

**Key Patterns:**
- Event-driven architecture
- Message passing between components
- Alarm-based scheduling
- State management via Chrome Storage

**Lifecycle:**
```
Extension Install/Update
         │
         ▼
Setup Alarms (Sync, Stats, Token)
         │
         ▼
┌────────────────────────┐
│  Listen for:           │
│  - Alarms              │
│  - Messages            │
│  - Storage Changes     │
└────────────────────────┘
         │
         ▼
Handle Events → Execute Logic → Update Storage → Notify UI
```

### 2. Content Script

**File:** `src/content.js`

**Responsibilities:**
- Monitors Threads webpage DOM
- Detects new post creations
- Extracts post metadata
- Communicates with background worker

**Injection Context:**
- Runs on `threads.net` domains
- Has access to page DOM
- Isolated from page JavaScript

**Detection Strategy:**
- MutationObserver for DOM changes
- Click listener on post buttons
- Post element data extraction

### 3. Storage Layer

**File:** `src/storage/storage.js`

**Responsibilities:**
- Abstracts Chrome Storage API
- Provides typed getters/setters
- Manages data persistence
- Handles data migrations

**Storage Design:**
```
Chrome Storage Local
├── Authentication
│   ├── threadsAccessToken
│   ├── threadsAppSecret
│   ├── threadsTokenExpiresAt
│   └── notionSecret
├── Configuration
│   ├── notionDatabaseId
│   ├── fieldMapping
│   └── syncOptions
└── Sync Data
    ├── syncHistory
    ├── syncedThreadIds
    ├── threadPageMappings
    └── lastSyncTime
```

### 4. API Clients

#### Notion Client (`src/api/notion.js`)

**Capabilities:**
- Database listing and querying
- Page creation with rich content
- Property updates
- Rate limiting (3 req/sec)
- Automatic pagination

**Rate Limiting Implementation:**
```javascript
const REQUEST_DELAY = 334; // ~3 requests per second
let lastRequestTime = 0;

async function waitForRateLimit() {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < REQUEST_DELAY) {
    await sleep(REQUEST_DELAY - elapsed);
  }
  lastRequestTime = Date.now();
}
```

#### Threads Client (`src/api/threads.js`)

**Capabilities:**
- User authentication
- Thread retrieval with pagination
- Per-thread insights (views, likes, etc.)
- Account-level insights
- Token exchange and refresh

**Pagination Pattern:**
```javascript
async function getAllUserThreads(accessToken, options) {
  const allThreads = [];
  let cursor = null;

  do {
    const response = await getUserThreads(accessToken, {
      ...options,
      after: cursor
    });

    allThreads.push(...response.data);
    cursor = response.paging?.cursors?.after;
  } while (cursor);

  return allThreads;
}
```

### 5. UI Components

#### Popup (`src/ui/popup.js` + `popup.html`)

**Features:**
- Quick sync status
- Recent activity feed
- Compact statistics (7d, 30d, all-time)
- One-click manual sync

**Design Pattern:**
```javascript
async function init() {
  await loadStatus();
  setupEventListeners();
  renderUI();
}

async function loadStatus() {
  const status = await chrome.runtime.sendMessage({
    type: 'GET_SYNC_STATUS'
  });
  updateUI(status);
}
```

#### Options (`src/ui/options.js` + `options.html`)

**Features:**
- OAuth login flows (Threads & Notion)
- Database selection
- Field mapping configuration
- Historical sync settings
- Connection testing

**OAuth Flow:**
```
User clicks "Login with Threads"
         │
         ▼
chrome.identity.launchWebAuthFlow()
         │
         ▼
Meta OAuth Dialog
         │
         ▼
Redirect with code
         │
         ▼
Exchange code for token (via proxy server)
         │
         ▼
Save token to storage
         │
         ▼
Update UI to show connected state
```

#### Dashboard (`src/ui/dashboard.js` + `dashboard.html`)

**Features:**
- Chart.js visualizations
- 7-day views chart
- Best posting time analysis
- Engagement rate calculations
- Thread history table

**Data Flow:**
```
Load Dashboard
     │
     ├─ Fetch user info
     ├─ Fetch insights (7d, 30d, 90d)
     ├─ Fetch thread mappings
     └─ Fetch sync history
     │
     ▼
Update Charts
     ├─ Daily views bar chart
     ├─ Day-of-week analysis
     └─ Time-of-day analysis
     │
     ▼
Render Tables
     └─ Thread history with stats
```

## Data Flow

### Synchronization Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Trigger (Alarm or Manual)                                     │
└─────────────────────┬───────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Verify Configuration                                          │
│    - Threads token present?                                      │
│    - Notion credentials present?                                 │
│    - Database configured?                                        │
└─────────────────────┬───────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Authenticate & Fetch Threads                                  │
│    - Verify user identity (GET /me)                              │
│    - Fetch threads (GET /me/threads)                             │
│    - Filter by lastSyncTime                                      │
└─────────────────────┬───────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Process Each Thread                                           │
│    ├─ Validate ownership (username match)                        │
│    ├─ Check if already synced (storage lookup)                   │
│    ├─ Fetch thread insights (GET /{thread-id}/insights)          │
│    └─ Create Notion page (POST /pages)                           │
└─────────────────────┬───────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Update Storage                                                │
│    ├─ Add to syncedThreadIds                                     │
│    ├─ Add to threadPageMappings                                  │
│    ├─ Add to syncHistory                                         │
│    └─ Update lastSyncTime                                        │
└─────────────────────┬───────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. Notify User                                                   │
│    └─ Show Chrome notification with results                      │
└─────────────────────────────────────────────────────────────────┘
```

### Statistics Refresh Flow

```
Daily at 9 AM (or manual trigger)
         │
         ▼
Fetch threadPageMappings from storage
         │
         ▼
Identify refresh targets:
├─ Threads without insights (backfill)
└─ Threads created in last 7 days (update)
         │
         ▼
For each thread:
├─ GET /{thread-id}/insights from Threads API
├─ PATCH /pages/{page-id} to update Notion
└─ Update storage mapping with new insights
         │
         ▼
Show completion notification
```

## State Management

### Sync State

```javascript
// Global state in background worker
let isSyncing = false;

// Prevents concurrent syncs
if (isSyncing) {
  return { success: false, message: 'Sync already in progress' };
}
```

### Configuration State

```javascript
// Stored in chrome.storage.local
{
  isConfigured: boolean,     // All required fields present
  autoSync: boolean,          // Enable automatic sync
  syncInterval: number,       // Minutes between syncs
  dailyStatsRefresh: boolean  // Enable 9 AM refresh
}
```

### Sync History State

```javascript
// Array of sync attempts (max 500)
[
  {
    id: string,
    threadId: string,
    notionPageId: string | null,
    status: 'success' | 'failed',
    timestamp: string,
    title: string,
    error?: string
  }
]
```

## Error Handling Strategy

### Hierarchical Error Handling

```
┌─────────────────────────────────────┐
│  User-Facing Layer                  │
│  - Chrome notifications             │
│  - UI error messages                │
│  - Status indicators                │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Application Layer                  │
│  - Try-catch blocks                 │
│  - Error logging                    │
│  - Graceful degradation             │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  API Layer                          │
│  - Retry with exponential backoff   │
│  - Rate limit handling              │
│  - Network error recovery           │
└─────────────────────────────────────┘
```

### Retry Logic

```javascript
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;

      const delay = baseDelay * Math.pow(2, attempt);
      await sleep(delay);
    }
  }
}
```

### Error Categories

1. **Configuration Errors**
   - Missing tokens
   - Invalid database ID
   - Expired credentials

2. **Network Errors**
   - API timeouts
   - Rate limit exceeded
   - Connection failures

3. **Data Errors**
   - Invalid thread format
   - Missing required fields
   - Notion schema mismatch

4. **Authentication Errors**
   - Expired token
   - Invalid credentials
   - Insufficient permissions

## Performance Optimization

### 1. Incremental Sync

Only sync threads created after `lastSyncTime`:

```javascript
const lastSyncTime = await storage.getLastSyncTime();
const newThreads = lastSyncTime
  ? allThreads.filter(t => new Date(t.createdAt) > new Date(lastSyncTime))
  : allThreads;
```

### 2. Deduplication

Track synced thread IDs to prevent duplicates:

```javascript
const alreadySynced = await storage.isThreadSynced(thread.id);
if (alreadySynced) {
  skippedCount++;
  continue;
}
```

### 3. Pagination

Fetch threads in batches to avoid memory issues:

```javascript
const response = await getUserThreads(accessToken, {
  limit: 50,  // Reasonable batch size
  after: cursor
});
```

### 4. Rate Limiting

Respect API limits with delays:

```javascript
// Notion: 3 req/sec
await waitForRateLimit();

// Stats refresh: 350ms between requests
await new Promise(resolve => setTimeout(resolve, 350));
```

### 5. Selective Refresh

Only refresh stats for:
- Threads without insights (one-time backfill)
- Threads created in last 7 days (active period)

```javascript
const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

const toRefresh = mappings.filter(m =>
  !m.insights || new Date(m.postCreatedAt) >= sevenDaysAgo
);
```

## Security Architecture

### Token Storage

```
┌─────────────────────────────────────┐
│  Chrome Storage Local (Encrypted)   │
├─────────────────────────────────────┤
│  threadsAccessToken                 │
│  threadsAppSecret (optional)        │
│  notionSecret                       │
└─────────────────────────────────────┘
         │
         │ Never sent to 3rd parties
         │ Only used for API calls
         ▼
┌─────────────────────────────────────┐
│  Direct API Communication           │
├─────────────────────────────────────┤
│  Threads Graph API                  │
│  Notion API                         │
└─────────────────────────────────────┘
```

### OAuth Flow Security

```
Extension
    │
    ├─ Initiates OAuth with Meta/Notion
    │
    ▼
User approves on official Meta/Notion site
    │
    ▼
Redirect to chrome-extension:// with code
    │
    ▼
Exchange code for token via proxy server
    │
    ▼
Proxy server:
├─ Never logs tokens
├─ Ephemeral (serverless function)
└─ Returns token immediately
    │
    ▼
Extension stores token locally
```

### Permissions Minimization

```javascript
// manifest.json permissions
{
  "permissions": [
    "storage",        // Configuration only
    "alarms",         // Scheduled tasks
    "notifications",  // User feedback
    "identity"        // OAuth flows
  ],
  "host_permissions": [
    "https://threads.net/*",      // Content script
    "https://api.notion.com/*",   // API calls
    "https://graph.threads.net/*" // API calls
  ]
}
```

## Scalability Considerations

### Current Limits

- **Storage:** Chrome Storage Local (10 MB)
  - Sync history: 500 entries
  - Thread mappings: 500 entries
  - Synced IDs: 500 entries

- **Notion API:** 3 requests/second
  - Handled with 334ms delays

- **Threads API:** Standard Graph API limits
  - Pagination in chunks of 50

### Growth Strategy

If user has >500 threads:
1. Keep most recent 500 in storage
2. Older threads remain in Notion
3. Historical analysis from Notion query

If API rate limits increase:
1. Adjust REQUEST_DELAY constant
2. Increase batch sizes
3. Parallel requests (if allowed)

## Testing Strategy

### Manual Testing Checklist

1. **Installation**
   - [ ] Fresh install shows options page
   - [ ] Alarms are set up correctly

2. **Configuration**
   - [ ] Threads OAuth completes
   - [ ] Notion OAuth completes
   - [ ] Database list loads
   - [ ] Fields auto-match

3. **Synchronization**
   - [ ] Manual sync works
   - [ ] Automatic sync works
   - [ ] Duplicate prevention works
   - [ ] Error handling works

4. **Statistics**
   - [ ] Insights fetch correctly
   - [ ] Dashboard displays data
   - [ ] Charts render properly
   - [ ] Best time analysis accurate

5. **Token Management**
   - [ ] Token expiration detected
   - [ ] Token refresh succeeds
   - [ ] Notifications shown

### Debug Tools

```javascript
// View all storage
chrome.storage.local.get(null, console.log);

// Trigger sync manually
chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, console.log);

// Check token status
chrome.runtime.sendMessage({ type: 'GET_TOKEN_STATUS' }, console.log);

// View alarms
chrome.alarms.getAll(console.log);
```

## Extension Lifecycle

### Install

```
chrome.runtime.onInstalled
         │
         ▼
Open options page
         │
         ▼
Setup alarms:
├─ syncThreads (1-60 min intervals)
├─ dailyStatsRefresh (9 AM daily)
└─ tokenRefreshCheck (24 hours)
```

### Startup

```
Service Worker Activated
         │
         ▼
Restore state from storage
         │
         ▼
Listen for:
├─ chrome.alarms.onAlarm
├─ chrome.runtime.onMessage
└─ chrome.storage.onChanged
```

### Update

```
Extension Updated
         │
         ▼
chrome.runtime.onInstalled (reason: 'update')
         │
         ▼
Re-setup alarms (in case of changes)
         │
         ▼
Resume normal operation
```

## Future Architecture Considerations

### Potential Enhancements

1. **Webhook-based Sync**
   - Real-time sync via Notion/Threads webhooks
   - Reduces polling frequency

2. **Batch Operations**
   - Bulk page creation
   - Batch stats updates

3. **Local Database**
   - IndexedDB for larger storage
   - Offline support

4. **Worker Threads**
   - Heavy computation off main thread
   - Non-blocking UI

5. **Progressive Sync**
   - Sync most recent first
   - Backfill older posts in background

### Migration Path

```
Current: Client-Only Extension
         │
         ▼
Future: Extension + Optional Server
         │
         ├─ Extension: UI & immediate sync
         └─ Server: Batch processing & webhooks
```

## Dependencies

### Runtime Dependencies

```javascript
// No external dependencies in production
// Pure JavaScript + Chrome APIs
{
  "chrome": "built-in",
  "fetch": "built-in",
  "Chart.js": "loaded via CDN in dashboard"
}
```

### Development Dependencies

```bash
# None - pure JavaScript
# Optional:
# - ESLint for linting
# - Prettier for formatting
```

## Build Process

```bash
#!/bin/bash
# build.sh

# Create distribution directory
mkdir -p dist

# Copy files
cp manifest.json dist/
cp -r src dist/
cp -r icons dist/
cp -r ui dist/

# Create zip for Chrome Web Store
cd dist
zip -r ../extension.zip .
cd ..

echo "Build complete: extension.zip"
```

## Monitoring & Logging

### Console Logging Strategy

```javascript
// Info logs
console.log('Background service worker started');
console.log(`Synced ${count} threads`);

// Error logs
console.error('Sync failed:', error);
console.warn('Token expiring soon');

// Debug logs (verbose)
console.log('Processing thread:', threadId);
```

### User Notifications

```javascript
showNotification(
  'Title',
  'Message',
  'info' | 'success' | 'error'
);
```

### Error Tracking

```javascript
// Store errors in sync history
await storage.addSyncHistoryEntry({
  status: 'failed',
  error: error.message,
  timestamp: new Date().toISOString()
});
```

## Conclusion

This architecture provides:
- **Reliability:** Retry logic, error handling, duplicate prevention
- **Performance:** Incremental sync, rate limiting, caching
- **Security:** Local token storage, minimal permissions, OAuth
- **Maintainability:** Modular design, clear separation of concerns
- **Scalability:** Pagination, storage limits, efficient algorithms

The extension follows Chrome Extension best practices and Manifest V3 requirements while providing a robust synchronization solution between Threads and Notion.
