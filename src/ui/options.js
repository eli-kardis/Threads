/**
 * Options 페이지 로직
 */

// DOM 요소
const elements = {
  threadsToken: document.getElementById('threadsToken'),
  threadsAppSecret: document.getElementById('threadsAppSecret'),
  tokenStatusBox: document.getElementById('tokenStatusBox'),
  tokenStatusText: document.getElementById('tokenStatusText'),
  notionSecret: document.getElementById('notionSecret'),
  notionDbSelect: document.getElementById('notionDbSelect'),
  loadDbListBtn: document.getElementById('loadDbListBtn'),
  testThreadsBtn: document.getElementById('testThreadsBtn'),
  testNotionBtn: document.getElementById('testNotionBtn'),
  editThreadsBtn: document.getElementById('editThreadsBtn'),
  editNotionBtn: document.getElementById('editNotionBtn'),
  saveAppSecretBtn: document.getElementById('saveAppSecretBtn'),
  editAppSecretBtn: document.getElementById('editAppSecretBtn'),
  toggleThreadsToken: document.getElementById('toggleThreadsToken'),
  toggleAppSecret: document.getElementById('toggleAppSecret'),
  toggleNotionSecret: document.getElementById('toggleNotionSecret'),
  threadsStatus: document.getElementById('threadsStatus'),
  notionStatus: document.getElementById('notionStatus'),
  loadFieldsBtn: document.getElementById('loadFieldsBtn'),
  mappingTitle: document.getElementById('mappingTitle'),
  mappingContent: document.getElementById('mappingContent'),
  mappingCreatedAt: document.getElementById('mappingCreatedAt'),
  mappingSourceUrl: document.getElementById('mappingSourceUrl'),
  // 통계 필드 매핑
  mappingViews: document.getElementById('mappingViews'),
  mappingLikes: document.getElementById('mappingLikes'),
  mappingReplies: document.getElementById('mappingReplies'),
  mappingReposts: document.getElementById('mappingReposts'),
  mappingQuotes: document.getElementById('mappingQuotes'),
  // 작성자 필드 매핑
  mappingUsername: document.getElementById('mappingUsername'),
  // 과거 게시글 동기화
  syncAllToggle: document.getElementById('syncAllToggle'),
  syncDateGroup: document.getElementById('syncDateGroup'),
  syncFromDate: document.getElementById('syncFromDate'),
  syncAllBtn: document.getElementById('syncAllBtn'),
  syncAllStatus: document.getElementById('syncAllStatus'),
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
  await updateTokenStatus();
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
      'threadsAppSecret',
      'notionSecret',
      'notionDatabaseId',
      'fieldMapping',
      'syncOptions'
    ]);

    currentSettings = data;

    // 폼에 값 설정
    if (data.threadsAccessToken) {
      elements.threadsToken.value = data.threadsAccessToken;

      // 토큰 유효성 검증
      try {
        const tokenStatus = await chrome.runtime.sendMessage({ type: 'GET_TOKEN_STATUS' });
        if (tokenStatus.isExpired) {
          // 만료된 경우: 수정 모드로 전환 + 경고 표시
          setEditMode('threads');
          showStatus('threadsStatus', '⚠️ 토큰이 만료되었습니다. 새 토큰을 입력해주세요.', 'error');
        } else {
          // 유효한 경우: 설정 완료 상태
          setConfiguredState('threads');
        }
      } catch (error) {
        // 검증 실패 시 일단 설정 완료로 표시
        setConfiguredState('threads');
      }
    }

    if (data.notionSecret) {
      elements.notionSecret.value = data.notionSecret;
      // 저장된 시크릿이 있으면 설정 완료 상태로 표시
      setConfiguredState('notion');
    }

    if (data.threadsAppSecret) {
      elements.threadsAppSecret.value = data.threadsAppSecret;
      // 저장된 App Secret이 있으면 설정 완료 상태로 표시
      setConfiguredState('appSecret');
    }

    // 저장된 DB ID가 있으면 선택 옵션에 추가
    if (data.notionDatabaseId) {
      currentSettings.notionDatabaseId = data.notionDatabaseId;
    }

    // Notion 연결이 되어있으면 DB 목록 로드
    if (data.notionSecret) {
      elements.loadDbListBtn.disabled = false;

      // 저장된 DB가 있으면 목록 로드 및 선택
      if (data.notionDatabaseId) {
        await loadDatabaseList();
        elements.notionDbSelect.value = data.notionDatabaseId;

        // 필드 매핑 로드
        await loadNotionFields();
        if (data.fieldMapping) {
          setFieldMappings(data.fieldMapping);
        }
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
  elements.loadDbListBtn.addEventListener('click', loadDatabaseList);
  elements.loadFieldsBtn.addEventListener('click', loadNotionFields);
  elements.saveBtn.addEventListener('click', saveSettings);
  elements.resetBtn.addEventListener('click', resetSettings);

  // 과거 게시글 동기화
  elements.syncAllBtn.addEventListener('click', syncFromDate);
  elements.syncAllToggle.addEventListener('change', () => {
    elements.syncDateGroup.style.display = elements.syncAllToggle.checked ? 'none' : 'block';
  });

  // 수정 버튼
  elements.editThreadsBtn.addEventListener('click', () => setEditMode('threads'));
  elements.editNotionBtn.addEventListener('click', () => setEditMode('notion'));
  elements.editAppSecretBtn.addEventListener('click', () => setEditMode('appSecret'));

  // App Secret 저장 버튼
  elements.saveAppSecretBtn.addEventListener('click', saveAppSecret);

  // 비밀번호 표시/숨김 토글
  elements.toggleThreadsToken.addEventListener('click', () => togglePasswordVisibility('threadsToken'));
  elements.toggleAppSecret.addEventListener('click', () => togglePasswordVisibility('threadsAppSecret'));
  elements.toggleNotionSecret.addEventListener('click', () => togglePasswordVisibility('notionSecret'));

  // 데이터베이스 선택 시 필드 자동 로드
  elements.notionDbSelect.addEventListener('change', async () => {
    if (elements.notionDbSelect.value) {
      await loadNotionFields();
    }
  });
}

/**
 * 비밀번호 표시/숨김 토글
 */
function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
  } else {
    input.type = 'password';
  }
}

