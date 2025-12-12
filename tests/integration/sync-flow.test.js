/**
 * Integration Tests for Sync Flow
 * Tests the complete flow from detecting threads to syncing with Notion
 */

import * as storage from '../../src/storage/storage.js';
import * as threadsApi from '../../src/api/threads.js';
import * as notionApi from '../../src/api/notion.js';
import {
  mockThreadsApiResponse,
  mockThreadInsights,
  mockNotionPage,
  mockStorageData
} from '../fixtures/mock-data.js';

describe('Sync Flow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();

    // Mock storage as configured
    chrome.storage.local.get.mockImplementation((keys) => {
      if (Array.isArray(keys)) {
        const result = {};
        keys.forEach(key => {
          result[key] = mockStorageData[key];
        });
        return Promise.resolve(result);
      }
      return Promise.resolve(mockStorageData);
    });
  });

  describe('Complete Sync Flow', () => {
    it('should sync new threads from Threads to Notion', async () => {
      // Setup: Mock API responses
      global.fetch
        // Test Threads connection
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: '123', username: 'testuser' })
        })
        // Get user threads
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockThreadsApiResponse
        })
        // Get thread insights
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [
              { name: 'views', values: [{ value: 1000 }] },
              { name: 'likes', values: [{ value: 50 }] }
            ]
          })
        })
        // Create Notion page
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockNotionPage
        });

      // Simulate sync flow
      // 1. Verify configuration
      const isConfigured = await storage.isConfigured();
      expect(isConfigured).toBe(true);

      // 2. Get user threads
      const threadsResponse = await threadsApi.getUserThreads(
        mockStorageData.threadsAccessToken
      );
      expect(threadsResponse.data).toHaveLength(2);

      // 3. Get insights for first thread
      const thread = threadsResponse.data[0];
      const insights = await threadsApi.getThreadInsights(
        mockStorageData.threadsAccessToken,
        thread.id
      );
      expect(insights.views).toBe(1000);

      // 4. Create Notion page
      const normalizedThread = threadsApi.normalizeThread(thread, insights);
      const notionPage = await notionApi.createPage(
        mockStorageData.notionSecret,
        mockStorageData.notionDatabaseId,
        normalizedThread,
        mockStorageData.fieldMapping
      );
      expect(notionPage.id).toBeDefined();

      // 5. Save sync history
      await storage.addSyncHistoryEntry({
        id: 'sync_1',
        threadId: thread.id,
        notionPageId: notionPage.id,
        status: 'success',
        timestamp: new Date().toISOString()
      });

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          syncHistory: expect.arrayContaining([
            expect.objectContaining({
              threadId: thread.id,
              status: 'success'
            })
          ])
        })
      );
    });

    it('should handle partial sync failures gracefully', async () => {
      global.fetch
        // Get threads - success
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [
              mockThreadsApiResponse.data[0],
              mockThreadsApiResponse.data[1]
            ]
          })
        })
        // First thread insights - success
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ name: 'views', values: [{ value: 100 }] }]
          })
        })
        // First thread create page - success
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockNotionPage
        })
        // Second thread insights - fail
        .mockRejectedValueOnce(new Error('API rate limit'))
        // Second thread create page - should not be called
        ;

      const threads = await threadsApi.getUserThreads('token');
      const results = [];

      for (const thread of threads.data) {
        try {
          const insights = await threadsApi.getThreadInsights('token', thread.id);
          const normalized = threadsApi.normalizeThread(thread, insights);
          const page = await notionApi.createPage('secret', 'db_123', normalized, {
            title: 'Name'
          });
          results.push({ success: true, threadId: thread.id });
        } catch (error) {
          results.push({ success: false, threadId: thread.id, error: error.message });
        }
      }

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toContain('rate limit');
    });
  });

  describe('Token Refresh Flow', () => {
    it('should refresh token when expiring soon', async () => {
      // Mock token expiring in 5 days
      const expiringToken = {
        ...mockStorageData,
        threadsTokenExpiresAt: Date.now() + 5 * 24 * 60 * 60 * 1000
      };

      chrome.storage.local.get.mockResolvedValue(expiringToken);

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new_token',
          expires_in: 5184000
        })
      });

      const isExpiringSoon = await storage.isTokenExpiringSoon();
      expect(isExpiringSoon).toBe(true);

      // Refresh token
      const newToken = await threadsApi.refreshLongLivedToken(
        expiringToken.threadsAccessToken
      );
      expect(newToken.access_token).toBe('new_token');

      // Save new token
      await storage.setThreadsToken(newToken.access_token);
      await storage.setTokenExpiresAt(Date.now() + newToken.expires_in * 1000);

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          threadsAccessToken: 'new_token'
        })
      );
    });
  });

  describe('Stats Update Flow', () => {
    it('should update existing Notion pages with new stats', async () => {
      // Mock existing thread-page mappings
      chrome.storage.local.get.mockResolvedValue({
        threadPageMappings: [
          {
            threadId: 'thread_123',
            notionPageId: 'page_123',
            insights: { views: 100, likes: 10 }
          }
        ],
        ...mockStorageData
      });

      // Mock updated insights
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [
              { name: 'views', values: [{ value: 200 }] },
              { name: 'likes', values: [{ value: 25 }] }
            ]
          })
        })
        // Update Notion page
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockNotionPage
        });

      const mappings = await storage.getThreadPageMappings();
      const mapping = mappings[0];

      // Get updated insights
      const newInsights = await threadsApi.getThreadInsights('token', mapping.threadId);
      expect(newInsights.views).toBe(200);

      // Update Notion page
      await notionApi.updatePageStats(
        'secret',
        mapping.notionPageId,
        newInsights,
        mockStorageData.fieldMapping
      );

      // Update storage
      await storage.updateThreadInsights(mapping.threadId, newInsights);

      expect(chrome.storage.local.set).toHaveBeenCalled();
    });
  });

  describe('Duplicate Prevention', () => {
    it('should not sync already synced threads', async () => {
      chrome.storage.local.get.mockResolvedValue({
        syncedThreadIds: ['thread_123', 'thread_456'],
        ...mockStorageData
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: 'thread_123', text: 'Already synced' },
            { id: 'thread_789', text: 'New thread' }
          ]
        })
      });

      const threads = await threadsApi.getUserThreads('token');
      const toSync = [];

      for (const thread of threads.data) {
        const isSynced = await storage.isThreadSynced(thread.id);
        if (!isSynced) {
          toSync.push(thread);
        }
      }

      expect(toSync).toHaveLength(1);
      expect(toSync[0].id).toBe('thread_789');
    });
  });

  describe('Error Recovery', () => {
    it('should retry failed syncs', async () => {
      global.fetch
        // First attempt - fail
        .mockRejectedValueOnce(new Error('Network timeout'))
        // Second attempt - fail
        .mockRejectedValueOnce(new Error('Network timeout'))
        // Third attempt - success
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockNotionPage
        });

      // This tests the retry logic in retryWithBackoff
      const createPageWithRetry = async () => {
        return await notionApi.createPage(
          'secret',
          'db_123',
          mockThreadsApiResponse.data[0],
          { title: 'Name' }
        );
      };

      const result = await createPageWithRetry();

      expect(result.id).toBe('page_123');
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });
});
