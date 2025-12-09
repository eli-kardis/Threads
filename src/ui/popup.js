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
  const history = await chrome.runtime.sendMessage({
    type: 'GET_SYNC_HISTORY',
    limit: 5
  });

  const statusClass = currentStatus.isSyncing ? '' : (currentStatus.autoSync ? '' : 'inactive');
  const statusText = currentStatus.isSyncing
    ? '동기화 중...'
    : (currentStatus.autoSync ? '자동 동기화 활성' : '자동 동기화 비활성');

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
          <div class="stat-value">${currentStatus.recentStats.total}</div>
          <div class="stat-label">전체</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${currentStatus.recentStats.success}</div>
          <div class="stat-label">성공</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${currentStatus.recentStats.failed}</div>
          <div class="stat-label">실패</div>
        </div>
      </div>
    </section>

    <div class="actions">
      <button class="btn btn-primary" id="syncNowBtn" ${currentStatus.isSyncing ? 'disabled' : ''}>
        ${currentStatus.isSyncing ? '⏳ 동기화 중...' : '🔄 지금 동기화'}
      </button>
      <button class="btn btn-secondary" id="openNotionBtn">
        📝 Notion에서 보기
      </button>
    </div>

    <section class="recent-section">
      <h3 class="section-title">최근 활동</h3>
      <div class="activity-list" id="activityList">
        ${renderActivityList(history)}
      </div>
    </section>
  `;

  // 이벤트 리스너
  document.getElementById('syncNowBtn').addEventListener('click', handleSyncNow);
  document.getElementById('openNotionBtn').addEventListener('click', openNotion);
}

/**
 * 활동 목록 렌더링
 */
function renderActivityList(history) {
  if (!history || history.length === 0) {
    return '<div class="empty-state">아직 동기화된 게시글이 없습니다</div>';
  }

  return history.map(item => `
    <div class="activity-item">
      <div class="activity-icon ${item.status}">
        ${item.status === 'success' ? '✓' : '✕'}
      </div>
      <div class="activity-content">
        <div class="activity-title">Thread ${item.threadId?.slice(0, 8) || 'Unknown'}</div>
        <div class="activity-time">${formatRelativeTime(item.timestamp)}</div>
      </div>
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
      syncBtn.innerHTML = `✓ ${result.syncedCount}개 동기화됨`;
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
function openNotion() {
  chrome.tabs.create({ url: 'https://www.notion.so' });
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