/**
 * App Secret 저장
 */
async function saveAppSecret() {
  const appSecret = elements.threadsAppSecret.value.trim();

  if (!appSecret) {
    alert('App Secret을 입력해주세요.');
    return;
  }

  try {
    elements.saveAppSecretBtn.disabled = true;
    elements.saveAppSecretBtn.textContent = '저장 중...';

    await chrome.runtime.sendMessage({
      type: 'SAVE_APP_SECRET',
      appSecret
    });

    setConfiguredState('appSecret');
  } catch (error) {
    console.error('App Secret 저장 실패:', error);
    alert('App Secret 저장에 실패했습니다: ' + error.message);
    elements.saveAppSecretBtn.disabled = false;
    elements.saveAppSecretBtn.textContent = '저장';
  }
}

/**
 * 설정 완료 상태로 전환
 */
function setConfiguredState(type) {
  if (type === 'threads') {
    elements.threadsToken.disabled = true;
    elements.testThreadsBtn.textContent = '✓ 설정 완료';
    elements.testThreadsBtn.classList.remove('btn-secondary');
    elements.testThreadsBtn.classList.add('btn-configured');
    elements.testThreadsBtn.disabled = true;
    elements.editThreadsBtn.style.display = 'inline-flex';
  } else if (type === 'notion') {
    elements.notionSecret.disabled = true;
    elements.testNotionBtn.textContent = '✓ 설정 완료';
    elements.testNotionBtn.classList.remove('btn-secondary');
    elements.testNotionBtn.classList.add('btn-configured');
    elements.testNotionBtn.disabled = true;
    elements.editNotionBtn.style.display = 'inline-flex';
  } else if (type === 'appSecret') {
    elements.threadsAppSecret.disabled = true;
    elements.saveAppSecretBtn.textContent = '✓ 설정 완료';
    elements.saveAppSecretBtn.classList.remove('btn-secondary');
    elements.saveAppSecretBtn.classList.add('btn-configured');
    elements.saveAppSecretBtn.disabled = true;
    elements.editAppSecretBtn.style.display = 'inline-flex';
  }
}

