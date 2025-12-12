# API Reference

Complete API documentation for the Threads to Notion Sync Chrome Extension.

## Table of Contents

- [Background Service Worker](#background-service-worker)
- [Content Script](#content-script)
- [Storage Module](#storage-module)
- [Notion API Client](#notion-api-client)
- [Threads API Client](#threads-api-client)
- [Shared Utilities](#shared-utilities)
- [UI Modules](#ui-modules)

---

## Background Service Worker

**File:** `/src/background.js`

The core service worker that handles synchronization logic, alarms, and message passing.

### Core Functions

#### `setupSyncAlarm()`

Sets up automatic synchronization alarm based on user preferences.

**Returns:** `Promise<void>`

**Example:**
```javascript
await setupSyncAlarm();
```

#### `setupDailyStatsAlarm(enabled)`

Configures daily statistics refresh alarm for 9:00 AM.

**Parameters:**
- `enabled` (boolean): Whether to enable daily refresh

**Returns:** `Promise<void>`

**Example:**
```javascript
await setupDailyStatsAlarm(true);
```

#### `checkAndRefreshToken()`

Automatically checks and refreshes Threads API token when it's about to expire (within 7 days).

**Returns:** `Promise<Object>`

**Response Format:**
```javascript
{
  success: boolean,
  reason: 'not_expiring_soon' | 'no_token' | 'no_app_secret' | 'refreshed' | 'refresh_failed',
  remainingDays?: number,
  expiresIn?: number,
  error?: string
}
```

**Example:**
```javascript
const result = await checkAndRefreshToken();
if (result.success) {
  console.log(`Token valid for ${result.remainingDays} days`);
}
```

#### `performSync()`

Performs complete synchronization of new threads to Notion.

**Returns:** `Promise<Object>`

**Response Format:**
```javascript
{
  success: boolean,
  syncedCount: number,
  skippedCount: number,
  errors?: Array<{threadId: string, error: string}>,
  message?: string
}
```

**Logic Flow:**
1. Verifies configuration
2. Fetches user identity
3. Retrieves all threads from Threads API
4. Filters threads created after last sync
5. Validates thread ownership
6. Syncs each thread to Notion
7. Updates sync history and last sync time

**Example:**
```javascript
const result = await performSync();
console.log(`Synced ${result.syncedCount} threads, skipped ${result.skippedCount}`);
```

#### `syncFromDate(fromDate)`

Syncs historical threads starting from a specific date.

**Parameters:**
- `fromDate` (string|null): ISO date string or null for all threads

**Returns:** `Promise<Object>`

**Example:**
```javascript
// Sync all threads from 2024-01-01
const result = await syncFromDate('2024-01-01');

// Sync all historical threads
const allResult = await syncFromDate(null);
```

#### `syncThreadToNotion(thread, settings)`

Syncs a single thread to Notion with statistics.

**Parameters:**
- `thread` (Object): Normalized thread object
- `settings` (Object): User settings including API keys and field mapping

**Returns:** `Promise<Object>` - Notion page creation result

**Example:**
```javascript
const result = await syncThreadToNotion(thread, settings);
console.log(`Created Notion page: ${result.id}`);
```

#### `refreshAllPostsStats()`

Refreshes statistics for all synced posts. Targets:
- Posts without insights (backfill)
- Posts created within last 7 days (regular refresh)

**Returns:** `Promise<void>`

**Rate Limiting:** Respects Notion API rate limit (3 req/sec)

**Example:**
```javascript
await refreshAllPostsStats();
```

#### `getAggregatedInsights(period)`

Aggregates insights from storage for dashboard display.

**Parameters:**
- `period` (number): Days to aggregate (7, 30, 90 for all)

**Returns:** `Promise<Object>`

**Response Format:**
```javascript
{
  views: number,
  likes: number,
  replies: number,
  reposts: number,
  quotes: number,
  followers_count: number,
  postCount: number,
  period: number,
  fetchedAt: string (ISO timestamp)
}
```

**Example:**
```javascript
const weekStats = await getAggregatedInsights(7);
const allTimeStats = await getAggregatedInsights(90);
```

### Message Handlers

The background worker responds to the following message types:

#### `SYNC_NOW`

Triggers immediate synchronization.

**Request:**
```javascript
chrome.runtime.sendMessage({ type: 'SYNC_NOW' });
```

**Response:** Same as `performSync()`

#### `GET_SYNC_STATUS`

Returns current synchronization status.

**Response:**
```javascript
{
  isConfigured: boolean,
  isSyncing: boolean,
  lastSyncTime: string,
  autoSync: boolean,
  syncInterval: number,
  recentStats: {
    success: number,
    failed: number,
    total: number
  }
}
```

#### `GET_SYNC_HISTORY`

Retrieves synchronization history.

**Request:**
```javascript
chrome.runtime.sendMessage({
  type: 'GET_SYNC_HISTORY',
  limit: 50
});
```

**Response:** `Array<SyncHistoryEntry>`

#### `REFRESH_TOKEN`

Manually triggers token refresh.

**Request:**
```javascript
chrome.runtime.sendMessage({ type: 'REFRESH_TOKEN' });
```

**Response:** Same as `checkAndRefreshToken()`

#### `GET_TOKEN_STATUS`

Gets current token status.

**Response:**
```javascript
{
  hasToken: boolean,
  hasAppSecret: boolean,
  expiresAt: string | null,
  remainingDays: number | null,
  isExpired: boolean | null,
  isExpiringSoon: boolean
}
```

#### `GET_AGGREGATED_INSIGHTS`

Gets aggregated statistics for a time period.

**Request:**
```javascript
chrome.runtime.sendMessage({
  type: 'GET_AGGREGATED_INSIGHTS',
  period: 7 // or 30, 90
});
```

#### `LIST_DATABASES`

Lists all Notion databases accessible to the integration.

**Response:**
```javascript
[
  {
    id: string,
    title: string,
    icon: string | null
  }
]
```

---

## Content Script

**File:** `/src/content.js`

Monitors Threads webpage for new posts and sends them to background worker.

### Main Functions

#### `init()`

Initializes content script and starts DOM observation.

**Example:**
```javascript
init();
```

#### `observeDOM()`

Sets up MutationObserver to detect DOM changes.

**Implementation Details:**
- Observes `document.body`
- Watches for `childList` changes
- Recursive subtree monitoring

#### `extractPostData(element)`

Extracts post data from a Threads post element.

**Parameters:**
- `element` (HTMLElement): Post container element

**Returns:** `Object | null`

**Response Format:**
```javascript
{
  id: string,
  text: string,
  title: string,
  imageUrl: string | null,
  url: string,
  createdAt: string (ISO),
  hashtags: string[],
  username: string
}
```

**Example:**
```javascript
const postData = extractPostData(postElement);
if (postData) {
  console.log('Extracted:', postData.title);
}
```

#### `extractHashtags(text)`

Extracts hashtags from post text.

**Parameters:**
- `text` (string): Post content

**Returns:** `string[]` - Array of hashtags without '#'

**Example:**
```javascript
const tags = extractHashtags('#javascript #webdev');
// Returns: ['javascript', 'webdev']
```

#### `generateTitle(text)`

Generates post title from content.

**Parameters:**
- `text` (string): Post text

**Returns:** `string` - First 50 characters or "Untitled Thread"

**Example:**
```javascript
const title = generateTitle('This is a long post content...');
// Returns: 'This is a long post content...'
```

#### `showSyncIndicator(success)`

Displays temporary sync status indicator on page.

**Parameters:**
- `success` (boolean): Whether sync was successful

**Visual Effect:**
- Green notification for success
- Red notification for failure
- Auto-dismisses after 3 seconds

---

## Storage Module

**File:** `/src/storage/storage.js`

Abstraction layer for Chrome storage API with typed getters/setters.

### Storage Keys

```javascript
const STORAGE_KEYS = {
  THREADS_TOKEN: 'threadsAccessToken',
  THREADS_APP_SECRET: 'threadsAppSecret',
  THREADS_TOKEN_EXPIRES_AT: 'threadsTokenExpiresAt',
  NOTION_SECRET: 'notionSecret',
  NOTION_DB_ID: 'notionDatabaseId',
  NOTION_INSIGHTS_DB_ID: 'notionInsightsDatabaseId',
  FIELD_MAPPING: 'fieldMapping',
  SYNC_OPTIONS: 'syncOptions',
  SYNC_HISTORY: 'syncHistory',
  LAST_SYNC_TIME: 'lastSyncTime',
  SYNCED_THREAD_IDS: 'syncedThreadIds',
  THREAD_PAGE_MAPPINGS: 'threadPageMappings'
}
```

### API Token Management

#### `setThreadsToken(token)`

Stores Threads API access token.

**Parameters:**
- `token` (string): Access token

**Returns:** `Promise<void>`

#### `getThreadsToken()`

Retrieves Threads API access token.

**Returns:** `Promise<string | null>`

#### `setTokenExpiresAt(expiresAt)`

Stores token expiration timestamp.

**Parameters:**
- `expiresAt` (number): Unix timestamp in milliseconds

**Returns:** `Promise<void>`

#### `isTokenExpiringSoon()`

Checks if token expires within 7 days.

**Returns:** `Promise<boolean>`

**Example:**
```javascript
if (await isTokenExpiringSoon()) {
  console.log('Token needs refresh soon');
}
```

#### `getTokenRemainingDays()`

Calculates remaining days until token expiration.

**Returns:** `Promise<number | null>`

**Example:**
```javascript
const days = await getTokenRemainingDays();
console.log(`Token valid for ${days} more days`);
```

### Sync History Management

#### `addSyncHistoryEntry(entry)`

Adds a synchronization history entry.

**Parameters:**
- `entry` (Object): History entry

**Entry Format:**
```javascript
{
  id: string,
  threadId: string,
  notionPageId: string | null,
  status: 'success' | 'failed',
  timestamp: string (ISO),
  title?: string,
  error?: string
}
```

**Storage Limit:** Keeps most recent 500 entries

**Example:**
```javascript
await addSyncHistoryEntry({
  id: generateId(),
  threadId: 'thread_123',
  notionPageId: 'page_456',
  status: 'success',
  timestamp: new Date().toISOString(),
  title: 'My Thread'
});
```

#### `getSyncHistory(limit)`

Retrieves sync history.

**Parameters:**
- `limit` (number): Maximum entries to return (default: 50)

**Returns:** `Promise<Array<SyncHistoryEntry>>`

### Thread-Page Mapping

#### `addThreadPageMapping(threadId, notionPageId, sourceUrl, postCreatedAt, insights, title)`

Creates or updates mapping between Thread and Notion page.

**Parameters:**
- `threadId` (string): Thread ID
- `notionPageId` (string): Notion page ID
- `sourceUrl` (string): Original Thread URL
- `postCreatedAt` (string): ISO timestamp
- `insights` (Object | null): Stats object
- `title` (string | null): Post title

**Returns:** `Promise<void>`

**Example:**
```javascript
await addThreadPageMapping(
  'thread_123',
  'page_456',
  'https://threads.net/@user/post/123',
  '2024-12-12T10:00:00Z',
  { views: 100, likes: 10, replies: 5, reposts: 2, quotes: 1 },
  'My First Thread'
);
```

#### `updateThreadInsights(threadId, insights)`

Updates only the insights for a specific thread.

**Parameters:**
- `threadId` (string): Thread ID
- `insights` (Object): Stats object

**Returns:** `Promise<boolean>` - Success status

**Example:**
```javascript
const updated = await updateThreadInsights('thread_123', {
  views: 150,
  likes: 15,
  replies: 7,
  reposts: 3,
  quotes: 2
});
```

#### `getThreadPageMappings()`

Retrieves all thread-page mappings.

**Returns:** `Promise<Array<Mapping>>`

**Mapping Format:**
```javascript
{
  threadId: string,
  notionPageId: string,
  sourceUrl: string,
  postCreatedAt: string,
  title: string | null,
  insights: {
    views: number,
    likes: number,
    replies: number,
    reposts: number,
    quotes: number
  },
  insightsUpdatedAt: string (ISO),
  createdAt: string (ISO),
  updatedAt?: string (ISO)
}
```

### Sync Statistics

#### `getSyncStats()`

Calculates synchronization statistics.

**Returns:** `Promise<Object>`

**Response Format:**
```javascript
{
  total: number,           // Total sync attempts
  success: number,         // Successful syncs
  failed: number,          // Failed syncs
  successRate: number,     // Percentage (0-100)
  today: number,           // Successful today
  thisWeek: number,        // Successful this week
  thisMonth: number        // Successful this month
}
```

### Configuration

#### `isConfigured()`

Checks if all required settings are configured.

**Returns:** `Promise<boolean>`

**Checks for:**
- Threads access token
- Notion secret
- Notion database ID

**Example:**
```javascript
if (await isConfigured()) {
  await performSync();
} else {
  console.log('Please configure the extension first');
}
```

#### `getAllSettings()`

Retrieves all configuration settings.

**Returns:** `Promise<Object>`

**Response Format:**
```javascript
{
  threadsToken: string | null,
  notionSecret: string | null,
  notionDbId: string | null,
  fieldMapping: Object | null,
  syncOptions: Object
}
```

---

## Notion API Client

**File:** `/src/api/notion.js`

Client for interacting with Notion API.

### Configuration

```javascript
const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const REQUEST_DELAY = 334; // ~3 req/sec rate limit
```

### Core Functions

#### `testConnection(secret)`

Tests Notion API connection.

**Parameters:**
- `secret` (string): Notion integration secret

**Returns:** `Promise<Object>`

**Response:**
```javascript
{
  success: boolean,
  user?: Object,
  error?: string
}
```

#### `listDatabases(secret)`

Lists all databases shared with the integration.

**Parameters:**
- `secret` (string): Notion integration secret

**Returns:** `Promise<Array>`

**Response Format:**
```javascript
[
  {
    id: string,
    title: string,
    icon: string | null
  }
]
```

**Features:**
- Automatic pagination
- Handles up to 100 databases per page

**Example:**
```javascript
const databases = await listDatabases(secret);
databases.forEach(db => {
  console.log(`${db.icon} ${db.title}`);
});
```

#### `getDatabaseProperties(secret, databaseId)`

Retrieves database schema properties.

**Parameters:**
- `secret` (string): Notion secret
- `databaseId` (string): Database ID

**Returns:** `Promise<Object>` - Properties object

**Example:**
```javascript
const properties = await getDatabaseProperties(secret, dbId);
console.log('Available fields:', Object.keys(properties));
```

#### `createPage(secret, databaseId, threadPost, fieldMapping)`

Creates a new page in Notion database from a thread.

**Parameters:**
- `secret` (string): Notion secret
- `databaseId` (string): Target database ID
- `threadPost` (Object): Thread data with stats
- `fieldMapping` (Object): Field name mapping

**Field Mapping Format:**
```javascript
{
  title: 'Name',           // Title field
  content: 'Content',      // Rich text field
  createdAt: 'Created',    // Date field
  sourceUrl: 'URL',        // URL field
  views: 'Views',          // Number field
  likes: 'Likes',          // Number field
  replies: 'Replies',      // Number field
  reposts: 'Reposts',      // Number field
  quotes: 'Quotes',        // Number field
  username: 'Author'       // Rich text field
}
```

**Returns:** `Promise<Object>` - Created page object

**Features:**
- Automatic retry with exponential backoff (3 attempts)
- Rate limiting compliance
- Includes page content blocks

**Example:**
```javascript
const page = await createPage(
  secret,
  databaseId,
  {
    title: 'My Thread',
    text: 'Thread content...',
    url: 'https://threads.net/@user/post/123',
    createdAt: '2024-12-12T10:00:00Z',
    views: 100,
    likes: 10,
    replies: 5,
    reposts: 2,
    quotes: 1,
    username: 'myusername'
  },
  fieldMapping
);
console.log('Created page:', page.id);
```

#### `updatePageStats(secret, pageId, stats, fieldMapping)`

Updates only statistics fields in an existing page.

**Parameters:**
- `secret` (string): Notion secret
- `pageId` (string): Notion page ID
- `stats` (Object): Updated statistics
- `fieldMapping` (Object): Field mapping

**Stats Format:**
```javascript
{
  views: number,
  likes: number,
  replies: number,
  reposts: number,
  quotes: number
}
```

**Returns:** `Promise<Object | null>` - Update result or null if no fields to update

**Example:**
```javascript
await updatePageStats(
  secret,
  pageId,
  { views: 150, likes: 15, replies: 7, reposts: 3, quotes: 2 },
  fieldMapping
);
```

#### `findPageBySourceUrl(secret, databaseId, sourceUrl, sourceUrlField)`

Searches for a page by its source URL.

**Parameters:**
- `secret` (string): Notion secret
- `databaseId` (string): Database to search
- `sourceUrl` (string): Thread URL to match
- `sourceUrlField` (string): Name of URL field

**Returns:** `Promise<Object | null>` - Page object or null

**Example:**
```javascript
const existingPage = await findPageBySourceUrl(
  secret,
  databaseId,
  'https://threads.net/@user/post/123',
  'URL'
);
```

### Insights Database

#### `createInsightsDatabase(secret, parentPageId)`

Creates a new insights database for storing daily statistics.

**Parameters:**
- `secret` (string): Notion secret
- `parentPageId` (string): Parent page ID

**Database Schema:**
- 날짜 (Title): Date label with period
- 조회수 (Number): Views
- 좋아요 (Number): Likes
- 답글 (Number): Replies
- 리포스트 (Number): Reposts
- 인용 (Number): Quotes
- 팔로워 (Number): Followers count
- 기간 (Select): Period (7일, 14일, 30일, 90일)
- 기록일 (Date): Record date

**Returns:** `Promise<Object>` - Created database

#### `addInsightsEntry(secret, databaseId, insights)`

Adds a daily insights entry.

**Parameters:**
- `secret` (string): Notion secret
- `databaseId` (string): Insights database ID
- `insights` (Object): Aggregated insights

**Insights Format:**
```javascript
{
  views: number,
  likes: number,
  replies: number,
  reposts: number,
  quotes: number,
  followers_count: number,
  period: number (7|14|30|90)
}
```

**Returns:** `Promise<Object>` - Created page

**Example:**
```javascript
await addInsightsEntry(secret, insightsDbId, {
  views: 1000,
  likes: 100,
  replies: 50,
  reposts: 20,
  quotes: 10,
  followers_count: 500,
  period: 7
});
```

#### `hasInsightsForToday(secret, databaseId, period)`

Checks if insights were already recorded today for a specific period.

**Parameters:**
- `secret` (string): Notion secret
- `databaseId` (string): Insights database ID
- `period` (number): Period in days

**Returns:** `Promise<boolean>`

---

## Threads API Client

**File:** `/src/api/threads.js`

Client for Meta Threads Graph API.

### Configuration

```javascript
const THREADS_API_BASE = 'https://graph.threads.net/v1.0';
```

### Authentication

#### `testConnection(accessToken)`

Tests Threads API connection and retrieves user info.

**Parameters:**
- `accessToken` (string): Threads access token

**Returns:** `Promise<Object>`

**Response:**
```javascript
{
  success: boolean,
  user?: {
    id: string,
    username: string,
    threads_profile_picture_url: string
  },
  error?: string
}
```

**Example:**
```javascript
const result = await testConnection(token);
if (result.success) {
  console.log(`Logged in as @${result.user.username}`);
}
```

### Token Management

#### `exchangeForLongLivedToken(shortLivedToken, appSecret)`

Exchanges short-lived token (1 hour) for long-lived token (60 days).

**Parameters:**
- `shortLivedToken` (string): Token from OAuth flow
- `appSecret` (string): Meta app secret

**Returns:** `Promise<Object>`

**Response:**
```javascript
{
  access_token: string,
  token_type: 'bearer',
  expires_in: number (seconds, typically 5184000 = 60 days)
}
```

**Example:**
```javascript
const result = await exchangeForLongLivedToken(shortToken, appSecret);
console.log(`New token expires in ${result.expires_in / 86400} days`);
```

#### `refreshLongLivedToken(longLivedToken)`

Refreshes a long-lived token (extends for another 60 days).

**Parameters:**
- `longLivedToken` (string): Current long-lived token

**Returns:** `Promise<Object>` - Same format as exchange

**Implementation:**
- Uses server proxy to avoid exposing app secret
- Server endpoint: `https://threads-murex-eight.vercel.app/api/refresh`

**Example:**
```javascript
const refreshed = await refreshLongLivedToken(currentToken);
await storage.setThreadsToken(refreshed.access_token);
```

### Content Retrieval

#### `getUserThreads(accessToken, options)`

Retrieves user's threads with pagination support.

**Parameters:**
- `accessToken` (string): Threads access token
- `options` (Object):
  - `limit` (number): Results per page (max 100, default 25)
  - `since` (string): ISO date for filtering
  - `until` (string): ISO date for filtering
  - `after` (string): Pagination cursor

**Returns:** `Promise<Object>`

**Response:**
```javascript
{
  data: Array<Thread>,
  paging: {
    cursors: {
      before: string,
      after: string
    },
    next?: string
  }
}
```

**Thread Format:**
```javascript
{
  id: string,
  text: string,
  timestamp: string (ISO),
  media_type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'CAROUSEL',
  media_url?: string,
  permalink: string,
  username: string,
  is_quote_post: boolean
}
```

**Example:**
```javascript
const result = await getUserThreads(token, {
  limit: 50,
  since: '2024-01-01'
});
console.log(`Found ${result.data.length} threads`);
```

#### `getAllUserThreads(accessToken, options)`

Fetches ALL user threads with automatic pagination.

**Parameters:**
- `accessToken` (string): Access token
- `options` (Object):
  - `since` (string): ISO date filter
  - `until` (string): ISO date filter

**Returns:** `Promise<Array<NormalizedThread>>`

**Features:**
- Automatic pagination handling
- Filters out quote posts and reposts
- Normalizes thread format
- Logs progress

**Example:**
```javascript
const allThreads = await getAllUserThreads(token, {
  since: '2024-01-01'
});
console.log(`Total threads: ${allThreads.length}`);
```

#### `getThread(accessToken, threadId)`

Fetches details of a specific thread.

**Parameters:**
- `accessToken` (string): Access token
- `threadId` (string): Thread ID

**Returns:** `Promise<Thread>`

**Example:**
```javascript
const thread = await getThread(token, 'thread_123');
console.log(thread.text);
```

### Analytics

#### `getThreadInsights(accessToken, threadId)`

Retrieves analytics for a specific thread.

**Parameters:**
- `accessToken` (string): Access token
- `threadId` (string): Thread ID

**Returns:** `Promise<Object>`

**Response:**
```javascript
{
  views: number,
  likes: number,
  replies: number,
  reposts: number,
  quotes: number
}
```

**Fallback:** Returns zeros if insights unavailable

**Example:**
```javascript
const insights = await getThreadInsights(token, 'thread_123');
console.log(`${insights.views} views, ${insights.likes} likes`);
```

#### `getAccountInsights(accessToken, options)`

Retrieves account-level aggregated insights.

**Parameters:**
- `accessToken` (string): Access token
- `options` (Object):
  - `period` (number): Days to aggregate (7, 14, 30, or 90)

**Returns:** `Promise<Object>`

**Response:**
```javascript
{
  views: number,
  likes: number,
  replies: number,
  reposts: number,
  quotes: number,
  followers_count: number,
  period: number,
  fetchedAt: string (ISO),
  error?: string
}
```

**Example:**
```javascript
const weekStats = await getAccountInsights(token, { period: 7 });
console.log(`This week: ${weekStats.views} views, ${weekStats.followers_count} followers`);
```

### Data Normalization

#### `normalizeThread(apiThread, insights)`

Converts API response to standardized format.

**Parameters:**
- `apiThread` (Object): Raw API thread object
- `insights` (Object | null): Optional insights data

**Returns:** `Object` - Normalized thread

**Example:**
```javascript
const normalized = normalizeThread(rawThread, insights);
// Adds: title, hashtags, and ensures all fields present
```

---

## Shared Utilities

**File:** `/src/shared/utils.js`

Common utility functions used across the extension.

### Async Utilities

#### `sleep(ms)`

Pauses execution for specified milliseconds.

**Parameters:**
- `ms` (number): Milliseconds to wait

**Returns:** `Promise<void>`

**Example:**
```javascript
await sleep(1000); // Wait 1 second
console.log('Resumed');
```

#### `retryWithBackoff(fn, maxRetries, baseDelay)`

Retries a function with exponential backoff on failure.

**Parameters:**
- `fn` (Function): Async function to retry
- `maxRetries` (number): Maximum attempts (default: 3)
- `baseDelay` (number): Initial delay in ms (default: 1000)

**Returns:** `Promise<any>` - Function result or throws last error

**Backoff Formula:** `delay = baseDelay * 2^attempt`

**Example:**
```javascript
const result = await retryWithBackoff(
  () => fetch('https://api.example.com/data'),
  3,
  1000
);
// Retries at: 1s, 2s, 4s intervals
```

### String Utilities

#### `truncateText(text, maxLength)`

Truncates text to specified length.

**Parameters:**
- `text` (string): Input text
- `maxLength` (number): Maximum length (default: 100)

**Returns:** `string` - Truncated text with '...' if needed

**Example:**
```javascript
const short = truncateText('This is a very long text...', 20);
// Returns: 'This is a very lo...'
```

#### `formatDate(date)`

Formats date to ISO string.

**Parameters:**
- `date` (Date): Date object

**Returns:** `string` - ISO 8601 format

**Example:**
```javascript
const iso = formatDate(new Date());
// Returns: '2024-12-12T10:30:00.000Z'
```

### Function Utilities

#### `debounce(fn, delay)`

Creates a debounced function that delays execution.

**Parameters:**
- `fn` (Function): Function to debounce
- `delay` (number): Delay in ms (default: 300)

**Returns:** `Function` - Debounced version

**Example:**
```javascript
const debouncedSearch = debounce((query) => {
  console.log('Searching:', query);
}, 500);

// Only logs once after typing stops for 500ms
debouncedSearch('hello');
debouncedSearch('world');
```

### ID Generation

#### `generateId()`

Generates unique ID using timestamp and random string.

**Returns:** `string` - Unique identifier

**Format:** Base-36 timestamp + random string

**Example:**
```javascript
const id = generateId();
// Returns: 'l8x9k2abc4def'
```

### Error Handling

#### `getErrorMessage(error)`

Extracts error message from various error types.

**Parameters:**
- `error` (Error | any): Error object or value

**Returns:** `string` - Error message

**Example:**
```javascript
try {
  throw new Error('Something went wrong');
} catch (err) {
  console.log(getErrorMessage(err)); // 'Something went wrong'
}
```

---

## UI Modules

### Popup

**File:** `/src/ui/popup.js`

Extension popup interface with quick sync and stats overview.

#### Main Functions

**`init()`**
- Initializes popup UI
- Loads current sync status
- Sets up event listeners

**`loadStatus()`**
- Fetches sync status from background
- Renders appropriate UI state

**`renderConfigured()`**
- Displays stats and sync controls
- Shows recent activity
- Fetches insights for multiple periods (7, 30, 90 days)

**`handleSyncNow()`**
- Triggers immediate sync
- Updates button state
- Refreshes UI after sync

**Helper Functions:**

```javascript
formatNumber(num)           // Formats with commas
formatCompactNumber(num)    // Formats as 1K, 1M, etc.
formatRelativeTime(timestamp) // Formats as "2 hours ago"
```

### Options

**File:** `/src/ui/options.js`

Settings page for configuring API tokens and field mappings.

#### OAuth Configuration

```javascript
const THREADS_OAUTH_CONFIG = {
  clientId: '1571587097603276',
  redirectUri: 'https://{extension-id}.chromiumapp.org/callback',
  scope: 'threads_basic,threads_content_publish,threads_manage_insights...',
  tokenServerUrl: 'https://threads-murex-eight.vercel.app/api/token'
}

const NOTION_OAUTH_CONFIG = {
  clientId: '2c6d872b-594c-8027-9cc4-003725828159',
  redirectUri: 'https://{extension-id}.chromiumapp.org/notion-callback',
  tokenServerUrl: 'https://threads-murex-eight.vercel.app/api/notion-token'
}
```

#### Main Functions

**`startThreadsOAuthFlow()`**
- Opens Threads OAuth dialog
- Exchanges code for token
- Saves token and user ID

**`startNotionOAuthFlow()`**
- Opens Notion OAuth dialog
- Duplicates template database
- Saves integration token

**`loadDatabaseList()`**
- Fetches accessible Notion databases
- Populates dropdown
- Auto-selects template database

**`loadNotionFields()`**
- Retrieves database schema
- Populates field mapping dropdowns
- Auto-matches fields by name

**`autoMatchFields(fields)`**
- Automatically matches Notion fields to Thread properties
- Uses keyword matching (e.g., "제목" → title, "조회수" → views)

**`saveSettings()`**
- Saves all configuration
- Updates sync options
- Optionally triggers historical sync

**`syncFromDate()`**
- Syncs threads from specific date
- Shows progress
- Updates status

### Dashboard

**File:** `/src/ui/dashboard.js`

Analytics dashboard with charts and insights.

#### Chart Integration

Uses Chart.js for visualizations:

```javascript
let dailyChart = null;
let currentPeriod = 7; // Default period
```

#### Main Functions

**`loadDashboardData()`**
- Fetches user info, insights, history, mappings
- Updates all dashboard sections

**`updateStatsCards(insights)`**
- Updates main metric cards (views, likes, replies, reposts)

**`updateDailyChart(mappings)`**
- Creates/updates bar chart showing last 7 days
- Aggregates views by post creation date

**`updateRatioStats(totalInsights)`**
- Calculates follower conversion rate
- Shows total views and followers

**`updateBestTimeAnalysis(mappings)`**
- Analyzes best posting times
- Shows day-of-week rankings
- Shows time-of-day rankings

**`calculateEngagementRate(insights)`**
- Computes engagement score
- Weights: likes (1x), replies (2x), reposts (1.5x)
- Returns percentage relative to views

**`updateHistoryTable(history, mappings)`**
- Displays recent threads with stats
- Sortable by creation date
- Links to Notion pages

**Helper Functions:**

```javascript
getLast7DaysViews(mappings)        // Aggregates daily views
updateDayOfWeekStats(mappings)     // Analyzes best days
updateTimeOfDayStats(mappings)     // Analyzes best hours
formatDateTime(timestamp)          // Formats Korean-style dates
```

---

## Message Flow

### Extension Communication Pattern

```
┌─────────────┐         ┌────────────────────┐         ┌─────────────┐
│   Content   │ ─────── │     Background     │ ─────── │  Popup/     │
│   Script    │ Message │  Service Worker    │ Message │  Options    │
│             │ ←────── │                    │ ←────── │             │
└─────────────┘         └────────────────────┘         └─────────────┘
      │                          │                            │
      │                          │                            │
      ▼                          ▼                            ▼
 Detect new              Sync Logic                    User Actions
 posts on                Alarms                       Configuration
 Threads                 Storage                      Display Stats
```

### Common Message Types

| From | Type | Purpose |
|------|------|---------|
| Content | `NEW_POST_DETECTED` | New thread detected |
| Popup | `SYNC_NOW` | Manual sync trigger |
| Popup | `GET_SYNC_STATUS` | Fetch current status |
| Options | `UPDATE_SYNC_OPTIONS` | Save preferences |
| Options | `LIST_DATABASES` | Fetch Notion DBs |
| Dashboard | `GET_AGGREGATED_INSIGHTS` | Fetch analytics |
| Background | `REFRESH_STATS` | Update all stats |

---

## Rate Limiting

### Notion API

**Limit:** 3 requests per second

**Implementation:**
```javascript
const REQUEST_DELAY = 334; // ms between requests
await waitForRateLimit();
```

### Threads API

**Limit:** Standard Graph API limits (varies by endpoint)

**Best Practices:**
- Use pagination cursors
- Limit to 50-100 items per request
- Add delays between bulk operations

---

## Error Handling Patterns

### Standard Error Response

```javascript
try {
  // Operation
  return { success: true, data: result };
} catch (error) {
  console.error('Operation failed:', error);
  return { success: false, error: error.message };
}
```

### Retry Logic

```javascript
await retryWithBackoff(
  async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Request failed');
    return response.json();
  },
  3,      // Max retries
  1000    // Base delay
);
```

### User-Facing Errors

```javascript
showNotification(
  'Error Title',
  'User-friendly error message',
  'error'
);
```

---

## Storage Schema

### Complete Storage Structure

```javascript
{
  // Authentication
  threadsAccessToken: string,
  threadsAppSecret: string,
  threadsTokenExpiresAt: number,
  threadsUserId: string,
  notionSecret: string,
  notionDatabaseId: string,
  notionInsightsDatabaseId: string,
  notionWorkspaceId: string,
  notionWorkspaceName: string,

  // Configuration
  fieldMapping: {
    title: string,
    content: string,
    createdAt: string,
    sourceUrl: string,
    views: string,
    likes: string,
    replies: string,
    reposts: string,
    quotes: string,
    username: string
  },

  syncOptions: {
    autoSync: boolean,
    syncInterval: number,
    dailyStatsRefresh: boolean
  },

  // Sync Data
  lastSyncTime: string (ISO),
  syncedThreadIds: string[],

  syncHistory: [
    {
      id: string,
      threadId: string,
      notionPageId: string | null,
      status: 'success' | 'failed',
      timestamp: string (ISO),
      title: string,
      error?: string
    }
  ],

  threadPageMappings: [
    {
      threadId: string,
      notionPageId: string,
      sourceUrl: string,
      postCreatedAt: string (ISO),
      title: string,
      insights: {
        views: number,
        likes: number,
        replies: number,
        reposts: number,
        quotes: number
      },
      insightsUpdatedAt: string (ISO),
      createdAt: string (ISO),
      updatedAt?: string (ISO)
    }
  ]
}
```

---

## Extension Lifecycle

### Installation

1. `chrome.runtime.onInstalled` fires
2. Opens options page
3. Sets up sync and token refresh alarms

### Regular Operation

1. **Alarm triggers** (every 1-60 minutes based on settings)
2. **Background worker**:
   - Fetches new threads
   - Validates ownership
   - Syncs to Notion
   - Updates statistics
3. **Daily refresh** (9 AM):
   - Backfills missing insights
   - Updates last 7 days stats

### User Interaction

1. User opens popup
2. Popup requests status
3. Background responds with current state
4. User can trigger manual sync
5. Results update in real-time

---

## Security Considerations

### Token Storage

- All tokens stored in `chrome.storage.local`
- Never transmitted to third parties
- App Secret optional (for token refresh)

### API Communication

- Direct communication with Threads/Notion APIs
- OAuth proxy server only for token exchange
- No user data stored on proxy

### Permissions

Required permissions in manifest:
- `storage`: Save configuration
- `alarms`: Schedule syncs
- `notifications`: User feedback
- `identity`: OAuth flows
- `tabs`: Open Notion pages

---

## Performance Optimization

### Pagination

- Fetch in chunks of 50-100 items
- Use cursors for continuation

### Caching

- Synced thread IDs (prevents duplicates)
- Field mappings (reduces API calls)
- Last sync time (incremental updates)

### Batching

- Group stats updates
- Rate limit compliance
- Retry with backoff

---

## Debugging Tips

### Console Logging

Each module logs important events:
```javascript
console.log('Background service worker started');
console.log(`Synced ${syncedCount} threads`);
console.error('Failed to sync thread:', threadId, error);
```

### Inspecting Storage

```javascript
chrome.storage.local.get(null, (data) => {
  console.log('All storage:', data);
});
```

### Testing Sync

```javascript
chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, (response) => {
  console.log('Sync result:', response);
});
```

---

## Version History

**v1.0.0** (Initial Release)
- Basic sync functionality
- OAuth integration
- Statistics tracking
- Dashboard analytics
- Auto-refresh tokens
