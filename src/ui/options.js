/**
 * Options 페이지 로직
 */

// DOM 요소
const elements = {
  threadsToken: document.getElementById('threadsToken'),
  notionSecret: document.getElementById('notionSecret'),
  notionDbId: document.getElementById('notionDbId'),
  testThreadsBtn: document.getElementById('testThreadsBtn'),
  testNotionBtn: document.getElementById('testNotionBtn'),
  threadsStatus: document.getElementById('threadsStatus'),
  notionStatus: document.getElementById('notionStatus'),
  loadFieldsBtn: document.getElementById('loadFieldsBtn'),
  mappingTitle: document.getElementById('mappingTitle'),
  mappingContent: document.getElementById('mappingContent'),
  mappingImage: document.getElementById('mappingImage'),
  mappingTags: document.getElementById('mappingTags'),
  mappingCreatedAt: document.getElementById('mappingCreatedAt'),
  mappingSourceUrl: document.getElementById('mappingSourceUrl'),
  hashtagFilterEnabled: document.getElementById('hashtagFilterEnabled'),
  hashtagFilterOptions: document.getElementById('hashtagFilterOptions'),
  hashtagFilterMode: document.getElementById('hashtagFilterMode'),
  hashtagList: document.getElementById('hashtagList'),
  hashtagTags: document.getElementById('hashtagTags'),
  autoSync: document.getElementById('autoSync'),
  syncInterval: document.getElementById('syncInterval'),
  saveBtn: document.getElementById('saveBtn'),
  resetBtn: document.getElementById('resetBtn'),
  saveStatus: document.getElementById('saveStatus'),
  loadingOverlay: document.getElementById('loadingOverlay')
};

// 현재 설정
let currentSettings = {};

/**
 * 초기화
 */
async function init() {
  await loadSettings();
  setupEventListeners();
}

/**
 * 설정 로드
 */