/**
 * 수정 모드로 전환
 */
function setEditMode(type) {
  if (type === 'threads') {
    elements.threadsToken.disabled = false;
    elements.testThreadsBtn.textContent = '연결 테스트';
    elements.testThreadsBtn.classList.remove('btn-configured');
    elements.testThreadsBtn.classList.add('btn-secondary');
    elements.testThreadsBtn.disabled = false;
    elements.editThreadsBtn.style.display = 'none';
    elements.threadsToken.focus();
  } else if (type === 'notion') {
    elements.notionSecret.disabled = false;
    elements.testNotionBtn.textContent = '연결 테스트';
    elements.testNotionBtn.classList.remove('btn-configured');
    elements.testNotionBtn.classList.add('btn-secondary');
    elements.testNotionBtn.disabled = false;
    elements.editNotionBtn.style.display = 'none';
    elements.notionSecret.focus();
  } else if (type === 'appSecret') {
    elements.threadsAppSecret.disabled = false;
    elements.saveAppSecretBtn.textContent = '저장';
    elements.saveAppSecretBtn.classList.remove('btn-configured');
    elements.saveAppSecretBtn.classList.add('btn-secondary');
    elements.saveAppSecretBtn.disabled = false;
    elements.editAppSecretBtn.style.display = 'none';
    elements.threadsAppSecret.focus();
  }
}

/**
 * Threads 연결 테스트 + 자동 장기 토큰 설정
 */
async function testThreadsConnection() {
  const token = elements.threadsToken.value.trim();
  const appSecret = elements.threadsAppSecret.value.trim();

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
      const username = result.threads.user?.username || 'Unknown';
      elements.threadsToken.classList.remove('error');
      elements.threadsToken.classList.add('success');

      // App Secret이 있으면 자동으로 장기 토큰 설정
      if (appSecret) {
        showStatus('threadsStatus', `연결 성공! @${username} - 장기 토큰 설정 중...`, 'info');

        const setupResult = await chrome.runtime.sendMessage({
          type: 'SETUP_LONG_LIVED_TOKEN',
          token,
          appSecret
        });

        if (setupResult.success) {
          // 단기 토큰이 변환된 경우 새 토큰으로 UI 업데이트
          if (setupResult.type === 'exchanged' && setupResult.newToken) {
            elements.threadsToken.value = setupResult.newToken;
          }

          const message = setupResult.type === 'exchanged'
            ? `연결 성공! @${username} - 장기 토큰 변환 완료 (${setupResult.remainingDays}일)`
            : `연결 성공! @${username} - 장기 토큰 확인됨 (${setupResult.remainingDays}일)`;

          showStatus('threadsStatus', message, 'success');
        } else {
          showStatus('threadsStatus',
            `연결 성공! @${username} (토큰 설정 실패: ${setupResult.error})`,
            'success'
          );
        }
      } else {
        showStatus('threadsStatus',
          `연결 성공! @${username} (App Secret 입력 시 자동 갱신 활성화)`,
          'success'
        );
      }

      // 토큰 상태 업데이트
      await updateTokenStatus();

      // 설정 완료 상태로 전환
      setConfiguredState('threads');
    } else {
      showStatus('threadsStatus',
        `연결 실패: ${result.threads?.error || 'Unknown error'}`,
        'error'
      );
      elements.threadsToken.classList.add('error');
      elements.testThreadsBtn.disabled = false;
    }
  } catch (error) {
    showStatus('threadsStatus', `오류: ${error.message}`, 'error');
    elements.testThreadsBtn.disabled = false;
  }
}

/**
 * 토큰 상태 UI 업데이트
 */
