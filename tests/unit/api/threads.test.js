/**
 * Unit Tests for Threads API Module (api/threads.js)
 */

import * as threadsApi from '../../../src/api/threads.js';
import {
  mockThreadsUser,
  mockThreadsApiResponse,
  mockThreadInsights,
  mockAccountInsights
} from '../../fixtures/mock-data.js';

describe('Threads API Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  describe('testConnection', () => {
    it('should return success with user data on valid token', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockThreadsUser
      });

      const result = await threadsApi.testConnection('valid_token');

      expect(result.success).toBe(true);
      expect(result.user).toEqual(mockThreadsUser);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://graph.threads.net/v1.0/me')
      );
    });

    it('should return error on invalid token', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: { message: 'Invalid access token' }
        })
      });

      const result = await threadsApi.testConnection('invalid_token');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle network errors', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await threadsApi.testConnection('token');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('getUserThreads', () => {
    it('should fetch user threads with default options', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockThreadsApiResponse
      });

      const result = await threadsApi.getUserThreads('token');

      expect(result.data).toHaveLength(2);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://graph.threads.net/v1.0/me/threads')
      );
    });

    it('should include pagination cursor', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockThreadsApiResponse
      });

      const result = await threadsApi.getUserThreads('token', {
        after: 'cursor_123'
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('after=cursor_123')
      );
    });

    it('should convert since/until to Unix timestamps', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockThreadsApiResponse
      });

      await threadsApi.getUserThreads('token', {
        since: '2024-12-10T00:00:00.000Z',
        until: '2024-12-11T00:00:00.000Z'
      });

      const callUrl = global.fetch.mock.calls[0][0];
      expect(callUrl).toContain('since=');
      expect(callUrl).toContain('until=');
    });
  });

  describe('getThread', () => {
    it('should fetch single thread by ID', async () => {
      const singleThread = mockThreadsApiResponse.data[0];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => singleThread
      });

      const result = await threadsApi.getThread('token', 'thread_123');

      expect(result.id).toBe('thread_123');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://graph.threads.net/v1.0/thread_123')
      );
    });
  });

  describe('getThreadInsights', () => {
    it('should fetch thread insights', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { name: 'views', values: [{ value: 1000 }] },
            { name: 'likes', values: [{ value: 50 }] },
            { name: 'replies', values: [{ value: 10 }] },
            { name: 'reposts', values: [{ value: 5 }] },
            { name: 'quotes', values: [{ value: 2 }] }
          ]
        })
      });

      const result = await threadsApi.getThreadInsights('token', 'thread_123');

      expect(result).toEqual(mockThreadInsights);
    });

    it('should return zero stats on error', async () => {
      global.fetch.mockRejectedValueOnce(new Error('API error'));

      const result = await threadsApi.getThreadInsights('token', 'thread_123');

      expect(result.views).toBe(0);
      expect(result.likes).toBe(0);
      expect(result.replies).toBe(0);
    });
  });

  describe('getAccountInsights', () => {
    it('should fetch account insights with period', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { name: 'views', total_value: { value: 5000 } },
            { name: 'likes', total_value: { value: 250 } },
            { name: 'followers_count', total_value: { value: 150 } }
          ]
        })
      });

      const result = await threadsApi.getAccountInsights('token', { period: 7 });

      expect(result.views).toBe(5000);
      expect(result.likes).toBe(250);
      expect(result.followers_count).toBe(150);
      expect(result.period).toBe(7);
    });

    it('should handle API errors gracefully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'Internal error' } })
      });

      const result = await threadsApi.getAccountInsights('token');

      expect(result.views).toBe(0);
      expect(result.error).toBeDefined();
    });
  });

  describe('normalizeThread', () => {
    it('should normalize API response to internal format', () => {
      const apiThread = mockThreadsApiResponse.data[0];
      const insights = mockThreadInsights;

      const result = threadsApi.normalizeThread(apiThread, insights);

      expect(result.id).toBe(apiThread.id);
      expect(result.text).toBe(apiThread.text);
      expect(result.url).toBe(apiThread.permalink);
      expect(result.views).toBe(insights.views);
    });

    it('should extract hashtags from text', () => {
      const apiThread = {
        ...mockThreadsApiResponse.data[0],
        text: 'Post with #hashtag1 and #hashtag2'
      };

      const result = threadsApi.normalizeThread(apiThread);

      expect(result.hashtags).toEqual(['hashtag1', 'hashtag2']);
    });

    it('should generate title from text', () => {
      const apiThread = {
        ...mockThreadsApiResponse.data[0],
        text: 'This is a very long text that should be truncated to create a title'
      };

      const result = threadsApi.normalizeThread(apiThread);

      expect(result.title).toBeTruthy();
      expect(result.title.length).toBeLessThanOrEqual(53); // 50 + '...'
    });

    it('should handle empty text', () => {
      const apiThread = {
        ...mockThreadsApiResponse.data[0],
        text: ''
      };

      const result = threadsApi.normalizeThread(apiThread);

      expect(result.title).toBe('Untitled Thread');
      expect(result.hashtags).toEqual([]);
    });
  });

  describe('getAllUserThreads', () => {
    it('should fetch all threads with pagination', async () => {
      // First page
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [mockThreadsApiResponse.data[0]],
          paging: { cursors: { after: 'cursor_1' } }
        })
      });

      // Second page
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [mockThreadsApiResponse.data[1]],
          paging: {}
        })
      });

      const result = await threadsApi.getAllUserThreads('token');

      expect(result).toHaveLength(2);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should filter out quote posts and reposts', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { ...mockThreadsApiResponse.data[0], is_quote_post: false },
            { ...mockThreadsApiResponse.data[1], is_quote_post: true },
            {
              id: 'thread_789',
              media_type: 'REPOST_FACADE',
              text: 'Repost'
            }
          ],
          paging: {}
        })
      });

      const result = await threadsApi.getAllUserThreads('token');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('thread_123');
    });
  });

  describe('Token Management', () => {
    describe('exchangeForLongLivedToken', () => {
      it('should exchange short-lived token for long-lived', async () => {
        const mockResponse = {
          access_token: 'long_lived_token',
          token_type: 'bearer',
          expires_in: 5184000
        };

        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await threadsApi.exchangeForLongLivedToken(
          'short_token',
          'app_secret'
        );

        expect(result.access_token).toBe('long_lived_token');
        expect(result.expires_in).toBe(5184000);
      });

      it('should throw error on failed exchange', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({
            error: { message: 'Invalid token' }
          })
        });

        await expect(
          threadsApi.exchangeForLongLivedToken('bad_token', 'secret')
        ).rejects.toThrow('Invalid token');
      });
    });

    describe('refreshLongLivedToken', () => {
      it('should refresh long-lived token via server', async () => {
        const mockResponse = {
          access_token: 'refreshed_token',
          expires_in: 5184000
        };

        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await threadsApi.refreshLongLivedToken('old_token');

        expect(result.access_token).toBe('refreshed_token');
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('https://threads-murex-eight.vercel.app/api/refresh')
        );
      });

      it('should handle refresh errors', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'Refresh failed' } })
        });

        await expect(
          threadsApi.refreshLongLivedToken('token')
        ).rejects.toThrow('Refresh failed');
      });
    });
  });
});
