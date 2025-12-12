# Usage Examples

Practical examples for using the Threads to Notion Sync extension.

## Table of Contents

- [Basic Setup](#basic-setup)
- [API Integration Examples](#api-integration-examples)
- [Custom Field Mapping](#custom-field-mapping)
- [Programmatic Control](#programmatic-control)
- [Advanced Workflows](#advanced-workflows)
- [Troubleshooting](#troubleshooting)

---

## Basic Setup

### Example 1: First-Time Configuration

```javascript
// After installing the extension:

// 1. Click extension icon → "설정하기"
// 2. Complete OAuth flows

// Threads OAuth
document.getElementById('threadsLoginBtn').click();
// → Redirects to Meta login
// → Returns with access token
// → Saves to chrome.storage.local

// Notion OAuth
document.getElementById('notionLoginBtn').click();
// → Redirects to Notion login
// → Duplicates template database
// → Returns with integration token
```

### Example 2: Database Selection

```javascript
// After connecting Notion, load databases
const result = await chrome.runtime.sendMessage({
  type: 'LIST_DATABASES'
});

console.log('Available databases:', result);
// [
//   { id: 'abc123', title: '콘텐츠 캘린더', icon: '📅' },
//   { id: 'def456', title: 'Blog Posts', icon: '✍️' }
// ]

// Select database
document.getElementById('notionDbSelect').value = 'abc123';

// Load fields
const fields = await loadNotionFields();
// Auto-matches fields to Thread properties
```

### Example 3: Manual Sync

```javascript
// Trigger immediate sync from popup
document.getElementById('syncNowBtn').addEventListener('click', async () => {
  const result = await chrome.runtime.sendMessage({
    type: 'SYNC_NOW'
  });

  if (result.success) {
    console.log(`✓ Synced ${result.syncedCount} threads`);
    console.log(`↷ Skipped ${result.skippedCount} threads`);
  } else {
    console.error('✗ Sync failed:', result.error);
  }
});
```

---

## API Integration Examples

### Example 4: Fetching User Threads

```javascript
import * as threadsApi from './api/threads.js';

// Get user info
const { user } = await threadsApi.testConnection(accessToken);
console.log(`Logged in as @${user.username}`);

// Fetch recent threads
const response = await threadsApi.getUserThreads(accessToken, {
  limit: 25
});

response.data.forEach(thread => {
  console.log(`[${thread.id}] ${thread.text}`);
});
```

### Example 5: Getting Thread Statistics

```javascript
import * as threadsApi from './api/threads.js';

// Fetch insights for a specific thread
const threadId = 'thread_12345';
const insights = await threadsApi.getThreadInsights(accessToken, threadId);

console.log('Thread Performance:');
console.log(`  Views: ${insights.views}`);
console.log(`  Likes: ${insights.likes}`);
console.log(`  Replies: ${insights.replies}`);
console.log(`  Reposts: ${insights.reposts}`);
console.log(`  Quotes: ${insights.quotes}`);
```

### Example 6: Account-Level Analytics

```javascript
import * as threadsApi from './api/threads.js';

// Get 7-day account insights
const weekStats = await threadsApi.getAccountInsights(accessToken, {
  period: 7
});

console.log('This Week:');
console.log(`  Total Views: ${weekStats.views}`);
console.log(`  Total Likes: ${weekStats.likes}`);
console.log(`  Followers: ${weekStats.followers_count}`);

// Get 30-day insights
const monthStats = await threadsApi.getAccountInsights(accessToken, {
  period: 30
});

console.log('\nThis Month:');
console.log(`  Total Views: ${monthStats.views}`);
```

### Example 7: Creating Notion Pages

```javascript
import * as notionApi from './api/notion.js';

// Define field mapping
const fieldMapping = {
  title: 'Name',
  content: 'Content',
  createdAt: 'Created',
  sourceUrl: 'URL',
  views: 'Views',
  likes: 'Likes',
  replies: 'Replies'
};

// Create page from thread
const thread = {
  id: 'thread_123',
  title: 'My First Thread',
  text: 'This is my first thread post!',
  url: 'https://threads.net/@user/post/123',
  createdAt: '2024-12-12T10:00:00Z',
  views: 100,
  likes: 10,
  replies: 5
};

const page = await notionApi.createPage(
  notionSecret,
  databaseId,
  thread,
  fieldMapping
);

console.log(`Created Notion page: ${page.id}`);
console.log(`URL: https://notion.so/${page.id.replace(/-/g, '')}`);
```

### Example 8: Updating Page Statistics

```javascript
import * as notionApi from './api/notion.js';

// Update existing page with new stats
const pageId = 'existing-page-id';
const updatedStats = {
  views: 150,    // +50 views
  likes: 15,     // +5 likes
  replies: 7,    // +2 replies
  reposts: 3,    // +1 repost
  quotes: 2      // +1 quote
};

await notionApi.updatePageStats(
  notionSecret,
  pageId,
  updatedStats,
  fieldMapping
);

console.log('✓ Statistics updated');
```

### Example 9: Listing Notion Databases

```javascript
import * as notionApi from './api/notion.js';

// Get all accessible databases
const databases = await notionApi.listDatabases(notionSecret);

console.log(`Found ${databases.length} databases:`);
databases.forEach(db => {
  console.log(`  ${db.icon || '📄'} ${db.title} (${db.id})`);
});

// Filter by name
const contentDb = databases.find(db =>
  db.title.includes('콘텐츠')
);
console.log('Content database:', contentDb);
```

---

## Custom Field Mapping

### Example 10: Advanced Field Mapping

```javascript
// Custom mapping with all available fields
const customMapping = {
  // Required fields
  title: 'Post Title',
  content: 'Description',
  createdAt: 'Published Date',
  sourceUrl: 'Original Link',

  // Statistics fields
  views: 'View Count',
  likes: 'Like Count',
  replies: 'Comment Count',
  reposts: 'Share Count',
  quotes: 'Quote Count',

  // Metadata fields
  username: 'Author'
};

// Save mapping
await chrome.storage.local.set({ fieldMapping: customMapping });

// Apply mapping in sync
const result = await syncThreadToNotion(thread, {
  ...settings,
  fieldMapping: customMapping
});
```

### Example 11: Conditional Field Mapping

```javascript
// Map fields based on database schema
async function smartFieldMapping(databaseId, notionSecret) {
  const db = await notionApi.getDatabase(notionSecret, databaseId);
  const properties = db.properties;

  const mapping = {};

  // Find title field (required by Notion)
  const titleProp = Object.entries(properties)
    .find(([_, prop]) => prop.type === 'title');
  if (titleProp) {
    mapping.title = titleProp[0];
  }

  // Find rich text fields
  const textProps = Object.entries(properties)
    .filter(([_, prop]) => prop.type === 'rich_text')
    .map(([name]) => name);

  if (textProps.includes('Content')) {
    mapping.content = 'Content';
  } else if (textProps[0]) {
    mapping.content = textProps[0];
  }

  // Find number fields for stats
  const numberProps = Object.entries(properties)
    .filter(([_, prop]) => prop.type === 'number')
    .map(([name]) => name);

  const statFields = ['Views', 'Likes', 'Replies', 'Reposts', 'Quotes'];
  statFields.forEach(field => {
    if (numberProps.includes(field)) {
      mapping[field.toLowerCase()] = field;
    }
  });

  return mapping;
}

// Usage
const mapping = await smartFieldMapping(dbId, secret);
console.log('Generated mapping:', mapping);
```

---

## Programmatic Control

### Example 12: Monitoring Sync Status

```javascript
// Get current sync status
async function checkSyncStatus() {
  const status = await chrome.runtime.sendMessage({
    type: 'GET_SYNC_STATUS'
  });

  console.log('Sync Status:');
  console.log(`  Configured: ${status.isConfigured}`);
  console.log(`  Currently Syncing: ${status.isSyncing}`);
  console.log(`  Auto Sync: ${status.autoSync}`);
  console.log(`  Interval: ${status.syncInterval} minutes`);
  console.log(`  Last Sync: ${status.lastSyncTime || 'Never'}`);
  console.log(`  Recent Success: ${status.recentStats.success}`);
  console.log(`  Recent Failures: ${status.recentStats.failed}`);

  return status;
}

// Monitor status periodically
setInterval(checkSyncStatus, 60000); // Every minute
```

### Example 13: Historical Sync

```javascript
// Sync all threads from a specific date
async function syncHistorical(fromDate) {
  const result = await chrome.runtime.sendMessage({
    type: 'SYNC_FROM_DATE',
    fromDate: fromDate // '2024-01-01' or null for all
  });

  if (result.success) {
    console.log(`
      Historical Sync Complete:
      - Synced: ${result.syncedCount} threads
      - Skipped: ${result.skippedCount} threads
      - Errors: ${result.errors?.length || 0}
    `);

    if (result.errors) {
      console.error('Failed threads:', result.errors);
    }
  }

  return result;
}

// Sync all threads ever posted
await syncHistorical(null);

// Sync from January 1, 2024
await syncHistorical('2024-01-01');
```

### Example 14: Token Management

```javascript
// Check token expiration
async function checkToken() {
  const status = await chrome.runtime.sendMessage({
    type: 'GET_TOKEN_STATUS'
  });

  console.log('Token Status:');
  console.log(`  Has Token: ${status.hasToken}`);
  console.log(`  Has App Secret: ${status.hasAppSecret}`);
  console.log(`  Expires At: ${status.expiresAt}`);
  console.log(`  Days Remaining: ${status.remainingDays}`);
  console.log(`  Is Expired: ${status.isExpired}`);
  console.log(`  Expiring Soon: ${status.isExpiringSoon}`);

  // Refresh if expiring soon
  if (status.isExpiringSoon) {
    console.log('Token expiring soon, refreshing...');
    const refreshResult = await chrome.runtime.sendMessage({
      type: 'REFRESH_TOKEN'
    });
    console.log('Refresh result:', refreshResult);
  }

  return status;
}

// Check token daily
chrome.alarms.create('tokenCheck', { periodInMinutes: 1440 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'tokenCheck') {
    checkToken();
  }
});
```

### Example 15: Statistics Aggregation

```javascript
// Get insights for multiple periods
async function getCompleteInsights() {
  const [week, month, quarter, allTime] = await Promise.all([
    chrome.runtime.sendMessage({
      type: 'GET_AGGREGATED_INSIGHTS',
      period: 7
    }),
    chrome.runtime.sendMessage({
      type: 'GET_AGGREGATED_INSIGHTS',
      period: 30
    }),
    chrome.runtime.sendMessage({
      type: 'GET_AGGREGATED_INSIGHTS',
      period: 90
    }),
    chrome.runtime.sendMessage({
      type: 'GET_AGGREGATED_INSIGHTS',
      period: 90 // 90 represents "all time"
    })
  ]);

  return {
    week,
    month,
    quarter,
    allTime
  };
}

// Display insights
const insights = await getCompleteInsights();
console.log('Weekly Views:', insights.week.views);
console.log('Monthly Views:', insights.month.views);
console.log('All-Time Views:', insights.allTime.views);

// Calculate growth
const weeklyGrowth = insights.week.views;
const monthlyGrowth = insights.month.views - insights.week.views;
console.log(`Week: ${weeklyGrowth} | Rest of Month: ${monthlyGrowth}`);
```

---

## Advanced Workflows

### Example 16: Custom Sync Filter

```javascript
// Sync only threads with specific criteria
async function syncFiltered(filterFn) {
  const settings = await chrome.storage.local.get([
    'threadsAccessToken',
    'notionSecret',
    'notionDatabaseId',
    'fieldMapping'
  ]);

  // Fetch all threads
  const allThreads = await threadsApi.getAllUserThreads(
    settings.threadsAccessToken
  );

  // Apply filter
  const filtered = allThreads.filter(filterFn);

  console.log(`Filtered to ${filtered.length} threads`);

  // Sync each
  let syncedCount = 0;
  for (const thread of filtered) {
    try {
      const insights = await threadsApi.getThreadInsights(
        settings.threadsAccessToken,
        thread.id
      );

      await notionApi.createPage(
        settings.notionSecret,
        settings.notionDatabaseId,
        { ...thread, ...insights },
        settings.fieldMapping
      );

      syncedCount++;
    } catch (error) {
      console.error(`Failed to sync ${thread.id}:`, error);
    }
  }

  return { syncedCount, total: filtered.length };
}

// Examples:

// Sync only threads with >100 views
await syncFiltered(thread =>
  thread.views > 100
);

// Sync only threads with images
await syncFiltered(thread =>
  thread.mediaType === 'IMAGE'
);

// Sync only threads from this month
await syncFiltered(thread => {
  const threadDate = new Date(thread.createdAt);
  const now = new Date();
  return threadDate.getMonth() === now.getMonth() &&
         threadDate.getFullYear() === now.getFullYear();
});
```

### Example 17: Batch Statistics Update

```javascript
// Update stats for all synced threads
async function refreshAllStats() {
  const settings = await chrome.storage.local.get([
    'threadsAccessToken',
    'notionSecret',
    'fieldMapping'
  ]);

  const mappings = await chrome.runtime.sendMessage({
    type: 'GET_THREAD_MAPPINGS'
  });

  console.log(`Updating stats for ${mappings.length} threads...`);

  let updated = 0;
  let failed = 0;

  for (const mapping of mappings) {
    try {
      // Fetch latest insights
      const insights = await threadsApi.getThreadInsights(
        settings.threadsAccessToken,
        mapping.threadId
      );

      // Update Notion page
      await notionApi.updatePageStats(
        settings.notionSecret,
        mapping.notionPageId,
        insights,
        settings.fieldMapping
      );

      updated++;

      // Rate limit: 3 req/sec for Notion
      await new Promise(resolve => setTimeout(resolve, 350));
    } catch (error) {
      console.error(`Failed to update ${mapping.threadId}:`, error);
      failed++;
    }
  }

  console.log(`✓ Updated: ${updated} | ✗ Failed: ${failed}`);
  return { updated, failed };
}

// Schedule daily update
chrome.alarms.create('dailyStatsUpdate', {
  when: Date.now() + 1000,
  periodInMinutes: 1440 // 24 hours
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'dailyStatsUpdate') {
    refreshAllStats();
  }
});
```

### Example 18: Export to CSV

```javascript
// Export sync history to CSV
async function exportSyncHistory() {
  const history = await chrome.runtime.sendMessage({
    type: 'GET_SYNC_HISTORY',
    limit: 1000
  });

  // Convert to CSV
  const headers = ['Timestamp', 'Thread ID', 'Title', 'Status', 'Notion Page ID', 'Error'];
  const rows = history.map(entry => [
    entry.timestamp,
    entry.threadId,
    entry.title || '',
    entry.status,
    entry.notionPageId || '',
    entry.error || ''
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  // Download
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sync-history-${Date.now()}.csv`;
  a.click();

  console.log('✓ Exported sync history');
}
```

### Example 19: Custom Dashboard Widget

```javascript
// Create a real-time stats widget
class ThreadsStatsWidget {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.refreshInterval = 60000; // 1 minute
    this.init();
  }

  async init() {
    await this.render();
    setInterval(() => this.render(), this.refreshInterval);
  }

  async render() {
    const insights = await chrome.runtime.sendMessage({
      type: 'GET_AGGREGATED_INSIGHTS',
      period: 7
    });

    const status = await chrome.runtime.sendMessage({
      type: 'GET_SYNC_STATUS'
    });

    this.container.innerHTML = `
      <div class="stats-widget">
        <h3>This Week</h3>
        <div class="stat">
          <span class="label">Views</span>
          <span class="value">${insights.views.toLocaleString()}</span>
        </div>
        <div class="stat">
          <span class="label">Likes</span>
          <span class="value">${insights.likes.toLocaleString()}</span>
        </div>
        <div class="stat">
          <span class="label">Followers</span>
          <span class="value">${insights.followers_count.toLocaleString()}</span>
        </div>
        <div class="sync-status ${status.isSyncing ? 'syncing' : ''}">
          ${status.isSyncing ? '🔄 Syncing...' : '✓ Up to date'}
        </div>
      </div>
    `;
  }
}

// Usage
const widget = new ThreadsStatsWidget('statsContainer');
```

### Example 20: Automated Reporting

```javascript
// Generate weekly performance report
async function generateWeeklyReport() {
  const insights = await chrome.runtime.sendMessage({
    type: 'GET_AGGREGATED_INSIGHTS',
    period: 7
  });

  const mappings = await chrome.runtime.sendMessage({
    type: 'GET_THREAD_MAPPINGS'
  });

  // Filter last week's threads
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const weekThreads = mappings.filter(m =>
    new Date(m.postCreatedAt) >= oneWeekAgo
  );

  // Find best performing thread
  const bestThread = weekThreads.reduce((best, current) =>
    (current.insights?.views || 0) > (best.insights?.views || 0) ? current : best
  , weekThreads[0]);

  // Calculate averages
  const avgViews = insights.views / weekThreads.length;
  const avgLikes = insights.likes / weekThreads.length;

  // Generate report
  const report = `
    📊 Weekly Performance Report
    ═══════════════════════════

    Period: ${oneWeekAgo.toDateString()} - ${new Date().toDateString()}

    📈 Summary
    ├─ Total Posts: ${weekThreads.length}
    ├─ Total Views: ${insights.views.toLocaleString()}
    ├─ Total Likes: ${insights.likes.toLocaleString()}
    ├─ Total Replies: ${insights.replies.toLocaleString()}
    └─ Followers: ${insights.followers_count.toLocaleString()}

    📊 Averages
    ├─ Views per post: ${Math.round(avgViews).toLocaleString()}
    └─ Likes per post: ${Math.round(avgLikes).toLocaleString()}

    🏆 Top Performer
    ├─ Title: ${bestThread?.title || 'N/A'}
    ├─ Views: ${(bestThread?.insights?.views || 0).toLocaleString()}
    └─ Engagement: ${(bestThread?.insights?.likes || 0).toLocaleString()} likes

    🎯 Engagement Rate
    └─ ${((insights.likes / insights.views) * 100).toFixed(2)}%
  `;

  console.log(report);
  return report;
}

// Schedule weekly report (Mondays at 9 AM)
chrome.alarms.create('weeklyReport', {
  when: getNextMonday9AM(),
  periodInMinutes: 7 * 24 * 60 // Weekly
});

function getNextMonday9AM() {
  const now = new Date();
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  nextMonday.setHours(9, 0, 0, 0);
  return nextMonday.getTime();
}
```

---

## Troubleshooting

### Example 21: Debugging Failed Syncs

```javascript
// Diagnose sync failures
async function diagnoseSync() {
  console.log('🔍 Diagnosing sync issues...\n');

  // 1. Check configuration
  const isConfigured = await chrome.storage.local.get([
    'threadsAccessToken',
    'notionSecret',
    'notionDatabaseId'
  ]);

  console.log('Configuration:');
  console.log(`  ✓ Threads Token: ${isConfigured.threadsAccessToken ? 'Present' : '✗ Missing'}`);
  console.log(`  ✓ Notion Secret: ${isConfigured.notionSecret ? 'Present' : '✗ Missing'}`);
  console.log(`  ✓ Database ID: ${isConfigured.notionDatabaseId ? 'Present' : '✗ Missing'}`);

  // 2. Test API connections
  console.log('\nAPI Connections:');

  if (isConfigured.threadsAccessToken) {
    const threadsTest = await threadsApi.testConnection(
      isConfigured.threadsAccessToken
    );
    console.log(`  Threads API: ${threadsTest.success ? '✓ Connected' : '✗ ' + threadsTest.error}`);
  }

  if (isConfigured.notionSecret) {
    const notionTest = await notionApi.testConnection(
      isConfigured.notionSecret
    );
    console.log(`  Notion API: ${notionTest.success ? '✓ Connected' : '✗ ' + notionTest.error}`);
  }

  // 3. Check recent errors
  const history = await chrome.runtime.sendMessage({
    type: 'GET_SYNC_HISTORY',
    limit: 20
  });

  const errors = history.filter(h => h.status === 'failed');
  console.log(`\nRecent Errors: ${errors.length}`);
  errors.forEach(err => {
    console.log(`  ✗ ${err.threadId}: ${err.error}`);
  });

  // 4. Check storage usage
  chrome.storage.local.getBytesInUse(null, bytes => {
    const mb = (bytes / 1024 / 1024).toFixed(2);
    console.log(`\nStorage: ${mb} MB / 10 MB`);
  });
}

// Run diagnostics
await diagnoseSync();
```

### Example 22: Clearing Stuck State

```javascript
// Reset sync state if stuck
async function resetSyncState() {
  console.log('🔄 Resetting sync state...');

  // Clear sync lock (in case stuck)
  // Note: This is handled in background.js via isSyncing flag

  // Clear last sync time to force full sync
  await chrome.storage.local.remove('lastSyncTime');
  console.log('✓ Cleared last sync time');

  // Clear alarm and recreate
  await chrome.alarms.clear('syncThreads');
  const options = await chrome.storage.local.get('syncOptions');
  chrome.alarms.create('syncThreads', {
    periodInMinutes: options.syncOptions?.syncInterval || 5
  });
  console.log('✓ Reset sync alarm');

  console.log('✓ Sync state reset. Try syncing again.');
}
```

### Example 23: Validating Field Mapping

```javascript
// Verify field mapping compatibility
async function validateFieldMapping() {
  const settings = await chrome.storage.local.get([
    'notionSecret',
    'notionDatabaseId',
    'fieldMapping'
  ]);

  const db = await notionApi.getDatabase(
    settings.notionSecret,
    settings.notionDatabaseId
  );

  console.log('🔍 Validating field mapping...\n');

  const mapping = settings.fieldMapping;
  const properties = db.properties;

  // Check each mapped field
  const requiredFields = ['title', 'content', 'createdAt', 'sourceUrl'];
  const statFields = ['views', 'likes', 'replies', 'reposts', 'quotes'];

  requiredFields.forEach(field => {
    const notionField = mapping[field];
    const exists = properties[notionField];
    const status = exists ? '✓' : '✗';
    console.log(`${status} ${field} → ${notionField} (${exists?.type || 'NOT FOUND'})`);
  });

  console.log('\nStatistics Fields:');
  statFields.forEach(field => {
    const notionField = mapping[field];
    if (notionField) {
      const exists = properties[notionField];
      const status = exists ? '✓' : '✗';
      console.log(`${status} ${field} → ${notionField} (${exists?.type || 'NOT FOUND'})`);
    } else {
      console.log(`⊘ ${field} (not mapped)`);
    }
  });
}
```

---

## Conclusion

These examples cover:
- Basic configuration and setup
- API integration patterns
- Custom field mapping strategies
- Programmatic control via messages
- Advanced workflows and automation
- Troubleshooting and debugging

For more information, see:
- [API Reference](API_REFERENCE.md)
- [Architecture Overview](ARCHITECTURE.md)
- [README](../README.md)
