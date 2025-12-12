# Threads to Notion Sync

🧵 → 📝 Automatically sync your Threads posts to Notion with real-time analytics

<p align="center">
  <img src="icons/icon128.png" alt="Threads to Notion Sync" width="128" height="128">
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#setup">Setup</a> •
  <a href="#usage">Usage</a> •
  <a href="#documentation">Documentation</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## Overview

Threads to Notion Sync is a powerful Chrome extension that automatically synchronizes your Threads posts to a Notion database, complete with analytics and engagement metrics. Perfect for content creators who want to track their performance and maintain an archive of their social media content.

### Key Highlights

- ✅ **Automatic Sync**: New posts appear in Notion within seconds
- 📊 **Real-Time Analytics**: Track views, likes, replies, and more
- 🎯 **Smart Insights**: Discover your best posting times
- 🔐 **Privacy First**: All data stored locally, no third-party servers
- 🚀 **Zero Configuration**: OAuth integration with template database
- 📈 **Beautiful Dashboard**: Visualize your content performance

---

## Features

### Core Functionality

#### Automatic Synchronization
- **Real-time detection**: Captures new posts as you publish them
- **Scheduled sync**: Automatic periodic updates (configurable interval)
- **Historical sync**: Import all your past threads at once
- **Duplicate prevention**: Smart deduplication ensures no repeated entries

#### Analytics & Insights
- **Post-level metrics**:
  - Views (impressions)
  - Likes (favorites)
  - Replies (comments)
  - Reposts (shares)
  - Quotes (quote tweets)

- **Account-level metrics**:
  - Follower count
  - Total engagement
  - Conversion rates

- **Time-based analysis**:
  - Best day of week to post
  - Optimal posting hours
  - Engagement rate trends

#### Dashboard
- **Interactive charts**: Visualize your last 7 days of activity
- **Performance rankings**: See your top-performing content
- **Engagement analytics**: Calculate and track engagement rates
- **Period comparison**: Compare 7-day, 30-day, and all-time stats

### Advanced Features

#### Token Management
- **Automatic refresh**: Renews your Threads token before expiration
- **Expiration alerts**: Notifies you 7 days before token expires
- **Secure storage**: All tokens encrypted in Chrome's local storage

#### Field Mapping
- **Flexible schema**: Map Threads data to any Notion database structure
- **Auto-detection**: Automatically matches fields by name
- **Custom mappings**: Configure exactly which data goes where

#### Smart Sync
- **Incremental updates**: Only syncs new content since last sync
- **Ownership validation**: Ensures you only sync your own posts
- **Error recovery**: Automatic retry with exponential backoff

---

## Installation

### From Source (Development)

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/threads-to-notion-sync.git
   cd threads-to-notion-sync
   ```

2. **Load in Chrome**
   - Open Chrome and navigate to `chrome://extensions`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the project directory

3. **Verify installation**
   - Extension icon should appear in your toolbar
   - Click icon to open popup

### From Chrome Web Store (Coming Soon)

