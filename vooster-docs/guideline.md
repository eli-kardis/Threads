# Threads-to-Notion Sync: Code Guideline

This document provides the official coding standards and architectural patterns for the "Threads → Notion Sync" Chrome Extension. Adherence to these guidelines is mandatory to ensure code quality, maintainability, and security.

## 1. Project Overview

This project is a serverless, client-side-only Chrome Extension built using **Manifest v3**. Its purpose is to automatically synchronize a user's Threads posts to a specified Notion database.

### Key Architectural Decisions
- **Serverless Architecture**: All logic resides within the client's browser. There is no backend server.
- **Manifest v3**: Utilizes an event-driven Background Service Worker for core logic, enhancing security and performance.
- **Modular Design**: The codebase is strictly divided by domain into `ui`, `background`, `content`, `api`, and `storage` modules to enforce separation of concerns.
- **Secure Storage**: Sensitive user data (API tokens) is stored exclusively in `chrome.storage.local`, isolated from less secure contexts like content scripts.

## 2. Core Principles

- **Security First**: All code handling user credentials MUST prioritize security and data isolation.
- **Performance by Default**: All operations MUST be non-blocking and resource-efficient to ensure a minimal browser footprint.
- **Modularity and Single Responsibility**: Each module, file, and function MUST have a single, well-defined purpose.
- **Clarity Over Cleverness**: Code MUST be simple, readable, and maintainable by any developer on the project.

## 3. Language-Specific Guidelines (JavaScript / Chrome Extension)

### File Organization and Directory Structure

The project MUST follow the domain-driven structure defined in the TRD. Each module has a clear responsibility.

```
/src/
├── background.js             # Core logic orchestrator (Service Worker)
├── content.js                # DOM interaction on threads.net
├── api/                      # External API communication
│   ├── notion.js
│   └── threads.js
├── storage/                  # Wrapper for chrome.storage.local
│   └── storage.js
├── ui/                       # UI logic for popup and options
│   ├── options.js
│   └── popup.js
└── shared/                   # Common utilities
    └── utils.js
```

### Import/Dependency Management

- **MUST**: Use ES6 Modules (`import`/`export`) for all JavaScript files to ensure modularity and clear dependency tracking.
- **MUST**: In HTML files (`popup.html`, `options.html`), load scripts using `<script type="module" src="..."></script>`.

```javascript
// src/api/notion.js
export async function createNotionPage(apiKey, dbId, data) {
  // ... implementation
}

// src/background.js
import { createNotionPage } from './api/notion.js';
import { getSettings } from './storage/storage.js';

// ... logic using imported functions
```

### Error Handling Patterns

- **MUST**: Wrap all asynchronous operations (API calls, storage access) in `try...catch` blocks.
- **MUST**: API client modules MUST throw or reject with a structured `Error` object containing a `message` and optionally a `status` code. This ensures consistent error handling in the background service worker.

```javascript
// src/api/notion.js
// MUST: Proper error handling for API calls.
export async function createNotionPage(apiKey, dbId, content) {
  try {
    const response = await fetch('https://api.notion.com/...', { /* ... */ });
    if (!response.ok) {
      // Create a structured error for the caller to handle.
      throw new Error(`Notion API Error: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to create Notion page:', error);
    // Re-throw to allow the orchestrator (background.js) to handle it.
    throw error;
  }
}
```

## 4. Code Style Rules

### MUST Follow:

1.  **Use `async/await` for all asynchronous code.**
    *   **Rationale**: Improves readability and simplifies error handling compared to `.then()` chains.
    *   **Implementation**: All functions interacting with Chrome APIs or `fetch` must be `async`.

2.  **Use `const` by default; use `let` only for variables that must be reassigned.**
    *   **Rationale**: Prevents accidental reassignment and signals intent clearly.

3.  **Use strict equality operators (`===` and `!==`).**
    *   **Rationale**: Avoids unexpected type coercion bugs.

4.  **Use Arrow Functions for callbacks and anonymous functions.**
    *   **Rationale**: Provides a concise syntax and lexical `this` binding, which prevents common bugs.

5.  **Add JSDoc comments for all exported functions.**
    *   **Rationale**: Ensures modules are self-documenting, making the codebase easier to understand and maintain.

```javascript
// src/storage/storage.js
/**
 * Retrieves user settings from local storage.
 * @returns {Promise<object|null>} A promise that resolves with the settings object, or null if not found.
 */