async function updateTokenStatus() {
  try {
    const status = await chrome.runtime.sendMessage({ type: 'GET_TOKEN_STATUS' });

    if (!status.hasToken) {
      elements.tokenStatusText.textContent = '토큰이 설정되지 않았습니다';
      elements.tokenStatusBox.style.background = '#F9FAFB';
      return;
    }

    if (status.expiresAt === null) {
      elements.tokenStatusText.innerHTML = `
        <strong style="color: #F59E0B;">⚠️ 단기 토큰</strong><br>
        <span style="font-size: 12px; color: #6B7280;">장기 토큰(60일)으로 변환하면 자동 갱신이 가능합니다</span>
      `;
      elements.tokenStatusBox.style.background = '#FEF3C7';
    } else if (status.isExpired) {
      elements.tokenStatusText.innerHTML = `
        <strong style="color: #EF4444;">❌ 토큰 만료됨</strong><br>
        <span style="font-size: 12px; color: #6B7280;">새 토큰을 발급받아 입력해주세요</span>
      `;
      elements.tokenStatusBox.style.background = '#FEE2E2';
    } else if (status.isExpiringSoon) {
      elements.tokenStatusText.innerHTML = `
        <strong style="color: #F59E0B;">⚠️ 토큰 만료 임박</strong><br>
        <span style="font-size: 12px; color: #6B7280;">남은 기간: ${status.remainingDays}일 (${formatDate(status.expiresAt)}까지)</span>
      `;
      elements.tokenStatusBox.style.background = '#FEF3C7';
    } else {
      elements.tokenStatusText.innerHTML = `
        <strong style="color: #10B981;">✅ 장기 토큰 (정상)</strong><br>
        <span style="font-size: 12px; color: #6B7280;">남은 기간: ${status.remainingDays}일 (${formatDate(status.expiresAt)}까지)</span>
      `;
      elements.tokenStatusBox.style.background = '#D1FAE5';
    }
  } catch (error) {
    console.error('Failed to get token status:', error);
    elements.tokenStatusText.textContent = '토큰 상태를 확인할 수 없습니다';
  }
}

/**
 * 날짜 포맷팅
 */
function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * 특정 날짜부터 과거 게시글 동기화
 */
async function syncFromDate() {
  const fromDate = elements.syncFromDate.value; // YYYY-MM-DD 형식 또는 빈 문자열

  elements.syncAllBtn.disabled = true;
  const dateText = fromDate ? `${fromDate}부터` : '전체';
  showStatus('syncAllStatus', `${dateText} 게시글 동기화 중...`, 'info');

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'SYNC_FROM_DATE',
      fromDate: fromDate || null
    });

    if (result.success) {
      const message = result.syncedCount > 0
        ? `동기화 완료! ${result.syncedCount}개 게시글 동기화됨${result.skippedCount > 0 ? ` (${result.skippedCount}개 스킵)` : ''}`
        : `동기화할 새 게시글이 없습니다${result.skippedCount > 0 ? ` (${result.skippedCount}개 이미 동기화됨)` : ''}`;
      showStatus('syncAllStatus', message, 'success');
    } else {
      showStatus('syncAllStatus', `동기화 실패: ${result.error || result.message}`, 'error');
    }
  } catch (error) {
    showStatus('syncAllStatus', `오류: ${error.message}`, 'error');
  } finally {
    elements.syncAllBtn.disabled = false;
  }
}

/**
 * 데이터베이스 목록 로드
 */
async function loadDatabaseList() {
  const secret = elements.notionSecret.value.trim();

  if (!secret) {
    showStatus('notionStatus', '시크릿 키를 먼저 입력해주세요', 'error');
    return;
  }

  elements.loadDbListBtn.disabled = true;
  showStatus('notionStatus', '데이터베이스 목록을 불러오는 중...', 'info');

  try {
    const databases = await chrome.runtime.sendMessage({ type: 'LIST_DATABASES' });

    if (databases.error) {
      throw new Error(databases.error);
    }

    // 드롭다운 옵션 초기화
    elements.notionDbSelect.innerHTML = '<option value="">데이터베이스를 선택하세요</option>';

    if (databases.length === 0) {
      showStatus('notionStatus',
        'Integration에 공유된 데이터베이스가 없습니다. Notion에서 데이터베이스에 Integration을 연결해주세요.',
        'error'
      );
      return;
    }

    // 옵션 추가
    databases.forEach(db => {
      const option = document.createElement('option');
      option.value = db.id;
      // ~ 구분자가 있으면 마지막 부분(페이지 이름)만 표시
      const displayTitle = db.title.includes(' ~ ') ? db.title.split(' ~ ').pop().trim() : db.title;
      option.textContent = db.icon ? `${db.icon} ${displayTitle}` : displayTitle;
      elements.notionDbSelect.appendChild(option);
    });

    // 저장된 DB가 있으면 선택
    if (currentSettings.notionDatabaseId) {
      elements.notionDbSelect.value = currentSettings.notionDatabaseId;
    }

    showStatus('notionStatus', `${databases.length}개의 데이터베이스를 찾았습니다`, 'success');
  } catch (error) {
    showStatus('notionStatus', `목록 로드 실패: ${error.message}`, 'error');
  } finally {
    elements.loadDbListBtn.disabled = false;
  }
}

