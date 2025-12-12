/**
 * Unit Tests for Notion API Module (api/notion.js)
 */

import * as notionApi from '../../../src/api/notion.js';
import {
  mockNotionUser,
  mockNotionDatabase,
  mockNotionPage,
  mockThreadPost
} from '../../fixtures/mock-data.js';

describe('Notion API Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  describe('testConnection', () => {
    it('should return success with user data on valid secret', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockNotionUser
      });

      const result = await notionApi.testConnection('valid_secret');

      expect(result.success).toBe(true);
      expect(result.user).toEqual(mockNotionUser);
    });

    it('should return error on invalid secret', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          message: 'Unauthorized'
        })
      });

      const result = await notionApi.testConnection('invalid_secret');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('listDatabases', () => {
    it('should list all accessible databases', async () => {
      const mockResponse = {
        results: [mockNotionDatabase],
        has_more: false
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await notionApi.listDatabases('secret');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('db_123');
      expect(result[0].title).toBe('Threads Archive');
    });

    it('should handle pagination', async () => {
      // First page
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [mockNotionDatabase],
          has_more: true,
          next_cursor: 'cursor_1'
        })
      });

      // Second page
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ ...mockNotionDatabase, id: 'db_456' }],
          has_more: false
        })
      });

      const result = await notionApi.listDatabases('secret');

      expect(result).toHaveLength(2);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getDatabase', () => {
    it('should fetch database details', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockNotionDatabase
      });

      const result = await notionApi.getDatabase('secret', 'db_123');

      expect(result.id).toBe('db_123');
      expect(result.properties).toBeDefined();
    });
  });

  describe('getDatabaseProperties', () => {
    it('should return database properties', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockNotionDatabase
      });

      const result = await notionApi.getDatabaseProperties('secret', 'db_123');

      expect(result).toEqual(mockNotionDatabase.properties);
      expect(result.Name).toBeDefined();
      expect(result.Content).toBeDefined();
    });
  });

  describe('createPage', () => {
    it('should create page in database', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockNotionPage
      });

      const fieldMapping = {
        title: 'Name',
        content: 'Content',
        createdAt: 'Created',
        sourceUrl: 'URL'
      };

      const result = await notionApi.createPage(
        'secret',
        'db_123',
        mockThreadPost,
        fieldMapping
      );

      expect(result.id).toBe('page_123');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.notion.com/v1/pages'),
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    it('should include all mapped fields', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockNotionPage
      });

      const fieldMapping = {
        title: 'Name',
        content: 'Content',
        createdAt: 'Created',
        sourceUrl: 'URL',
        views: 'Views',
        likes: 'Likes'
      };

      await notionApi.createPage('secret', 'db_123', mockThreadPost, fieldMapping);

      const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(requestBody.properties.Name).toBeDefined();
      expect(requestBody.properties.Content).toBeDefined();
      expect(requestBody.properties.Views).toBeDefined();
      expect(requestBody.properties.Likes).toBeDefined();
    });

    it('should handle retry on failure', async () => {
      // First attempt fails
      global.fetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockNotionPage
        });

      const result = await notionApi.createPage(
        'secret',
        'db_123',
        mockThreadPost,
        { title: 'Name' }
      );

      expect(result.id).toBe('page_123');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('updatePage', () => {
    it('should update page properties', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockNotionPage
      });

      const properties = {
        Views: { number: 2000 },
        Likes: { number: 100 }
      };

      await notionApi.updatePage('secret', 'page_123', properties);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.notion.com/v1/pages/page_123'),
        expect.objectContaining({
          method: 'PATCH'
        })
      );
    });
  });

  describe('updatePageStats', () => {
    it('should update only stats fields', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockNotionPage
      });

      const stats = {
        views: 2000,
        likes: 100,
        replies: 20
      };

      const fieldMapping = {
        views: 'Views',
        likes: 'Likes',
        replies: 'Replies'
      };

      await notionApi.updatePageStats('secret', 'page_123', stats, fieldMapping);

      const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(requestBody.properties.Views.number).toBe(2000);
      expect(requestBody.properties.Likes.number).toBe(100);
      expect(requestBody.properties.Replies.number).toBe(20);
    });

    it('should return null if no fields to update', async () => {
      const result = await notionApi.updatePageStats('secret', 'page_123', {}, {});

      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('findPageBySourceUrl', () => {
    it('should find page by source URL', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [mockNotionPage]
        })
      });

      const result = await notionApi.findPageBySourceUrl(
        'secret',
        'db_123',
        'https://threads.net/post/123',
        'URL'
      );

      expect(result.id).toBe('page_123');
    });

    it('should return null if no page found', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: []
        })
      });

      const result = await notionApi.findPageBySourceUrl(
        'secret',
        'db_123',
        'https://threads.net/post/999',
        'URL'
      );

      expect(result).toBeNull();
    });
  });

  describe('Rate Limiting', () => {
    it('should respect rate limits', async () => {
      jest.useFakeTimers();

      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => mockNotionPage
      });

      // Make multiple requests
      const promises = [
        notionApi.testConnection('secret'),
        notionApi.testConnection('secret')
      ];

      // First request should happen immediately
      await Promise.resolve();
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Second request should be delayed
      jest.advanceTimersByTime(334);
      await Promise.resolve();

      await Promise.all(promises);
      expect(global.fetch).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });
  });

  describe('Insights Database', () => {
    it('should create insights database', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'insights_db_123' })
      });

      const result = await notionApi.createInsightsDatabase('secret', 'parent_page_123');

      expect(result.id).toBe('insights_db_123');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.notion.com/v1/databases'),
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    it('should add insights entry to database', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockNotionPage
      });

      const insights = {
        views: 5000,
        likes: 250,
        followers_count: 150,
        period: 7
      };

      await notionApi.addInsightsEntry('secret', 'db_123', insights);

      const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(requestBody.properties['조회수'].number).toBe(5000);
      expect(requestBody.properties['팔로워'].number).toBe(150);
    });

    it('should check if insights exist for today', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [mockNotionPage]
        })
      });

      const result = await notionApi.hasInsightsForToday('secret', 'db_123', 7);

      expect(result).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          message: 'Internal server error'
        })
      });

      await expect(
        notionApi.testConnection('secret')
      ).resolves.toEqual({
        success: false,
        error: expect.stringContaining('Internal server error')
      });
    });

    it('should handle network errors', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network failure'));

      await expect(
        notionApi.testConnection('secret')
      ).resolves.toEqual({
        success: false,
        error: expect.stringContaining('Network failure')
      });
    });
  });
});
