/**
 * Unit Tests for Storage Module (storage.js)
 */

import * as storage from '../../../src/storage/storage.js';
import { mockStorageData } from '../../fixtures/mock-data.js';

describe('Storage Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Token Management', () => {
    describe('setThreadsToken / getThreadsToken', () => {
      it('should store and retrieve threads token', async () => {
        const token = 'test_token_123';

        chrome.storage.local.get.mockResolvedValue({
          threadsAccessToken: token
        });

        await storage.setThreadsToken(token);
        const result = await storage.getThreadsToken();

        expect(chrome.storage.local.set).toHaveBeenCalledWith({
          threadsAccessToken: token
        });
        expect(result).toBe(token);
      });

      it('should return null if no token exists', async () => {
        chrome.storage.local.get.mockResolvedValue({});

        const result = await storage.getThreadsToken();

        expect(result).toBeUndefined();
      });
    });

    describe('Token Expiration', () => {
      it('should detect expired token', async () => {
        const expiredTime = Date.now() - 1000; // 1 second ago

        chrome.storage.local.get.mockResolvedValue({
          threadsTokenExpiresAt: expiredTime
        });

        const isExpired = await storage.isTokenExpired();

        expect(isExpired).toBe(true);
      });

      it('should detect valid token', async () => {
        const futureTime = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

        chrome.storage.local.get.mockResolvedValue({
          threadsTokenExpiresAt: futureTime
        });

        const isExpired = await storage.isTokenExpired();

        expect(isExpired).toBe(false);
      });

      it('should detect token expiring soon (within 7 days)', async () => {
        const soonTime = Date.now() + 5 * 24 * 60 * 60 * 1000; // 5 days

        chrome.storage.local.get.mockResolvedValue({
          threadsTokenExpiresAt: soonTime
        });

        const isExpiringSoon = await storage.isTokenExpiringSoon();

        expect(isExpiringSoon).toBe(true);
      });

      it('should calculate remaining days correctly', async () => {
        const daysRemaining = 15;
        const futureTime = Date.now() + daysRemaining * 24 * 60 * 60 * 1000;

        chrome.storage.local.get.mockResolvedValue({
          threadsTokenExpiresAt: futureTime
        });

        const remaining = await storage.getTokenRemainingDays();

        expect(remaining).toBeGreaterThanOrEqual(14);
        expect(remaining).toBeLessThanOrEqual(16);
      });
    });
  });

  describe('Notion Configuration', () => {
    it('should store and retrieve Notion secret', async () => {
      const secret = 'notion_secret_123';

      chrome.storage.local.get.mockResolvedValue({
        notionSecret: secret
      });

      await storage.setNotionSecret(secret);
      const result = await storage.getNotionSecret();

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        notionSecret: secret
      });
      expect(result).toBe(secret);
    });

    it('should store and retrieve database ID', async () => {
      const dbId = 'db_123';

      chrome.storage.local.get.mockResolvedValue({
        notionDatabaseId: dbId
      });

      await storage.setNotionDatabaseId(dbId);
      const result = await storage.getNotionDatabaseId();

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        notionDatabaseId: dbId
      });
      expect(result).toBe(dbId);
    });
  });

  describe('Field Mapping', () => {
    it('should store and retrieve field mapping', async () => {
      const mapping = {
        title: 'Name',
        content: 'Content',
        createdAt: 'Created'
      };

      chrome.storage.local.get.mockResolvedValue({
        fieldMapping: mapping
      });

      await storage.setFieldMapping(mapping);
      const result = await storage.getFieldMapping();

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        fieldMapping: mapping
      });
      expect(result).toEqual(mapping);
    });
  });

  describe('Sync Options', () => {
    it('should store and retrieve sync options', async () => {
      const options = {
        autoSync: true,
        syncInterval: 10,
        dailyStatsRefresh: true
      };

      chrome.storage.local.get.mockResolvedValue({
        syncOptions: options
      });

      await storage.setSyncOptions(options);
      const result = await storage.getSyncOptions();

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        syncOptions: options
      });
      expect(result).toEqual(options);
    });

    it('should return default options if none exist', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const result = await storage.getSyncOptions();

      expect(result).toEqual({
        autoSync: true,
        syncInterval: 1,
        dailyStatsRefresh: true
      });
    });
  });

  describe('Sync History', () => {
    it('should add sync history entry', async () => {
      const existingHistory = [{ id: 'old_1' }];
      const newEntry = {
        id: 'sync_1',
        threadId: 'thread_123',
        status: 'success',
        timestamp: '2024-12-10T10:00:00.000Z'
      };

      chrome.storage.local.get.mockResolvedValue({
        syncHistory: existingHistory
      });

      await storage.addSyncHistoryEntry(newEntry);

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        syncHistory: [newEntry, ...existingHistory]
      });
    });

    it('should limit history to 500 entries', async () => {
      const largeHistory = Array(505).fill(0).map((_, i) => ({ id: `sync_${i}` }));

      chrome.storage.local.get.mockResolvedValue({
        syncHistory: largeHistory
      });

      const newEntry = { id: 'new_sync', status: 'success' };
      await storage.addSyncHistoryEntry(newEntry);

      const savedHistory = chrome.storage.local.set.mock.calls[0][0].syncHistory;
      expect(savedHistory.length).toBe(500);
      expect(savedHistory[0]).toEqual(newEntry);
    });

    it('should retrieve limited sync history', async () => {
      const history = Array(100).fill(0).map((_, i) => ({ id: `sync_${i}` }));

      chrome.storage.local.get.mockResolvedValue({
        syncHistory: history
      });

      const result = await storage.getSyncHistory(10);

      expect(result.length).toBe(10);
    });
  });

  describe('Configuration Status', () => {
    it('should return true when all required settings exist', async () => {
      chrome.storage.local.get.mockResolvedValue({
        threadsAccessToken: 'token',
        notionSecret: 'secret',
        notionDatabaseId: 'db_id'
      });

      const isConfigured = await storage.isConfigured();

      expect(isConfigured).toBe(true);
    });

    it('should return false when any required setting is missing', async () => {
      chrome.storage.local.get.mockResolvedValue({
        threadsAccessToken: 'token',
        notionSecret: 'secret'
        // notionDatabaseId missing
      });

      const isConfigured = await storage.isConfigured();

      expect(isConfigured).toBe(false);
    });
  });

  describe('Synced Thread IDs', () => {
    it('should add thread ID to synced list', async () => {
      chrome.storage.local.get.mockResolvedValue({
        syncedThreadIds: ['thread_1', 'thread_2']
      });

      await storage.addSyncedThreadId('thread_3');

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        syncedThreadIds: ['thread_1', 'thread_2', 'thread_3']
      });
    });

    it('should not add duplicate thread IDs', async () => {
      chrome.storage.local.get.mockResolvedValue({
        syncedThreadIds: ['thread_1', 'thread_2']
      });

      await storage.addSyncedThreadId('thread_1');

      // Should not call set since ID already exists
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    it('should check if thread is synced', async () => {
      chrome.storage.local.get.mockResolvedValue({
        syncedThreadIds: ['thread_1', 'thread_2']
      });

      const isSynced = await storage.isThreadSynced('thread_1');
      const isNotSynced = await storage.isThreadSynced('thread_3');

      expect(isSynced).toBe(true);
      expect(isNotSynced).toBe(false);
    });

    it('should limit synced IDs to 500 entries', async () => {
      const largeList = Array(501).fill(0).map((_, i) => `thread_${i}`);

      chrome.storage.local.get.mockResolvedValue({
        syncedThreadIds: largeList
      });

      await storage.addSyncedThreadId('new_thread');

      const savedList = chrome.storage.local.set.mock.calls[0][0].syncedThreadIds;
      expect(savedList.length).toBe(500);
    });
  });

  describe('Thread-Page Mappings', () => {
    it('should add thread-page mapping', async () => {
      chrome.storage.local.get.mockResolvedValue({
        threadPageMappings: []
      });

      const threadId = 'thread_123';
      const notionPageId = 'page_123';
      const sourceUrl = 'https://threads.net/post/123';
      const postCreatedAt = '2024-12-10T10:00:00.000Z';
      const insights = { views: 100, likes: 10 };
      const title = 'Test Post';

      await storage.addThreadPageMapping(
        threadId,
        notionPageId,
        sourceUrl,
        postCreatedAt,
        insights,
        title
      );

      const savedMapping = chrome.storage.local.set.mock.calls[0][0].threadPageMappings[0];
      expect(savedMapping.threadId).toBe(threadId);
      expect(savedMapping.notionPageId).toBe(notionPageId);
      expect(savedMapping.title).toBe(title);
      expect(savedMapping.insights).toEqual(insights);
    });

    it('should update existing mapping', async () => {
      const existingMapping = {
        threadId: 'thread_123',
        notionPageId: 'page_123',
        createdAt: '2024-12-09T10:00:00.000Z',
        insights: { views: 50, likes: 5 }
      };

      chrome.storage.local.get.mockResolvedValue({
        threadPageMappings: [existingMapping]
      });

      const newInsights = { views: 100, likes: 10 };
      await storage.updateThreadInsights('thread_123', newInsights);

      const savedMapping = chrome.storage.local.set.mock.calls[0][0].threadPageMappings[0];
      expect(savedMapping.insights).toEqual(newInsights);
    });

    it('should retrieve all mappings', async () => {
      const mappings = [
        { threadId: 'thread_1', notionPageId: 'page_1' },
        { threadId: 'thread_2', notionPageId: 'page_2' }
      ];

      chrome.storage.local.get.mockResolvedValue({
        threadPageMappings: mappings
      });

      const result = await storage.getThreadPageMappings();

      expect(result).toEqual(mappings);
    });
  });

  describe('Sync Statistics', () => {
    it('should calculate sync statistics correctly', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const history = [
        { status: 'success', timestamp: today.toISOString() },
        { status: 'success', timestamp: new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString() },
        { status: 'failed', timestamp: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() },
        { status: 'success', timestamp: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString() }
      ];

      chrome.storage.local.get.mockResolvedValue({
        syncHistory: history
      });

      const stats = await storage.getSyncStats();

      expect(stats.total).toBe(4);
      expect(stats.success).toBe(3);
      expect(stats.failed).toBe(1);
      expect(stats.today).toBeGreaterThanOrEqual(1);
      expect(stats.successRate).toBe(75);
    });
  });
});
