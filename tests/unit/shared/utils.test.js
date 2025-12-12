/**
 * Unit Tests for Shared Utilities (utils.js)
 */

import {
  sleep,
  retryWithBackoff,
  formatDate,
  truncateText,
  debounce,
  generateId,
  getErrorMessage
} from '../../../src/shared/utils.js';

describe('Utility Functions', () => {
  describe('sleep', () => {
    it('should wait for specified milliseconds', async () => {
      const start = Date.now();
      await sleep(100);
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(90);
      expect(duration).toBeLessThan(150);
    });

    it('should return a promise', () => {
      const result = sleep(10);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('retryWithBackoff', () => {
    it('should succeed on first try if function succeeds', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');

      const result = await retryWithBackoff(mockFn, 3, 10);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const mockFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValueOnce('success');

      const result = await retryWithBackoff(mockFn, 3, 10);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should throw last error after max retries', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Persistent failure'));

      await expect(retryWithBackoff(mockFn, 3, 10)).rejects.toThrow('Persistent failure');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff delays', async () => {
      const mockFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failure 1'))
        .mockRejectedValueOnce(new Error('Failure 2'))
        .mockResolvedValueOnce('success');

      const start = Date.now();
      await retryWithBackoff(mockFn, 3, 100);
      const duration = Date.now() - start;

      // Should wait 100ms + 200ms = 300ms total (approximately)
      expect(duration).toBeGreaterThanOrEqual(250);
    });
  });

  describe('formatDate', () => {
    it('should format date to ISO string', () => {
      const date = new Date('2024-12-10T10:00:00.000Z');
      const result = formatDate(date);

      expect(result).toBe('2024-12-10T10:00:00.000Z');
    });

    it('should handle current date', () => {
      const now = new Date();
      const result = formatDate(now);

      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('truncateText', () => {
    it('should not truncate text shorter than max length', () => {
      const text = 'Short text';
      const result = truncateText(text, 100);

      expect(result).toBe('Short text');
    });

    it('should truncate long text and add ellipsis', () => {
      const text = 'This is a very long text that needs to be truncated';
      const result = truncateText(text, 20);

      expect(result).toBe('This is a very lo...');
      expect(result.length).toBe(20);
    });

    it('should use default max length of 100', () => {
      const text = 'a'.repeat(150);
      const result = truncateText(text);

      expect(result.length).toBe(100);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should handle empty string', () => {
      const result = truncateText('', 50);
      expect(result).toBe('');
    });
  });

  describe('debounce', () => {
    jest.useFakeTimers();

    it('should delay function execution', () => {
      const mockFn = jest.fn();
      const debounced = debounce(mockFn, 300);

      debounced();
      expect(mockFn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(300);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should cancel previous calls when called multiple times', () => {
      const mockFn = jest.fn();
      const debounced = debounce(mockFn, 300);

      debounced();
      debounced();
      debounced();

      jest.advanceTimersByTime(300);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments to debounced function', () => {
      const mockFn = jest.fn();
      const debounced = debounce(mockFn, 300);

      debounced('arg1', 'arg2');
      jest.advanceTimersByTime(300);

      expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    afterEach(() => {
      jest.clearAllTimers();
    });
  });

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();

      expect(id1).not.toBe(id2);
    });

    it('should generate alphanumeric IDs', () => {
      const id = generateId();

      expect(id).toMatch(/^[a-z0-9]+$/);
    });

    it('should generate consistent length IDs', () => {
      const ids = Array(100).fill(0).map(() => generateId());
      const lengths = ids.map(id => id.length);
      const uniqueLengths = new Set(lengths);

      // Length should be relatively consistent
      expect(uniqueLengths.size).toBeLessThan(5);
    });
  });

  describe('getErrorMessage', () => {
    it('should extract message from Error object', () => {
      const error = new Error('Test error message');
      const result = getErrorMessage(error);

      expect(result).toBe('Test error message');
    });

    it('should return string if error is string', () => {
      const result = getErrorMessage('String error');

      expect(result).toBe('String error');
    });

    it('should handle unknown error types', () => {
      const result = getErrorMessage({ code: 500 });

      expect(result).toBe('An unknown error occurred');
    });

    it('should handle null/undefined', () => {
      expect(getErrorMessage(null)).toBe('An unknown error occurred');
      expect(getErrorMessage(undefined)).toBe('An unknown error occurred');
    });
  });
});