/**
 * Notion 연결 테스트
 */
async function testNotionConnection() {
  const secret = elements.notionSecret.value.trim();

  if (!secret) {
    showStatus('notionStatus', '시크릿 키를 입력해주세요', 'error');
    return;
  }

  elements.testNotionBtn.disabled = true;
  showStatus('notionStatus', '연결 테스트 중...', 'info');

  try {
    // 임시로 저장 후 테스트
    await chrome.storage.local.set({ notionSecret: secret });

    const result = await chrome.runtime.sendMessage({ type: 'TEST_CONNECTIONS' });

    if (result.notion?.success) {
      showStatus('notionStatus',
        `연결 성공! 사용자: ${result.notion.user?.name || 'Bot'}`,
        'success'
      );
      elements.notionSecret.classList.remove('error');
      elements.notionSecret.classList.add('success');

      // DB 목록 버튼 활성화
      elements.loadDbListBtn.disabled = false;

      // DB 목록 자동 로드
      await loadDatabaseList();

      // 설정 완료 상태로 전환
      setConfiguredState('notion');
    } else {
      showStatus('notionStatus',
        `연결 실패: ${result.notion?.error || 'Unknown error'}`,
        'error'
      );
      elements.notionSecret.classList.add('error');
      elements.loadDbListBtn.disabled = true;
      elements.testNotionBtn.disabled = false;
    }
  } catch (error) {
    showStatus('notionStatus', `오류: ${error.message}`, 'error');
    elements.testNotionBtn.disabled = false;
  }
}

/**
 * Notion 데이터베이스 필드 로드
 */