export async function getSettings() {
  const result = await chrome.storage.local.get(['settings']);
  return result.settings || null;
}
```

### MUST NOT Do:

1.  **MUST NOT use `var`.**
    *   **Rationale**: `var` has function scope, which can lead to hoisting issues and bugs. `let` and `const` provide block scope, which is more predictable.

2.  **MUST NOT access `window` or `document` objects in the Background Service Worker (`background.js`).**
    *   **Rationale**: Service workers do not have access to the DOM. This will cause runtime errors. All DOM interaction must occur in content scripts or UI pages.

3.  **MUST NOT create monolithic, multi-responsibility files.**
    *   **Rationale**: Large files are hard to read, test, and maintain. Stick to the single responsibility principle. If a file exceeds 200 lines, consider refactoring it into smaller modules.

4.  **MUST NOT pass sensitive data (API tokens) to Content Scripts.**
    *   **Rationale**: Content scripts run in a less secure environment. All API calls using tokens MUST originate from the background service worker.

```javascript
// src/content.js
// MUST NOT: Never handle tokens in a content script.
// This is a security vulnerability.
const userToken = '...'; // WRONG!

// MUST: Send a message to the background script to perform the action.
// The content script's only job is to detect and notify.
function onNewPostDetected(postData) {
  chrome.runtime.sendMessage({ type: 'NEW_POST_DETECTED', payload: postData });
}
```

## 5. Architecture Patterns

### Component/Module Structure

-   **API Clients (`/api`)**: Responsible only for formatting requests, sending them, and parsing responses for a specific external service. MUST include logic for rate limiting.
-   **Storage Manager (`/storage`)**: Acts as the sole interface to `chrome.storage.local`. It provides simple `get` and `set` methods, abstracting the Chrome API away from the rest of the application.
-   **Background Script (`background.js`)**: The application's orchestrator. It listens for events (from content scripts, alarms, etc.), fetches data using the storage manager, calls API clients, and handles the core business logic.
-   **Content Script (`content.js`)**: Responsible only for DOM interaction on `threads.net`. Its sole purpose is to detect new posts and send a message to the background script. It MUST NOT contain any business logic.

### Data Flow Patterns

Communication between extension components MUST follow a strict message-passing pattern.

1.  **Content Script (`content.js`) → Background (`background.js`)**:
    -   The content script detects an event (e.g., a new post).
    -   It sends a message with a clear `type` and `payload` using `chrome.runtime.sendMessage`.

2.  **Background (`background.js`)**:
    -   An event listener (`chrome.runtime.onMessage.addListener`) receives the message.
    -   It orchestrates the required actions: fetching settings, calling the Threads API, and then calling the Notion API.

```javascript
// src/content.js
// MUST: Send a message to the background script upon detection.
const observer = new MutationObserver(mutations => {
  if (isNewPostPublished(mutations)) {
    const postContent = extractPostContent();
    chrome.runtime.sendMessage({ type: 'NEW_POST_DETECTED', payload: { content: postContent } });
  }
});
observer.observe(document.body, { childList: true, subtree: true });

// src/background.js
// MUST: Listen for messages and orchestrate the sync process.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'NEW_POST_DETECTED') {
    handleSync(message.payload); // `handleSync` is an async function
    return true; // Indicates an async response.
  }
});

async function handleSync(postData) {
  try {
    const settings = await getSettings();
    if (!settings) throw new Error('Settings not configured.');
    
    // In a real scenario, you would get more data from the Threads API first.
    await createNotionPage(settings.notionToken, settings.dbId, postData.content);
    
    // Notify user of success
    chrome.notifications.create({ /* ... */ });
  } catch (error) {
    console.error('Sync failed:', error);
    // Notify user of failure
    chrome.notifications.create({ /* ... */ });
  }
}
```

### State Management Conventions

-   **Configuration State**: User-provided settings (API tokens, DB ID, field mappings) are the only persistent state. This state MUST be managed exclusively by the `storage` module.
-   **Runtime State**: The application should be as stateless as possible. Avoid global variables in the service worker, as it can be terminated and restarted at any time. All necessary information for an operation should be fetched from storage when the operation begins.

### API Design Standards

-   All functions within API client modules (`api/notion.js`, `api/threads.js`) MUST be `async` and return a `Promise`.
-   They MUST accept all necessary parameters, including credentials and data, and should not rely on any external state. This makes them pure, predictable, and easy to test.

```javascript
// src/api/threads.js
// MUST: API client functions are self-contained and stateless.
/**
 * Fetches the details of a specific thread post.
 * @param {string} postUrl - The URL of the post to fetch.
 * @param {string} accessToken - The user's Threads access token.
 * @returns {Promise<object>} A promise that resolves with the post data.
 */
export async function fetchThreadDetails(postUrl, accessToken) {
  // This is a hypothetical implementation
  try {
    const response = await fetch(`https://graph.threads.net/v1.0/${postUrl}?access_token=${accessToken}`);
    if (!response.ok) {
      throw new Error(`Threads API Error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch thread details', error);
    throw error;
  }
}
```