async function loadSettings() {
  showLoading(true);

  try {
    // Storage에서 직접 로드
    const data = await chrome.storage.local.get([
      'threadsAccessToken',
      'notionSecret',
      'notionDatabaseId',
      'fieldMapping',
      'syncOptions',
      'hashtagFilters'
    ]);

    currentSettings = data;

    // 폼에 값 설정
    if (data.threadsAccessToken) {
      elements.threadsToken.value = data.threadsAccessToken;
    }

    if (data.notionSecret) {
      elements.notionSecret.value = data.notionSecret;
    }

    if (data.notionDatabaseId) {
      elements.notionDbId.value = data.notionDatabaseId;
    }

    if (data.syncOptions) {
      elements.autoSync.checked = data.syncOptions.autoSync !== false;
      elements.syncInterval.value = data.syncOptions.syncInterval || 5;
    }

    // 해시태그 필터 설정
    if (data.hashtagFilters) {
      elements.hashtagFilterEnabled.checked = data.hashtagFilters.enabled;
      elements.hashtagFilterMode.value = data.hashtagFilters.mode || 'include';
      if (data.hashtagFilters.hashtags && data.hashtagFilters.hashtags.length > 0) {
        elements.hashtagList.value = data.hashtagFilters.hashtags.join(', ');
        renderHashtagTags(data.hashtagFilters.hashtags);
      }
      toggleHashtagOptions();
    }

    // 필드 매핑이 있으면 필드 목록 로드 시도
    if (data.notionSecret && data.notionDatabaseId) {
      await loadNotionFields();

      if (data.fieldMapping) {
        setFieldMappings(data.fieldMapping);
      }
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
    showStatus('saveStatus', '설정을 불러오는데 실패했습니다', 'error');
  } finally {
    showLoading(false);
  }
}

/**
 * 이벤트 리스너 설정
 */
function setupEventListeners() {
  elements.testThreadsBtn.addEventListener('click', testThreadsConnection);
  elements.testNotionBtn.addEventListener('click', testNotionConnection);
  elements.loadFieldsBtn.addEventListener('click', loadNotionFields);
  elements.saveBtn.addEventListener('click', saveSettings);
  elements.resetBtn.addEventListener('click', resetSettings);

  // 해시태그 필터 이벤트
  elements.hashtagFilterEnabled.addEventListener('change', toggleHashtagOptions);
  elements.hashtagList.addEventListener('input', debounce(updateHashtagTags, 300));
}

/**
 * 해시태그 필터 옵션 표시/숨기기
 */
function toggleHashtagOptions() {
  const isEnabled = elements.hashtagFilterEnabled.checked;
  elements.hashtagFilterOptions.style.display = isEnabled ? 'block' : 'none';
}

/**
 * 해시태그 태그 렌더링
 */
function renderHashtagTags(hashtags) {
  elements.hashtagTags.innerHTML = hashtags.map(tag => `
    <span style="
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      background: #E0F2FE;
      color: #0369A1;
      border-radius: 16px;
      font-size: 12px;
    ">
      #${tag}
    </span>
  `).join('');
}

/**
 * 해시태그 입력 업데이트
 */
function updateHashtagTags() {
  const input = elements.hashtagList.value;
  const hashtags = parseHashtags(input);
  renderHashtagTags(hashtags);
}

/**
 * 해시태그 문자열 파싱
 */
function parseHashtags(input) {
  return input
    .split(',')
    .map(tag => tag.trim().replace(/^#/, ''))
    .filter(tag => tag.length > 0);
}

/**
 * 디바운스 함수
 */
function debounce(fn, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Threads 연결 테스트
 */
async function testThreadsConnection() {
  const token = elements.threadsToken.value.trim();

  if (!token) {
    showStatus('threadsStatus', '토큰을 입력해주세요', 'error');
    return;
  }

  elements.testThreadsBtn.disabled = true;
  showStatus('threadsStatus', '연결 테스트 중...', 'info');

  try {
    // 임시로 저장 후 테스트
    await chrome.storage.local.set({ threadsAccessToken: token });

    const result = await chrome.runtime.sendMessage({ type: 'TEST_CONNECTIONS' });

    if (result.threads?.success) {
      showStatus('threadsStatus',
        `연결 성공! 사용자: @${result.threads.user?.username || 'Unknown'}`,
        'success'
      );
      elements.threadsToken.classList.remove('error');
      elements.threadsToken.classList.add('success');
    } else {
      showStatus('threadsStatus',
        `연결 실패: ${result.threads?.error || 'Unknown error'}`,
        'error'
      );
      elements.threadsToken.classList.add('error');
    }
  } catch (error) {
    showStatus('threadsStatus', `오류: ${error.message}`, 'error');
  } finally {
    elements.testThreadsBtn.disabled = false;
  }
}

/**
 * Notion 연결 테스트
 */
async function testNotionConnection() {
  const secret = elements.notionSecret.value.trim();
  const dbId = elements.notionDbId.value.trim();

  if (!secret) {
    showStatus('notionStatus', '시크릿 키를 입력해주세요', 'error');
    return;
  }

  elements.testNotionBtn.disabled = true;
  showStatus('notionStatus', '연결 테스트 중...', 'info');

  try {
    // 임시로 저장 후 테스트
    await chrome.storage.local.set({
      notionSecret: secret,
      notionDatabaseId: dbId
    });

    const result = await chrome.runtime.sendMessage({ type: 'TEST_CONNECTIONS' });

    if (result.notion?.success) {
      showStatus('notionStatus',
        `연결 성공! 사용자: ${result.notion.user?.name || 'Bot'}`,
        'success'
      );
      elements.notionSecret.classList.remove('error');
      elements.notionSecret.classList.add('success');

      // 필드 목록 자동 로드
      if (dbId) {
        await loadNotionFields();
      }
    } else {
      showStatus('notionStatus',
        `연결 실패: ${result.notion?.error || 'Unknown error'}`,
        'error'
      );
      elements.notionSecret.classList.add('error');
    }
  } catch (error) {
    showStatus('notionStatus', `오류: ${error.message}`, 'error');
  } finally {
    elements.testNotionBtn.disabled = false;
  }
}

/**
 * Notion 데이터베이스 필드 로드
 */
async function loadNotionFields() {
  const secret = elements.notionSecret.value.trim();
  const dbId = elements.notionDbId.value.trim();

  if (!secret || !dbId) {
    showStatus('notionStatus', 'Notion 시크릿과 DB ID를 먼저 입력해주세요', 'error');
    return;
  }

  elements.loadFieldsBtn.disabled = true;
  showLoading(true);

  try {
    // Notion API로 데이터베이스 정보 조회
    const response = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
      headers: {
        'Authorization': `Bearer ${secret}`,
        'Notion-Version': '2022-06-28'
      }
    });

    if (!response.ok) {
      throw new Error('데이터베이스를 찾을 수 없습니다');
    }

    const database = await response.json();
    const properties = database.properties;

    // 필드 옵션 생성
    updateFieldOptions(properties);

    showStatus('notionStatus', '필드 목록을 불러왔습니다', 'success');
  } catch (error) {
    showStatus('notionStatus', `필드 로드 실패: ${error.message}`, 'error');
  } finally {
    elements.loadFieldsBtn.disabled = false;
    showLoading(false);
  }
}

/**
 * 필드 선택 옵션 업데이트
 */
function updateFieldOptions(properties) {
  const fieldSelects = [
    elements.mappingTitle,
    elements.mappingContent,
    elements.mappingImage,
    elements.mappingTags,
    elements.mappingCreatedAt,
    elements.mappingSourceUrl
  ];

  // 필드 타입별로 분류
  const fields = Object.entries(properties).map(([name, prop]) => ({
    name,
    type: prop.type
  }));

  fieldSelects.forEach(select => {
    // 기존 옵션 제거 (첫 번째 '필드 선택...' 제외)
    while (select.options.length > 1) {
      select.remove(1);
    }

    // 새 옵션 추가
    fields.forEach(field => {
      const option = document.createElement('option');
      option.value = field.name;
      option.textContent = `${field.name} (${field.type})`;
      select.appendChild(option);
    });
  });
}

/**
 * 필드 매핑 값 설정
 */
function setFieldMappings(mapping) {
  if (mapping.title) elements.mappingTitle.value = mapping.title;
  if (mapping.content) elements.mappingContent.value = mapping.content;
  if (mapping.image) elements.mappingImage.value = mapping.image;
  if (mapping.tags) elements.mappingTags.value = mapping.tags;
  if (mapping.createdAt) elements.mappingCreatedAt.value = mapping.createdAt;
  if (mapping.sourceUrl) elements.mappingSourceUrl.value = mapping.sourceUrl;
}

/**
 * 설정 저장
 */
async function saveSettings() {
  elements.saveBtn.disabled = true;
  showLoading(true);

  try {
    const settings = {
      threadsAccessToken: elements.threadsToken.value.trim(),
      notionSecret: elements.notionSecret.value.trim(),
      notionDatabaseId: elements.notionDbId.value.trim(),
      fieldMapping: {
        title: elements.mappingTitle.value,
        content: elements.mappingContent.value,
        image: elements.mappingImage.value,
        tags: elements.mappingTags.value,
        createdAt: elements.mappingCreatedAt.value,
        sourceUrl: elements.mappingSourceUrl.value
      },
      hashtagFilters: {
        enabled: elements.hashtagFilterEnabled.checked,
        mode: elements.hashtagFilterMode.value,
        hashtags: parseHashtags(elements.hashtagList.value)
      },
      syncOptions: {
        autoSync: elements.autoSync.checked,
        syncInterval: parseInt(elements.syncInterval.value, 10)
      }
    };

    // 저장
    await chrome.storage.local.set(settings);

    // 동기화 옵션 업데이트 (백그라운드에 알림)
    await chrome.runtime.sendMessage({
      type: 'UPDATE_SYNC_OPTIONS',
      options: settings.syncOptions
    });

    // 해시태그 필터 업데이트
    await chrome.runtime.sendMessage({
      type: 'UPDATE_HASHTAG_FILTERS',
      filters: settings.hashtagFilters
    });

    showStatus('saveStatus', '설정이 저장되었습니다!', 'success');
  } catch (error) {
    showStatus('saveStatus', `저장 실패: ${error.message}`, 'error');
  } finally {
    elements.saveBtn.disabled = false;
    showLoading(false);
  }
}

/**
 * 설정 초기화
 */
async function resetSettings() {
  if (!confirm('모든 설정을 초기화하시겠습니까?\n저장된 토큰과 동기화 기록이 모두 삭제됩니다.')) {
    return;
  }

  showLoading(true);

  try {
    await chrome.storage.local.clear();

    // 폼 초기화
    elements.threadsToken.value = '';
    elements.notionSecret.value = '';
    elements.notionDbId.value = '';
    elements.autoSync.checked = true;
    elements.syncInterval.value = '5';

    // 필드 매핑 초기화
    [elements.mappingTitle, elements.mappingContent, elements.mappingImage,
      elements.mappingTags, elements.mappingCreatedAt, elements.mappingSourceUrl
    ].forEach(select => {
      select.selectedIndex = 0;
    });

    // 상태 메시지 숨기기
    hideStatus('threadsStatus');
    hideStatus('notionStatus');

    showStatus('saveStatus', '설정이 초기화되었습니다', 'info');
  } catch (error) {
    showStatus('saveStatus', `초기화 실패: ${error.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

/**
 * 상태 메시지 표시
 */
function showStatus(elementId, message, type) {
  const element = document.getElementById(elementId);
  element.textContent = message;
  element.className = `status-message show ${type}`;
}

/**
 * 상태 메시지 숨기기
 */
function hideStatus(elementId) {
  const element = document.getElementById(elementId);
  element.className = 'status-message';
}

/**
 * 로딩 오버레이 표시/숨기기
 */
function showLoading(show) {
  elements.loadingOverlay.className = show ? 'loading-overlay show' : 'loading-overlay';
}

// 초기화
document.addEventListener('DOMContentLoaded', init);
