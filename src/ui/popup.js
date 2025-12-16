/**
 * Popup UI 로직
 */

// DOM 요소
const mainContent = document.getElementById('mainContent');
const settingsBtn = document.getElementById('settingsBtn');

// 상태
let currentStatus = null;

/**
 * 초기화
 */
async function init() {
  settingsBtn.addEventListener('click', openSettings);

  await loadStatus();
}

/**
 * 설정 페이지 열기
 */
function openSettings() {
  chrome.runtime.openOptionsPage();
}

/**
 * 상태 로드
 */
async function loadStatus() {
  try {
    currentStatus = await chrome.runtime.sendMessage({ type: 'GET_SYNC_STATUS' });
    renderContent();
  } catch (error) {
    console.error('Failed to load status:', error);
    renderError();
  }
}

/**
 * 콘텐츠 렌더링
 */
function renderContent() {
  if (!currentStatus.isConfigured) {
    renderNotConfigured();
    return;
  }

  renderConfigured();
}

/**
 * 설정 미완료 상태 렌더링
 */
function renderNotConfigured() {
  mainContent.innerHTML = `
    <div class="not-configured">
      <div class="not-configured-icon">⚙️</div>
      <h2 class="not-configured-title">설정이 필요합니다</h2>
      <p class="not-configured-desc">
        Threads와 Notion을 연결하려면<br>
        API 토큰을 설정해주세요.
      </p>
      <button class="btn btn-primary" id="setupBtn">
        설정하기
      </button>
    </div>
  `;

  document.getElementById('setupBtn').addEventListener('click', openSettings);
}

/**
 * 설정 완료 상태 렌더링
 */
async function renderConfigured() {
  const [history, weekInsights, monthInsights, totalInsights] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'GET_SYNC_HISTORY', limit: 5 }),
    chrome.runtime.sendMessage({ type: 'GET_AGGREGATED_INSIGHTS', period: 7 }),
    chrome.runtime.sendMessage({ type: 'GET_AGGREGATED_INSIGHTS', period: 30 }),
    chrome.runtime.sendMessage({ type: 'GET_AGGREGATED_INSIGHTS', period: 90 })
  ]);

  const statusClass = currentStatus.isSyncing ? '' : '';
  const totalViews = totalInsights.views || 0;
  const followers = totalInsights.followers_count || 0;
  const conversionRate = totalViews > 0 ? ((followers / totalViews) * 100).toFixed(2) : 0;
  const statusText = currentStatus.isSyncing
    ? '동기화 중...'
    : `팔로워 전환율 ${conversionRate}%`;

  const lastSyncText = currentStatus.lastSyncTime
    ? formatRelativeTime(currentStatus.lastSyncTime)
    : '아직 동기화된 적 없음';

  mainContent.innerHTML = `
    <section class="status-section">
      <div class="status-header">
        <div class="status-indicator ${statusClass}"></div>
        <div>
          <div class="status-text">${statusText}</div>
          <div class="last-sync">마지막 동기화: ${lastSyncText}</div>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${formatCompactNumber(weekInsights.views || 0)}</div>
          <div class="stat-label">이번 주</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${formatCompactNumber(monthInsights.views || 0)}</div>
          <div class="stat-label">이번 달</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${formatCompactNumber(totalInsights.views || 0)}</div>
          <div class="stat-label">전체</div>
        </div>
      </div>
    </section>

    <div class="actions">
      <button class="btn btn-primary" id="syncNowBtn" ${currentStatus.isSyncing ? 'disabled' : ''}>
        ${currentStatus.isSyncing ? '⏳ 동기화 중...' : '🔄 지금 동기화'}
      </button>
      <button class="btn btn-secondary" id="openDashboardBtn">
        📊 대시보드
      </button>
    </div>

    <section class="recent-section">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h3 class="section-title" style="margin: 0;">최근 활동</h3>
        <a href="#" id="openNotionBtn" style="font-size: 12px; color: #1F3A5F; text-decoration: none;">Notion에서 보기 →</a>
      </div>
      <div class="activity-list" id="activityList">
        ${renderActivityList(history)}
      </div>
    </section>
  `;

  // 이벤트 리스너
  document.getElementById('syncNowBtn').addEventListener('click', handleSyncNow);
  document.getElementById('openDashboardBtn').addEventListener('click', openDashboard);
  document.getElementById('openNotionBtn').addEventListener('click', openNotion);

  // 활동 항목 클릭 이벤트
  document.querySelectorAll('.activity-item[data-notion-id]').forEach(item => {
    item.addEventListener('click', () => {
      const notionId = item.dataset.notionId;
      if (notionId) {
        chrome.tabs.create({ url: `https://www.notion.so/${notionId.replace(/-/g, '')}` });
      }
    });
  });
}