async function loadNotionFields() {
  const secret = elements.notionSecret.value.trim();
  const dbId = elements.notionDbSelect.value;

  if (!secret || !dbId) {
    showStatus('notionStatus', 'Notion 시크릿을 입력하고 데이터베이스를 선택해주세요', 'error');
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
    elements.mappingCreatedAt,
    elements.mappingSourceUrl,
    // 통계 필드
    elements.mappingViews,
    elements.mappingLikes,
    elements.mappingReplies,
    elements.mappingReposts,
    elements.mappingQuotes,
    // 작성자 필드
    elements.mappingUsername
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

  // 자동 매칭 실행
  autoMatchFields(fields);
}

/**
 * 필드명 기반 자동 매칭
 */
function autoMatchFields(fields) {
  const matchRules = {
    mappingTitle: ['제목', 'title', '첫 줄'],
    mappingContent: ['본문', 'content', '내용'],
    mappingCreatedAt: ['작성일', 'created', 'date', '날짜', '작성 시간', '작성시간'],
    mappingSourceUrl: ['url', 'link', '링크', '원본'],
    mappingViews: ['조회수', 'views'],
    mappingLikes: ['좋아요', 'likes'],
    mappingReplies: ['답글', 'replies', '댓글'],
    mappingReposts: ['리포스트', 'reposts'],
    mappingQuotes: ['인용', 'quotes'],
    mappingUsername: ['작성자', 'username', 'author']
  };

  for (const [selectId, keywords] of Object.entries(matchRules)) {
    const select = elements[selectId];
    if (!select || select.value) continue; // 이미 값이 있으면 스킵

    for (const keyword of keywords) {
      const match = fields.find(f => f.name.toLowerCase().includes(keyword.toLowerCase()));
      if (match) {
        select.value = match.name;
        break;
      }
    }
  }
}

/**
 * 필드 매핑 값 설정
 */
function setFieldMappings(mapping) {
  if (mapping.title) elements.mappingTitle.value = mapping.title;
  if (mapping.content) elements.mappingContent.value = mapping.content;
  if (mapping.createdAt) elements.mappingCreatedAt.value = mapping.createdAt;
  if (mapping.sourceUrl) elements.mappingSourceUrl.value = mapping.sourceUrl;
  // 통계 필드
  if (mapping.views) elements.mappingViews.value = mapping.views;
  if (mapping.likes) elements.mappingLikes.value = mapping.likes;
  if (mapping.replies) elements.mappingReplies.value = mapping.replies;
  if (mapping.reposts) elements.mappingReposts.value = mapping.reposts;
  if (mapping.quotes) elements.mappingQuotes.value = mapping.quotes;
  // 작성자 필드
  if (mapping.username) elements.mappingUsername.value = mapping.username;
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
      threadsAppSecret: elements.threadsAppSecret.value.trim(),
      notionSecret: elements.notionSecret.value.trim(),
      notionDatabaseId: elements.notionDbSelect.value,
      fieldMapping: {
        title: elements.mappingTitle.value,
        content: elements.mappingContent.value,
        createdAt: elements.mappingCreatedAt.value,
        sourceUrl: elements.mappingSourceUrl.value,
        // 통계 필드
        views: elements.mappingViews.value,
        likes: elements.mappingLikes.value,
        replies: elements.mappingReplies.value,
        reposts: elements.mappingReposts.value,
        quotes: elements.mappingQuotes.value,
        // 작성자 필드
        username: elements.mappingUsername.value
      },
      syncOptions: {
        autoSync: true,
        syncInterval: 1,
        dailyStatsRefresh: true
      }
    };

    // 저장
    await chrome.storage.local.set(settings);

    // 동기화 옵션 업데이트 (백그라운드에 알림)
    await chrome.runtime.sendMessage({
      type: 'UPDATE_SYNC_OPTIONS',
      options: settings.syncOptions
    });

    const now = new Date();
    const timeStr = now.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    showStatus('saveStatus', `설정이 저장되었습니다! (${timeStr})`, 'success');

    // 전체 게시글 동기화 토글이 ON이면 전체 동기화 실행
    if (elements.syncAllToggle && elements.syncAllToggle.checked) {
      showStatus('syncAllStatus', '전체 게시글 동기화 중...', 'info');
      try {
        const result = await chrome.runtime.sendMessage({
          type: 'SYNC_FROM_DATE',
          fromDate: null  // null = 전체
        });
        if (result.success) {
          const msg = result.syncedCount > 0
            ? `✅ ${result.syncedCount}개 동기화 완료`
            : `동기화할 새 게시글이 없습니다${result.skippedCount > 0 ? ` (${result.skippedCount}개 이미 동기화됨)` : ''}`;
          showStatus('syncAllStatus', msg, 'success');
        } else {
          showStatus('syncAllStatus', `❌ ${result.error}`, 'error');
        }
      } catch (syncError) {
        showStatus('syncAllStatus', `❌ 동기화 실패: ${syncError.message}`, 'error');
      }
    }
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
    elements.threadsAppSecret.value = '';
    elements.notionSecret.value = '';
    elements.notionDbSelect.innerHTML = '<option value="">연결 테스트 후 목록을 불러오세요</option>';
    elements.loadDbListBtn.disabled = true;

    // 토큰 관련 초기화
    elements.tokenStatusText.textContent = '토큰이 설정되지 않았습니다';
    elements.tokenStatusBox.style.background = '#F9FAFB';

    // 필드 매핑 초기화
    [elements.mappingTitle, elements.mappingContent, elements.mappingCreatedAt,
      elements.mappingSourceUrl, elements.mappingViews, elements.mappingLikes,
      elements.mappingReplies, elements.mappingReposts, elements.mappingQuotes,
      elements.mappingUsername
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