1. Visit the [Chrome Web Store](#) (link TBD)
2. Click "Add to Chrome"
3. Confirm permissions

---

## Setup

### Prerequisites

- Chrome browser (version 88+)
- Threads account
- Notion account (free plan works)

### Quick Setup (5 minutes)

#### Step 1: Install Extension

Follow the installation steps above.

#### Step 2: Connect Threads

1. Click the extension icon
2. Click "설정하기" (Settings)
3. Click "🧵 Threads로 로그인"
4. Log in with your Meta account
5. Authorize the extension

**What this does:**
- Obtains a 60-day access token
- Verifies your identity
- No password is stored

#### Step 3: Connect Notion

1. In settings, click "📝 Notion으로 연결"
2. Log in to Notion
3. Select a page to share with the integration
4. The template database will be automatically duplicated

**What this does:**
- Creates an integration with your Notion workspace
- Duplicates a pre-configured database template
- Sets up all required fields

#### Step 4: Configure Field Mapping

1. Select your database from the dropdown
2. Click "필드 목록 불러오기" (Load Fields)
3. Fields will be auto-matched
4. Adjust mappings if needed

**Recommended field mappings:**
- Title → 제목 or Name
- Content → 본문 or Content
- Created → 작성일 or Created
- URL → 링크 or URL
- Views → 조회수 or Views
- Likes → 좋아요 or Likes
- Replies → 답글 or Replies

#### Step 5: Start Syncing

1. Click "저장" (Save)
2. Optionally enable "전체 게시글 동기화" to import historical posts
3. Click the extension icon
4. Click "🔄 지금 동기화" to start your first sync

---

## Usage

### Daily Workflow

#### Publishing a Thread

1. Create your thread on [threads.net](https://threads.net)
2. Click "Post"
3. Within seconds, it appears in your Notion database
4. Check the popup to see sync confirmation

#### Viewing Analytics

1. Click extension icon → "📊 대시보드"
2. View your charts and metrics
3. Explore best posting times
4. Check individual thread performance

#### Manual Sync

If you need to trigger a sync manually:
1. Click extension icon
2. Click "🔄 지금 동기화"
3. Wait for confirmation

### Tips & Best Practices

#### For Best Results

- **Post consistently**: Daily posts provide better analytics trends
- **Check dashboard weekly**: Review what content performs best
- **Sync historical posts**: Understand your content history
- **Refresh stats daily**: Keep your metrics up to date

#### Understanding Metrics

**Views (조회수)**
- Number of times your post was seen
- Most important metric for reach

**Engagement Rate**
- Calculated as: (likes + replies×2 + reposts×1.5) / views
- Indicates how compelling your content is

**Best Posting Times**
- Based on engagement rate, not just views
- Consider your audience's timezone
- Test different times to optimize

---

## Documentation

### Complete Documentation

- **[API Reference](docs/API_REFERENCE.md)**: Complete API documentation for all modules
- **[Architecture](docs/ARCHITECTURE.md)**: System design and technical architecture
- **[Usage Examples](docs/USAGE_EXAMPLES.md)**: Code examples and integration patterns

### Quick References

#### Project Structure

```
threads-to-notion-sync/
├── manifest.json              # Extension configuration
├── src/
│   ├── background.js          # Service worker (main logic)
│   ├── content.js             # Page detection script
│   ├── api/
│   │   ├── notion.js          # Notion API client
│   │   └── threads.js         # Threads API client
│   ├── storage/
│   │   └── storage.js         # Data persistence layer
│   ├── shared/
│   │   └── utils.js           # Common utilities
│   └── ui/
│       ├── popup.js           # Popup interface
│       ├── options.js         # Settings page
│       └── dashboard.js       # Analytics dashboard
├── icons/                     # Extension icons
└── docs/                      # Documentation
```

#### Message Types

The extension uses Chrome's message passing API. Common message types:

| Type | Purpose | Response |
|------|---------|----------|
| `SYNC_NOW` | Trigger manual sync | `{success, syncedCount, skippedCount}` |
| `GET_SYNC_STATUS` | Get current status | `{isConfigured, isSyncing, lastSyncTime}` |
| `GET_AGGREGATED_INSIGHTS` | Fetch analytics | `{views, likes, replies, ...}` |
| `REFRESH_TOKEN` | Refresh Threads token | `{success, remainingDays}` |
| `LIST_DATABASES` | List Notion databases | `Array<{id, title, icon}>` |

#### Storage Schema

```javascript
{
  // Authentication
  threadsAccessToken: string,
  notionSecret: string,
  notionDatabaseId: string,

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
    quotes: string
  },

  // Sync State
  lastSyncTime: string,
  syncedThreadIds: string[],
  threadPageMappings: Array<{
    threadId: string,
    notionPageId: string,
    insights: Object
  }>
}
```

---

## Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────┐
│                  Chrome Extension                        │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────┐    ┌──────────────────────────┐        │
│  │  Content    │───▶│  Background Worker       │        │
│  │  Script     │    │  - Sync Logic            │        │
│  └─────────────┘    │  - Token Management      │        │
│                      │  - Stats Aggregation     │        │
│  ┌─────────────┐    └──────────┬───────────────┘        │
│  │  UI Layer   │◀──────────────┘                        │
│  │  - Popup    │                                         │
│  │  - Options  │                                         │
│  │  - Dashboard│                                         │
│  └─────────────┘                                         │
│                                                           │
└───────────────────────┬─────────────┬───────────────────┘
                        │             │
                 ┌──────▼──────┐ ┌───▼────────┐
                 │  Threads    │ │  Notion    │
                 │  Graph API  │ │  API       │
                 └─────────────┘ └────────────┘
```

### Key Components

**Background Service Worker** (`background.js`)
- Handles all synchronization logic
- Manages Chrome alarms for scheduled tasks
- Routes messages between components
- Implements retry logic and error handling

**Content Script** (`content.js`)
- Monitors threads.net for new posts
- Extracts post metadata from DOM
- Detects publish button clicks

**Storage Layer** (`storage/storage.js`)
- Abstracts Chrome Storage API
- Provides type-safe getters/setters
- Handles data migrations

**API Clients**
- `api/notion.js`: Full Notion API v1 client
- `api/threads.js`: Threads Graph API client

### Data Flow

```
1. User posts on Threads
         ↓
2. Content script detects new post
         ↓
3. Sends message to background worker
         ↓
4. Background fetches thread insights
         ↓
5. Creates Notion page with data
         ↓
6. Updates storage with mapping
         ↓
7. Shows success notification
```

### Security

- **Local-first**: All tokens stored in Chrome's encrypted local storage
- **No backend**: Direct API communication only
- **OAuth 2.0**: Secure authentication flows
- **Minimal permissions**: Only essential browser permissions requested

---

## API Integration

### Threads API

**Authentication**: OAuth 2.0 with long-lived tokens (60 days)

**Endpoints used**:
- `GET /me` - User identity
- `GET /me/threads` - List user threads
- `GET /{thread-id}/insights` - Thread statistics
- `GET /me/threads_insights` - Account statistics

**Token Refresh**: Automatic renewal via proxy server

### Notion API

**Authentication**: Integration token via OAuth

**Endpoints used**:
- `POST /search` - Find databases
- `GET /databases/{id}` - Database schema
- `POST /pages` - Create page
- `PATCH /pages/{id}` - Update page

**Rate Limiting**: 3 requests per second (enforced by extension)

---

## Troubleshooting

### Common Issues

#### "Please configure settings first"

**Solution**: Complete the setup process:
1. Connect Threads (get access token)
2. Connect Notion (get integration token)
3. Select a database
4. Map fields
5. Save settings

#### Sync not working

**Check**:
1. Token expiration: Settings → Check token status
2. Database access: Ensure database is shared with integration
3. Field mapping: Verify all required fields are mapped

**Debug**:
```javascript
// Open console (F12) and run:
chrome.runtime.sendMessage({ type: 'TEST_CONNECTIONS' }, console.log);
```

#### Missing statistics

**Cause**: Threads API limits insights to posts created after Business account setup

**Solution**:
1. Click "새로고침" in dashboard
2. Wait for backfill to complete
3. Statistics will populate for recent posts

#### Token expired

**Solution**:
1. Settings → Check token status
2. Click "토큰 갱신" (Refresh Token)
3. If refresh fails, re-authenticate with Threads

### Debug Mode

Enable verbose logging:

```javascript
// In background.js console:
localStorage.setItem('DEBUG', 'true');

// Disable:
localStorage.removeItem('DEBUG');
```

---

## Contributing

We welcome contributions! Here's how to get started:

### Development Setup

1. **Fork and clone**
   ```bash
   git fork https://github.com/yourusername/threads-to-notion-sync.git
   git clone https://github.com/YOUR_USERNAME/threads-to-notion-sync.git
   cd threads-to-notion-sync
   ```

2. **Load extension in Chrome**
   - Navigate to `chrome://extensions`
   - Enable Developer mode
   - Click "Load unpacked"
   - Select project directory

3. **Make changes**
   - Edit source files
   - Refresh extension to test

4. **Test thoroughly**
   - Test sync functionality
   - Verify analytics accuracy
   - Check error handling

### Contribution Guidelines

- **Code style**: Follow existing patterns
- **Documentation**: Update docs for new features
- **Testing**: Test all code paths
- **Commits**: Use clear, descriptive messages

### Areas for Contribution

- 🐛 **Bug fixes**: See [Issues](https://github.com/yourusername/threads-to-notion-sync/issues)
- ✨ **Features**: Check feature requests
- 📝 **Documentation**: Improve clarity
- 🌐 **Localization**: Add language support
- 🎨 **Design**: UI/UX improvements

---

## Roadmap

### Version 1.1 (Planned)

- [ ] Webhook-based real-time sync
- [ ] Custom notification preferences
- [ ] Export data to CSV/JSON
- [ ] Multi-account support

### Version 2.0 (Future)

- [ ] Thread reply tracking
- [ ] Content calendar integration
- [ ] A/B testing for post timing
- [ ] Sentiment analysis

---

## FAQ

**Q: Is this extension free?**
A: Yes, completely free and open source.

**Q: Where is my data stored?**
A: All data is stored locally in Chrome's storage. Nothing is sent to third-party servers.

**Q: Can I use multiple Notion databases?**
A: Currently, one database per configuration. You can change databases in settings.

**Q: How often does auto-sync run?**
A: Default is every 1 minute. Configurable from 1-60 minutes.

**Q: Will this work on Firefox/Edge?**
A: Currently Chrome only. Firefox support is being considered.

**Q: Can I sync posts from multiple Threads accounts?**
A: Not yet. Multi-account support is planned for v1.1.

---

## Privacy Policy

### Data Collection

This extension does NOT collect, transmit, or sell any user data.

### Data Storage

- **Tokens**: Stored locally in Chrome's encrypted storage
- **Thread data**: Temporarily cached, then stored in your Notion
- **Statistics**: Stored locally for dashboard display

### Third-Party Services

- **Threads API**: Used to fetch your posts and statistics
- **Notion API**: Used to create and update pages in your database
- **OAuth Proxy**: Used only to exchange authorization codes for tokens (no data logged)

For full privacy policy, see [PRIVACY_POLICY.md](PRIVACY_POLICY.md).

---

## License

MIT License - see [LICENSE](LICENSE) file for details.

Copyright (c) 2024 Threads to Notion Sync Contributors

---

## Acknowledgments

- **Threads**: For providing the Graph API
- **Notion**: For their excellent API documentation
- **Chrome Extensions**: For Manifest V3 platform
- **Chart.js**: For beautiful visualizations

---

## Support

### Get Help

- 📖 [Documentation](docs/)
- 💬 [Discussions](https://github.com/yourusername/threads-to-notion-sync/discussions)
- 🐛 [Report Bug](https://github.com/yourusername/threads-to-notion-sync/issues/new?template=bug_report.md)
- ✨ [Request Feature](https://github.com/yourusername/threads-to-notion-sync/issues/new?template=feature_request.md)

### Stay Updated

- ⭐ Star this repo to follow updates
- 👀 Watch for releases
- 🐦 Follow [@YourTwitter](https://twitter.com/yourtwitter) for news

---

<p align="center">
  Made with ❤️ by content creators, for content creators
</p>

<p align="center">
  <a href="#top">Back to top ↑</a>
</p>
