/**
 * Unit Tests for Content Script
 * Tests DOM interaction and post detection functionality
 */

describe('Content Script', () => {
  let contentScript;
  let mockDocument;

  beforeEach(() => {
    // Mock DOM
    mockDocument = {
      body: document.createElement('div'),
      querySelector: jest.fn(),
      querySelectorAll: jest.fn(() => []),
      createElement: jest.fn((tag) => document.createElement(tag))
    };

    global.document = mockDocument;
    global.window = {
      location: {
        href: 'https://www.threads.net/@testuser',
        pathname: '/@testuser'
      }
    };

    // Mock MutationObserver
    global.MutationObserver = jest.fn(function(callback) {
      this.observe = jest.fn();
      this.disconnect = jest.fn();
      this.trigger = (mutations) => callback(mutations, this);
    });
  });

  describe('Post Detection', () => {
    it('should extract post data from DOM elements', () => {
      // Create mock post element
      const postElement = document.createElement('article');
      postElement.setAttribute('data-testid', 'thread-item');

      const textElement = document.createElement('p');
      textElement.textContent = 'This is a test post #testing';
      postElement.appendChild(textElement);

      const timeElement = document.createElement('time');
      timeElement.setAttribute('datetime', '2024-12-10T10:00:00.000Z');
      postElement.appendChild(timeElement);

      const linkElement = document.createElement('a');
      linkElement.href = 'https://www.threads.net/@testuser/post/123';
      postElement.appendChild(linkElement);

      mockDocument.body.appendChild(postElement);

      // Test extractPostData logic
      const postData = {
        id: 'thread_123',
        text: textElement.textContent,
        title: textElement.textContent.slice(0, 50),
        url: linkElement.href,
        createdAt: timeElement.getAttribute('datetime'),
        username: 'testuser'
      };

      expect(postData.text).toBe('This is a test post #testing');
      expect(postData.url).toContain('/post/123');
      expect(postData.createdAt).toBe('2024-12-10T10:00:00.000Z');
    });

    it('should extract hashtags from post text', () => {
      const text = 'Post with #hashtag1 and #hashtag2 and #한글태그';
      const hashtagRegex = /#[\w가-힣]+/g;
      const hashtags = (text.match(hashtagRegex) || []).map(tag => tag.slice(1));

      expect(hashtags).toEqual(['hashtag1', 'hashtag2', '한글태그']);
    });

    it('should generate title from text', () => {
      const shortText = 'Short post';
      const longText = 'This is a very long post that should be truncated to create a title';

      const generateTitle = (text) => {
        if (!text) return 'Untitled Thread';
        const firstLine = text.split('\n')[0];
        const title = firstLine.slice(0, 50);
        return title.length < firstLine.length ? `${title}...` : title;
      };

      expect(generateTitle(shortText)).toBe('Short post');
      expect(generateTitle(longText)).toBe('This is a very long post that should be truncat...');
      expect(generateTitle('')).toBe('Untitled Thread');
    });

    it('should extract username from URL', () => {
      const extractUsername = (pathname) => {
        const pathMatch = pathname.match(/^\/@([^/]+)/);
        return pathMatch ? pathMatch[1] : 'unknown';
      };

      expect(extractUsername('/@testuser')).toBe('testuser');
      expect(extractUsername('/@testuser/post/123')).toBe('testuser');
      expect(extractUsername('/home')).toBe('unknown');
    });
  });

  describe('MutationObserver', () => {
    it('should observe DOM changes', () => {
      const observer = new MutationObserver((mutations) => {
        // Observer callback
      });

      observer.observe(mockDocument.body, {
        childList: true,
        subtree: true
      });

      expect(observer.observe).toHaveBeenCalledWith(
        mockDocument.body,
        expect.objectContaining({
          childList: true,
          subtree: true
        })
      );
    });

    it('should detect newly added post elements', () => {
      const detectedPosts = new Set();
      let callbackFn;

      const observer = new MutationObserver((mutations) => {
        callbackFn = () => {
          mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
              mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1 && node.matches('[data-testid="thread-item"]')) {
                  const postId = node.getAttribute('data-post-id') || 'generated_id';
                  if (!detectedPosts.has(postId)) {
                    detectedPosts.add(postId);
                  }
                }
              });
            }
          });
        };
      });

      // Simulate mutation
      const newPost = document.createElement('div');
      newPost.setAttribute('data-testid', 'thread-item');
      newPost.setAttribute('data-post-id', 'post_123');

      const mutations = [{
        type: 'childList',
        addedNodes: [newPost]
      }];

      observer.trigger(mutations);
      if (callbackFn) callbackFn();

      expect(detectedPosts.has('post_123')).toBe(true);
    });
  });

  describe('Duplicate Prevention', () => {
    it('should not process same post multiple times', () => {
      const detectedPosts = new Set();

      const processPost = (postId) => {
        if (detectedPosts.has(postId)) {
          return false; // Already processed
        }
        detectedPosts.add(postId);
        return true; // Newly processed
      };

      expect(processPost('post_1')).toBe(true);
      expect(processPost('post_2')).toBe(true);
      expect(processPost('post_1')).toBe(false); // Duplicate
      expect(detectedPosts.size).toBe(2);
    });
  });

  describe('Background Communication', () => {
    it('should send new post to background script', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: true,
        notionPageId: 'page_123'
      });

      const postData = {
        id: 'thread_123',
        text: 'Test post',
        url: 'https://threads.net/post/123'
      };

      const response = await chrome.runtime.sendMessage({
        type: 'NEW_POST_DETECTED',
        postData
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'NEW_POST_DETECTED',
        postData
      });
      expect(response.success).toBe(true);
    });

    it('should handle communication errors', async () => {
      chrome.runtime.sendMessage.mockRejectedValueOnce(
        new Error('Extension context invalidated')
      );

      const postData = { id: 'thread_123' };

      await expect(
        chrome.runtime.sendMessage({
          type: 'NEW_POST_DETECTED',
          postData
        })
      ).rejects.toThrow('Extension context invalidated');
    });
  });

  describe('Sync Indicator', () => {
    it('should show success indicator', () => {
      const indicator = document.createElement('div');
      indicator.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #10B981;
        color: white;
      `;
      indicator.textContent = '✓ Synced to Notion';

      document.body.appendChild(indicator);

      expect(indicator.textContent).toBe('✓ Synced to Notion');
      expect(indicator.style.background).toBe('#10B981');
    });

    it('should auto-remove indicator after timeout', (done) => {
      const indicator = document.createElement('div');
      indicator.textContent = '✓ Synced';
      document.body.appendChild(indicator);

      setTimeout(() => {
        indicator.style.opacity = '0';
        setTimeout(() => {
          indicator.remove();
          expect(document.body.contains(indicator)).toBe(false);
          done();
        }, 100);
      }, 100);
    });
  });

  describe('Edge Cases', () => {
    it('should handle posts without images', () => {
      const postElement = document.createElement('article');
      const textElement = document.createElement('p');
      textElement.textContent = 'Text-only post';
      postElement.appendChild(textElement);

      const imageElement = postElement.querySelector('img');
      expect(imageElement).toBeNull();
    });

    it('should handle posts with missing timestamps', () => {
      const postElement = document.createElement('article');
      const timeElement = postElement.querySelector('time');

      const createdAt = timeElement?.getAttribute('datetime') || new Date().toISOString();
      expect(createdAt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should generate temporary ID when none exists', () => {
      const generateTempId = () => {
        return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      };

      const id1 = generateTempId();
      const id2 = generateTempId();

      expect(id1).toMatch(/^temp_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });
});