/**
 * 활동 목록 렌더링
 */
function renderActivityList(history) {
  if (!history || history.length === 0) {
    return '<div class="empty-state">아직 동기화된 게시글이 없습니다</div>';
  }

  // 타임스탬프 기준 내림차순 정렬 (최신순)
  const sortedHistory = [...history].sort((a, b) =>
    new Date(b.timestamp) - new Date(a.timestamp)
  );

  return sortedHistory.map(item => `
    <div class="activity-item" ${item.notionPageId ? `data-notion-id="${item.notionPageId}"` : ''} style="cursor: ${item.notionPageId ? 'pointer' : 'default'};">
      <div class="activity-icon ${item.status}">
        ${item.status === 'success' ? '✓' : '✕'}
      </div>
      <div class="activity-content">
        <div class="activity-title">${item.title || `Thread ${item.threadId?.slice(0, 8) || 'Unknown'}`}</div>
        <div class="activity-time">
          ${formatRelativeTime(item.timestamp)}
          ${item.status === 'failed' && item.error ? ` - ${item.error.slice(0, 30)}...` : ''}
        </div>
      </div>
      ${item.notionPageId ? '<span style="color: #9CA3AF; font-size: 12px;">→</span>' : ''}
    </div>
  `).join('');
}

/**
 * 지금 동기화 버튼 핸들러
 */
async function handleSyncNow() {
  const syncBtn = document.getElementById('syncNowBtn');
  syncBtn.disabled = true;
  syncBtn.innerHTML = '⏳ 동기화 중...';

  try {
    const result = await chrome.runtime.sendMessage({ type: 'SYNC_NOW' });

    if (result.success) {
      const parts = [];
      if (result.refreshedCount > 0) parts.push(`${result.refreshedCount}개 새로고침`);
      if (result.syncedCount > 0) parts.push(`${result.syncedCount}개 동기화`);
      syncBtn.innerHTML = parts.length > 0 ? `✓ ${parts.join(', ')}` : '✓ 최신 상태';
    } else {
      syncBtn.innerHTML = '✕ ' + (result.message || result.error);
    }

    // 상태 새로고침
    setTimeout(async () => {
      await loadStatus();
    }, 2000);
  } catch (error) {
    console.error('Sync failed:', error);
    syncBtn.innerHTML = '✕ 동기화 실패';
    syncBtn.disabled = false;
  }
}

/**
 * Notion 열기
 */
function openNotion(e) {
  e.preventDefault();
  chrome.tabs.create({ url: 'https://www.notion.so' });
}

/**
 * 대시보드 열기
 */
function openDashboard() {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/dashboard.html') });
}

/**
 * 숫자 포맷 (콤마 구분)
 */
function formatNumber(num) {
  return num.toLocaleString();
}

/**
 * 숫자 포맷 (K/M 축약, 팝업용)
 */
function formatCompactNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return num.toLocaleString();
}

/**
 * 상대 시간 포맷
 */
function formatRelativeTime(timestamp) {
  if (!timestamp) return '알 수 없음';

  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;

  return date.toLocaleDateString('ko-KR');
}

/**
 * 에러 상태 렌더링
 */
function renderError() {
  mainContent.innerHTML = `
    <div class="not-configured">
      <div class="not-configured-icon">⚠️</div>
      <h2 class="not-configured-title">오류가 발생했습니다</h2>
      <p class="not-configured-desc">
        확장 프로그램을 다시 로드해주세요.
      </p>
      <button class="btn btn-primary" id="reloadBtn">
        다시 시도
      </button>
    </div>
  `;

  document.getElementById('reloadBtn').addEventListener('click', () => {
    location.reload();
  });
}

// 초기화
document.addEventListener('DOMContentLoaded', init);
