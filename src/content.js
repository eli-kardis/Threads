/**
 * Content Script
 * Threads 웹 페이지에서 새 글 작성을 감지
 */

// 감지된 게시글 ID 캐시 (중복 방지)
const detectedPosts = new Set();

/**
 * 초기화
 */
function init() {
  console.log('Threads to Notion Sync: Content script loaded');

  // DOM 변경 감시 시작
  observeDOM();

  // 네트워크 요청 감시 (선택적)
  // observeNetworkRequests();
}

/**
 * DOM 변경 감시 (MutationObserver)
 */
function observeDOM() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        checkForNewPosts(mutation.addedNodes);
      }
    }
  });

  // body 전체 감시 (더 정밀한 타겟팅 가능)
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  console.log('DOM observer started');
}

/**
 * 새 게시글 확인
 * @param {NodeList} nodes
 */
function checkForNewPosts(nodes) {
  nodes.forEach(node => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    // Threads의 게시글 컨테이너 선택자 (실제 DOM 구조에 맞게 수정 필요)
    const postElements = node.querySelectorAll
      ? node.querySelectorAll('[data-testid="thread-item"], article')
      : [];

    postElements.forEach(postElement => {
      const postData = extractPostData(postElement);
      if (postData && !detectedPosts.has(postData.id)) {
        detectedPosts.add(postData.id);
        notifyNewPost(postData);
      }
    });
  });
}

/**
 * 게시글 요소에서 데이터 추출
 * @param {Element} element
 * @returns {Object|null}
 */
function extractPostData(element) {
  try {
    // 게시글 ID 추출 (실제 DOM 구조에 맞게 수정 필요)
    const postId = element.getAttribute('data-post-id') ||
      element.querySelector('[data-post-id]')?.getAttribute('data-post-id') ||
      generateTempId();

    // 게시글 텍스트 추출
    const textElement = element.querySelector('[data-testid="post-text"], .post-content, p');
    const text = textElement?.textContent?.trim() || '';

    if (!text) return null;

    // 이미지 URL 추출
    const imageElement = element.querySelector('img[src*="threads"], img[src*="instagram"]');
    const imageUrl = imageElement?.src || null;

    // 작성 시간 추출
    const timeElement = element.querySelector('time');
    const createdAt = timeElement?.getAttribute('datetime') || new Date().toISOString();

    // 게시글 링크 추출
    const linkElement = element.querySelector('a[href*="/post/"], a[href*="/t/"]');
    const url = linkElement?.href || window.location.href;

    // 해시태그 추출
    const hashtags = extractHashtags(text);

    return {
      id: postId,
      text,
      title: generateTitle(text),
      imageUrl,
      url,
      createdAt,
      hashtags,
      username: extractUsername()
    };
  } catch (error) {
    console.error('Failed to extract post data:', error);
    return null;
  }
}

/**
 * 해시태그 추출
 * @param {string} text
 * @returns {Array<string>}
 */
function extractHashtags(text) {
  const hashtagRegex = /#[\w가-힣]+/g;
  const matches = text.match(hashtagRegex) || [];
  return matches.map(tag => tag.slice(1));
}

/**
 * 제목 생성
 * @param {string} text
 * @returns {string}
 */
function generateTitle(text) {
  if (!text) return 'Untitled Thread';
  const firstLine = text.split('\n')[0];
  const title = firstLine.slice(0, 50);
  return title.length < firstLine.length ? `${title}...` : title;
}

/**
 * 현재 사용자 이름 추출
 * @returns {string}
 */
function extractUsername() {
  // URL에서 추출 시도
  const pathMatch = window.location.pathname.match(/^\/@([^/]+)/);
  if (pathMatch) return pathMatch[1];

  // 프로필 요소에서 추출 시도
  const profileElement = document.querySelector('[data-testid="profile-username"]');
  return profileElement?.textContent?.replace('@', '') || 'unknown';
}

/**
 * 임시 ID 생성
 * @returns {string}
 */
function generateTempId() {
  return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 백그라운드 스크립트에 새 글 알림
 * @param {Object} postData
 */
async function notifyNewPost(postData) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'NEW_POST_DETECTED',
      postData
    });

    if (response?.success) {
      console.log('Post synced successfully:', postData.id);
      showSyncIndicator(true);
    } else {
      console.log('Post sync result:', response);
    }
  } catch (error) {
    console.error('Failed to notify background:', error);
  }
}

/**
 * 동기화 상태 표시 (선택적)
 * @param {boolean} success
 */
function showSyncIndicator(success) {
  // 페이지에 작은 알림 표시 (선택적 구현)
  const indicator = document.createElement('div');
  indicator.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    background: ${success ? '#10B981' : '#EF4444'};
    color: white;
    border-radius: 8px;
    font-size: 14px;
    z-index: 10000;
    animation: fadeIn 0.3s ease;
  `;
  indicator.textContent = success ? '✓ Synced to Notion' : '✕ Sync failed';

  document.body.appendChild(indicator);

  setTimeout(() => {
    indicator.style.opacity = '0';
    indicator.style.transition = 'opacity 0.3s ease';
    setTimeout(() => indicator.remove(), 300);
  }, 3000);
}

/**
 * 게시 버튼 클릭 감지 (대체 방식)
 */
function observePostButton() {
  document.addEventListener('click', (event) => {
    const target = event.target;

    // 게시 버튼 클릭 감지 (실제 선택자 확인 필요)
    if (
      target.matches('[data-testid="post-button"]') ||
      target.matches('button[type="submit"]') ||
      target.textContent?.includes('게시') ||
      target.textContent?.includes('Post')
    ) {
      console.log('Post button clicked, waiting for new post...');

      // 게시 후 잠시 대기 후 새 글 확인
      setTimeout(() => {
        scanForRecentPosts();
      }, 2000);
    }
  }, true);
}

/**
 * 최근 게시글 스캔
 */
function scanForRecentPosts() {
  const postElements = document.querySelectorAll(
    '[data-testid="thread-item"], article'
  );

  postElements.forEach(element => {
    const postData = extractPostData(element);
    if (postData && !detectedPosts.has(postData.id)) {
      detectedPosts.add(postData.id);
      notifyNewPost(postData);
    }
  });
}

// 페이지 로드 시 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// 게시 버튼 감시 추가
observePostButton();
