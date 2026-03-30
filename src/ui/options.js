/**
 * Options 페이지 로직
 */

// 디버그 모드 (프로덕션에서는 false)
const DEBUG = false;
const log = DEBUG ? console.log.bind(console) : () => {};

/**
 * 연결됨 상태 UI 생성 (XSS-safe)
 * @param {string} service - 'threads' 또는 'notion'
 * @param {string} subText - 표시할 부가 텍스트 (User ID 또는 Workspace 이름)
 * @returns {HTMLElement}
 */
function createConnectedUI(service, subText) {
  const container = document.createElement('div');
  container.style.cssText = 'background: #D1FAE5; padding: 16px; border-radius: 10px; text-align: center;';

  const icon = document.createElement('span');
  icon.style.fontSize = '24px';
  icon.textContent = '✅';

  const title = document.createElement('p');
  title.style.cssText = 'margin-top: 8px; color: #065F46; font-weight: 600;';
  title.textContent = service === 'threads' ? 'Threads 연결됨' : 'Notion 연결됨';

  const sub = document.createElement('p');
  sub.style.cssText = 'font-size: 12px; color: #047857; margin-top: 4px;';
  sub.textContent = service === 'threads' ? `User ID: ${subText || 'N/A'}` : (subText || 'Workspace');

  // 연결 해제 버튼 추가
  const disconnectBtn = document.createElement('button');
  disconnectBtn.style.cssText = 'margin-top: 12px; padding: 8px 16px; background: #FEE2E2; color: #991B1B; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;';
  disconnectBtn.textContent = '연결 해제';
  disconnectBtn.addEventListener('click', () => disconnectService(service));

  container.appendChild(icon);
  container.appendChild(title);
  container.appendChild(sub);
  container.appendChild(disconnectBtn);

  return container;
}

/**
 * 서비스 연결 해제
 */
async function disconnectService(service) {
  if (!confirm(`${service === 'threads' ? 'Threads' : 'Notion'} 연결을 해제하시겠습니까?`)) {
    return;
  }

  if (service === 'threads') {
    await chrome.storage.local.remove(['threadsAccessToken', 'threadsUserId', 'threadsTokenExpiresAt']);
    const oauthSection = document.getElementById('oauthSection');
    if (oauthSection) {
      oauthSection.replaceChildren(createLoginButtonUI('threads', startThreadsOAuthFlow));
    }
    showStatus('threadsStatus', 'Threads 연결이 해제되었습니다', 'info');
  } else {
    await chrome.storage.local.remove(['notionSecret', 'notionWorkspaceId', 'notionWorkspaceName']);
    const notionOauthSection = document.getElementById('notionOauthSection');
    if (notionOauthSection) {
      notionOauthSection.replaceChildren(createLoginButtonUI('notion', startNotionOAuthFlow));
    }
    elements.loadDbListBtn.disabled = true;
    showStatus('notionStatus', 'Notion 연결이 해제되었습니다', 'info');
  }
}

/**
 * 로그인 버튼 UI 생성 (XSS-safe)
 * @param {string} service - 'threads' 또는 'notion'
 * @param {Function} clickHandler - 클릭 핸들러
 * @returns {HTMLElement}
 */
function createLoginButtonUI(service, clickHandler) {
  const container = document.createDocumentFragment();

  const button = document.createElement('button');
  button.className = 'btn btn-primary';
  button.id = service === 'threads' ? 'threadsLoginBtn' : 'notionLoginBtn';
  button.style.cssText = 'width: 100%; padding: 14px; font-size: 16px;';

  if (service === 'threads') {
    button.style.background = 'linear-gradient(135deg, #405DE6, #833AB4, #C13584, #E1306C, #FD1D1D)';
    button.textContent = '🧵 Threads로 로그인';
  } else {
    button.style.background = '#000';
    button.textContent = '📝 Notion으로 연결';
  }

  button.addEventListener('click', clickHandler);

  const hint = document.createElement('p');
  hint.className = 'form-hint';
  hint.style.cssText = 'text-align: center; margin-top: 8px;';
  hint.textContent = service === 'threads'
    ? '버튼을 클릭하면 Meta 로그인 페이지로 이동합니다'
    : '버튼을 클릭하면 Notion 로그인 페이지로 이동합니다';

  container.appendChild(button);
  container.appendChild(hint);

  return container;
}

// Threads OAuth 설정
const THREADS_OAUTH_CONFIG = {
  clientId: '1571587097603276',
  redirectUri: `https://${chrome.runtime.id}.chromiumapp.org/callback`,
  scope: 'threads_basic,threads_content_publish,threads_manage_insights,threads_manage_replies,threads_read_replies',
  tokenServerUrl: 'https://threads-murex-eight.vercel.app/api/token'
};

// Notion OAuth 설정
const NOTION_OAUTH_CONFIG = {
  clientId: '2c6d872b-594c-8027-9cc4-003725828159',
  redirectUri: `https://${chrome.runtime.id}.chromiumapp.org/notion-callback`,
  tokenServerUrl: 'https://threads-murex-eight.vercel.app/api/notion-token'
};

// DOM 요소
const elements = {
  threadsLoginBtn: document.getElementById('threadsLoginBtn'),
  notionLoginBtn: document.getElementById('notionLoginBtn'),
  notionDbSelect: document.getElementById('notionDbSelect'),
  loadDbListBtn: document.getElementById('loadDbListBtn'),
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
  mappingShares: document.getElementById('mappingShares'),
  // 작성자 필드 매핑
  mappingUsername: document.getElementById('mappingUsername'),
  // Thread ID 필드 매핑 (API 호출용)
  mappingThreadId: document.getElementById('mappingThreadId'),
  // Thread ID 마이그레이션
  migrateThreadIdsBtn: document.getElementById('migrateThreadIdsBtn'),
  migrateStatus: document.getElementById('migrateStatus'),
  // 과거 게시글 동기화
  syncAllToggle: document.getElementById('syncAllToggle'),
  syncDateGroup: document.getElementById('syncDateGroup'),
  syncFromDate: document.getElementById('syncFromDate'),
  syncAllBtn: document.getElementById('syncAllBtn'),
  syncAllStatus: document.getElementById('syncAllStatus'),
  saveBtn: document.getElementById('saveBtn'),
  resetBtn: document.getElementById('resetBtn'),
  saveStatus: document.getElementById('saveStatus'),
  loadingOverlay: document.getElementById('loadingOverlay'),
  // 계정 관리
  accountsList: document.getElementById('accountsList'),
  addAccountBtn: document.getElementById('addAccountBtn'),
  accountsStatus: document.getElementById('accountsStatus'),
  accountModal: document.getElementById('accountModal'),
  modalTitle: document.getElementById('modalTitle'),
  accountName: document.getElementById('accountName'),
  accountUsername: document.getElementById('accountUsername'),
  accountNotionDbId: document.getElementById('accountNotionDbId'),
  accountFollowersHistoryDbId: document.getElementById('accountFollowersHistoryDbId'),
  accountEditId: document.getElementById('accountEditId'),
  accountThreadsToken: document.getElementById('accountThreadsToken'),
  toggleAccountTokenVisibility: document.getElementById('toggleAccountTokenVisibility'),
  modalCancelBtn: document.getElementById('modalCancelBtn'),
  modalSaveBtn: document.getElementById('modalSaveBtn'),
  // Notion Secret 수동 입력
  notionSecretInput: document.getElementById('notionSecretInput'),
  saveNotionSecretBtn: document.getElementById('saveNotionSecretBtn'),
  toggleSecretVisibility: document.getElementById('toggleSecretVisibility'),
};

// 현재 설정
let currentSettings = {};

/**
 * 초기화
 */
async function init() {
  await loadAccounts();
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
      'threadsUserId',
      'notionSecret',
      'notionDatabaseId',
      'notionInsightsDatabaseId',
      'notionWorkspaceName',
      'fieldMapping',
      'syncOptions'
    ]);

    currentSettings = data;

    // 폼에 값 설정
    if (data.threadsAccessToken) {
      // OAuth 섹션을 연결됨 상태로 표시
      const oauthSection = document.getElementById('oauthSection');
      if (oauthSection) {
        oauthSection.replaceChildren(createConnectedUI('threads', data.threadsUserId));
      }

      // 토큰 유효성 검증
      try {
        const tokenStatus = await chrome.runtime.sendMessage({ type: 'GET_TOKEN_STATUS' });
        if (tokenStatus.isExpired) {
          // 만료된 경우: 경고 표시 및 OAuth 섹션 복구
          showStatus('threadsStatus', '⚠️ 토큰이 만료되었습니다. 다시 로그인해주세요.', 'error');
          if (oauthSection) {
            oauthSection.replaceChildren(createLoginButtonUI('threads', startThreadsOAuthFlow));
          }
        }
      } catch (error) {
        // 검증 실패 시 무시
        log('Token status check failed:', error);
      }
    }

    // Notion OAuth 연결 상태 확인
    if (data.notionSecret) {
      // OAuth 섹션을 연결됨 상태로 표시
      const notionOauthSection = document.getElementById('notionOauthSection');
      if (notionOauthSection) {
        notionOauthSection.replaceChildren(createConnectedUI('notion', data.notionWorkspaceName));
      }

      elements.loadDbListBtn.disabled = false;

      // 저장된 DB가 있으면 목록 로드 및 선택
      if (data.notionDatabaseId) {
        currentSettings.notionDatabaseId = data.notionDatabaseId;
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
  // Threads OAuth 로그인 버튼
  if (elements.threadsLoginBtn) {
    elements.threadsLoginBtn.addEventListener('click', startThreadsOAuthFlow);
  }

  // Notion OAuth 로그인 버튼
  if (elements.notionLoginBtn) {
    elements.notionLoginBtn.addEventListener('click', startNotionOAuthFlow);
  }

  elements.loadDbListBtn.addEventListener('click', loadDatabaseList);
  elements.loadFieldsBtn.addEventListener('click', loadNotionFields);
  elements.saveBtn.addEventListener('click', saveSettings);
  elements.resetBtn.addEventListener('click', resetSettings);

  // 과거 게시글 동기화
  elements.syncAllBtn.addEventListener('click', syncFromDate);
  elements.syncAllToggle.addEventListener('change', () => {
    elements.syncDateGroup.style.display = elements.syncAllToggle.checked ? 'none' : 'block';
  });

  // 데이터베이스 선택 시 필드 자동 로드
  elements.notionDbSelect.addEventListener('change', async () => {
    if (elements.notionDbSelect.value) {
      await loadNotionFields();
    }
  });

  // 계정 관리
  if (elements.addAccountBtn) {
    elements.addAccountBtn.addEventListener('click', () => showAccountModal());
  }
  if (elements.modalCancelBtn) {
    elements.modalCancelBtn.addEventListener('click', hideAccountModal);
  }
  if (elements.modalSaveBtn) {
    elements.modalSaveBtn.addEventListener('click', saveAccountFromModal);
  }
  // 모달 외부 클릭 시 닫기
  if (elements.accountModal) {
    elements.accountModal.addEventListener('click', (e) => {
      if (e.target === elements.accountModal) {
        hideAccountModal();
      }
    });
  }

  // Notion Secret 수동 입력
  if (elements.saveNotionSecretBtn) {
    elements.saveNotionSecretBtn.addEventListener('click', saveNotionSecretManually);
  }
  if (elements.toggleSecretVisibility) {
    elements.toggleSecretVisibility.addEventListener('click', toggleSecretInputVisibility);
  }

  // 계정 모달 토큰 가시성 토글
  if (elements.toggleAccountTokenVisibility) {
    elements.toggleAccountTokenVisibility.addEventListener('click', toggleAccountTokenVisibility);
  }

  // Thread ID 마이그레이션 버튼
  if (elements.migrateThreadIdsBtn) {
    elements.migrateThreadIdsBtn.addEventListener('click', migrateThreadIds);
  }
}

/**
 * OAuth 플로우 시작
 */
async function startThreadsOAuthFlow() {
  const authUrl = new URL('https://threads.net/oauth/authorize');
  authUrl.searchParams.append('client_id', THREADS_OAUTH_CONFIG.clientId);
  authUrl.searchParams.append('redirect_uri', THREADS_OAUTH_CONFIG.redirectUri);
  authUrl.searchParams.append('scope', THREADS_OAUTH_CONFIG.scope);
  authUrl.searchParams.append('response_type', 'code');

  const loginBtn = document.getElementById('threadsLoginBtn');

  try {
    if (loginBtn) {
      loginBtn.disabled = true;
      loginBtn.textContent = '로그인 중...';
    }

    // chrome.identity API로 OAuth 팝업 열기
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true
    });

    // 사용자가 OAuth 팝업을 닫은 경우 처리
    if (!responseUrl) {
      throw new Error('로그인이 취소되었습니다');
    }

    // 응답 URL에서 코드 추출
    const url = new URL(responseUrl);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      throw new Error(`OAuth error: ${error}`);
    }

    if (!code) {
      throw new Error('인증 코드를 받지 못했습니다');
    }

    // 서버에서 토큰 교환
    showStatus('threadsStatus', '토큰 교환 중...', 'info');

    const tokenUrl = new URL(THREADS_OAUTH_CONFIG.tokenServerUrl);
    tokenUrl.searchParams.append('code', code);
    tokenUrl.searchParams.append('redirect_uri', THREADS_OAUTH_CONFIG.redirectUri);

    const tokenResponse = await fetch(tokenUrl.toString());
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      throw new Error(tokenData.error.message || '토큰 교환 실패');
    }

    // 토큰 저장 (전역)
    await chrome.storage.local.set({
      threadsAccessToken: tokenData.access_token,
      threadsUserId: tokenData.user_id
    });

    // 만료 시간 저장 (있는 경우)
    if (tokenData.expires_in) {
      const expiresAt = Date.now() + (tokenData.expires_in * 1000);
      await chrome.storage.local.set({ threadsTokenExpiresAt: expiresAt });
    }

    // 현재 선택된 계정에도 토큰 동기화
    try {
      const stored = await chrome.storage.local.get(['accounts', 'currentAccount']);
      const accounts = stored.accounts || [];
      const currentId = stored.currentAccount;
      if (currentId && accounts.length > 0) {
        const account = accounts.find(a => a.id === currentId);
        if (account) {
          account.threadsToken = tokenData.access_token;
          account.updatedAt = new Date().toISOString();
          await chrome.storage.local.set({ accounts });
        }
      }
    } catch (err) {
      console.warn('Failed to sync token to account:', err);
    }

    // UI 업데이트
    showStatus('threadsStatus', '✅ Threads 연결 성공!', 'success');

    // OAuth 섹션 숨기고 연결됨 표시
    const oauthSection = document.getElementById('oauthSection');
    if (oauthSection) {
      oauthSection.replaceChildren(createConnectedUI('threads', tokenData.user_id));
    }

  } catch (error) {
    console.error('OAuth error:', error);
    showStatus('threadsStatus', '❌ 로그인에 실패했습니다. 다시 시도해주세요.', 'error');

    // 버튼 복원
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.textContent = '🧵 Threads로 로그인';
    }
  }
}

/**
 * Notion OAuth 플로우 시작
 */
async function startNotionOAuthFlow() {
  const authUrl = new URL('https://api.notion.com/v1/oauth/authorize');
  authUrl.searchParams.append('client_id', NOTION_OAUTH_CONFIG.clientId);
  authUrl.searchParams.append('redirect_uri', NOTION_OAUTH_CONFIG.redirectUri);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('owner', 'user');
  // 템플릿 자동 복제 (사용자 워크스페이스에 자동으로 복제됨)
  authUrl.searchParams.append('template_id', '2bf5d1fb528c803c8245e0545029d21f');

  const loginBtn = document.getElementById('notionLoginBtn');

  try {
    if (loginBtn) {
      loginBtn.disabled = true;
      loginBtn.textContent = '연결 중...';
    }

    // chrome.identity API로 OAuth 팝업 열기
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true
    });

    // 사용자가 OAuth 팝업을 닫은 경우 처리
    if (!responseUrl) {
      throw new Error('연결이 취소되었습니다');
    }

    // 응답 URL에서 코드 추출
    const url = new URL(responseUrl);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      throw new Error(`OAuth error: ${error}`);
    }

    if (!code) {
      throw new Error('인증 코드를 받지 못했습니다');
    }

    // 서버에서 토큰 교환
    showStatus('notionStatus', '토큰 교환 중...', 'info');

    const tokenUrl = new URL(NOTION_OAUTH_CONFIG.tokenServerUrl);
    tokenUrl.searchParams.append('code', code);
    tokenUrl.searchParams.append('redirect_uri', NOTION_OAUTH_CONFIG.redirectUri);

    const tokenResponse = await fetch(tokenUrl.toString());
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      throw new Error(tokenData.error.message || tokenData.error || '토큰 교환 실패');
    }

    // 토큰 저장
    await chrome.storage.local.set({
      notionSecret: tokenData.access_token,
      notionWorkspaceId: tokenData.workspace_id,
      notionWorkspaceName: tokenData.workspace_name
    });

    // UI 업데이트
    showStatus('notionStatus', '✅ Notion 연결 성공!', 'success');

    // OAuth 섹션 업데이트
    const notionOauthSection = document.getElementById('notionOauthSection');
    if (notionOauthSection) {
      notionOauthSection.replaceChildren(createConnectedUI('notion', tokenData.workspace_name));
    }

    // DB 목록 버튼 활성화 및 자동 로드
    elements.loadDbListBtn.disabled = false;
    await loadDatabaseList();

  } catch (error) {
    console.error('Notion OAuth error:', error);
    showStatus('notionStatus', '❌ 연결에 실패했습니다. 다시 시도해주세요.', 'error');

    // 버튼 복원
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.textContent = '📝 Notion으로 연결';
    }
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
    console.error('Sync error:', error);
    showStatus('syncAllStatus', '동기화 중 오류가 발생했습니다.', 'error');
  } finally {
    elements.syncAllBtn.disabled = false;
  }
}

/**
 * 데이터베이스 목록 로드
 */
async function loadDatabaseList() {
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
        'OAuth로 선택한 페이지에 데이터베이스가 없습니다. Notion에서 다시 연결하고 데이터베이스가 있는 페이지를 선택해주세요.',
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
    } else {
      // 템플릿에서 복제된 DB 자동 선택 (이름으로 매칭)
      const templateDbName = '콘텐츠 캘린더 템플릿';
      const matchingDb = databases.find(db => db.title.includes(templateDbName));
      if (matchingDb) {
        elements.notionDbSelect.value = matchingDb.id;
        // 필드도 자동 로드
        await loadNotionFields();
        showStatus('notionStatus', `템플릿 DB가 자동 선택되었습니다: ${templateDbName}`, 'success');
        return;
      }
    }

    showStatus('notionStatus', `${databases.length}개의 데이터베이스를 찾았습니다`, 'success');
  } catch (error) {
    console.error('Database list load error:', error);
    showStatus('notionStatus', '데이터베이스 목록을 불러오지 못했습니다.', 'error');
  } finally {
    elements.loadDbListBtn.disabled = false;
  }
}

/**
 * Notion 데이터베이스 필드 로드
 */
async function loadNotionFields() {
  const dbId = elements.notionDbSelect.value;

  if (!dbId) {
    showStatus('notionStatus', '데이터베이스를 선택해주세요', 'error');
    return;
  }

  elements.loadFieldsBtn.disabled = true;
  showLoading(true);

  try {
    // 저장된 토큰 가져오기
    const { notionSecret } = await chrome.storage.local.get(['notionSecret']);

    if (!notionSecret) {
      showStatus('notionStatus', 'Notion 연결이 필요합니다', 'error');
      return;
    }

    // Notion API로 데이터베이스 정보 조회
    const response = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
      headers: {
        'Authorization': `Bearer ${notionSecret}`,
        'Notion-Version': '2022-06-28'
      }
    });

    if (!response.ok) {
      throw new Error('데이터베이스를 찾을 수 없습니다');
    }

    const database = await response.json();

    if (!database.properties) {
      throw new Error('데이터베이스 속성을 찾을 수 없습니다');
    }

    const properties = database.properties;

    // 필드 옵션 생성
    log('Notion properties:', Object.keys(properties));
    updateFieldOptions(properties);

    showStatus('notionStatus', '필드 목록을 불러왔습니다', 'success');
  } catch (error) {
    console.error('Field load error:', error);
    showStatus('notionStatus', '필드 목록을 불러오지 못했습니다.', 'error');
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
    elements.mappingShares,
    // 작성자 필드
    elements.mappingUsername,
    // Thread ID 필드
    elements.mappingThreadId
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
  // 디버깅: 필드명 확인
  log('Auto-matching fields:', fields.map(f => f.name));

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
    mappingShares: ['공유', 'shares'],
    mappingUsername: ['작성자', 'username', 'author'],
    mappingThreadId: ['thread id', 'threadid', '스레드 id', '스레드id', 'post id', 'postid']
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
  if (mapping.shares) elements.mappingShares.value = mapping.shares;
  // 작성자 필드
  if (mapping.username) elements.mappingUsername.value = mapping.username;
  // Thread ID 필드
  if (mapping.threadId) elements.mappingThreadId.value = mapping.threadId;
}

/**
 * 설정 저장
 */
async function saveSettings() {
  elements.saveBtn.disabled = true;
  showLoading(true);

  try {
    // 현재 저장된 토큰 가져오기 (OAuth로 저장된 토큰 유지)
    const stored = await chrome.storage.local.get(['threadsAccessToken', 'notionSecret']);

    const settings = {
      threadsAccessToken: stored.threadsAccessToken || '',
      notionSecret: stored.notionSecret || '',
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
        shares: elements.mappingShares.value,
        // 작성자 필드
        username: elements.mappingUsername.value,
        // Thread ID 필드
        threadId: elements.mappingThreadId.value
      },
      syncOptions: {
        autoSync: true,
        syncInterval: 5,
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
    showStatus('saveStatus', `노션에 동기화가 완료되었습니다! (${timeStr})`, 'success');

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
    console.error('Save error:', error);
    showStatus('saveStatus', '설정 저장에 실패했습니다.', 'error');
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
    elements.notionDbSelect.innerHTML = '<option value="">Notion 연결 후 목록을 불러오세요</option>';
    elements.loadDbListBtn.disabled = true;

    // Threads OAuth 섹션 복원
    const oauthSection = document.getElementById('oauthSection');
    if (oauthSection) {
      oauthSection.replaceChildren(createLoginButtonUI('threads', startThreadsOAuthFlow));
    }

    // Notion OAuth 섹션 복원
    const notionOauthSection = document.getElementById('notionOauthSection');
    if (notionOauthSection) {
      notionOauthSection.replaceChildren(createLoginButtonUI('notion', startNotionOAuthFlow));
    }

    // 필드 매핑 초기화
    [elements.mappingTitle, elements.mappingContent, elements.mappingCreatedAt,
      elements.mappingSourceUrl, elements.mappingViews, elements.mappingLikes,
      elements.mappingReplies, elements.mappingReposts, elements.mappingQuotes,
      elements.mappingShares, elements.mappingUsername, elements.mappingThreadId
    ].forEach(select => {
      select.selectedIndex = 0;
    });

    // 상태 메시지 숨기기
    hideStatus('threadsStatus');
    hideStatus('notionStatus');

    showStatus('saveStatus', '설정이 초기화되었습니다', 'info');
  } catch (error) {
    console.error('Reset error:', error);
    showStatus('saveStatus', '설정 초기화에 실패했습니다.', 'error');
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

// === Notion Secret 수동 입력 ===

/**
 * Notion Secret 수동 저장
 */
async function saveNotionSecretManually() {
  // 공백, 줄바꿈, 보이지 않는 문자 제거
  const secret = elements.notionSecretInput.value
    .trim()
    .replace(/[\s\u200B-\u200D\uFEFF]/g, ''); // 공백 및 zero-width 문자 제거

  if (!secret) {
    showStatus('notionStatus', 'Secret을 입력해주세요', 'error');
    return;
  }

  // Notion secret은 secret_ 또는 ntn_ 등 다양한 형식 가능
  if (secret.length < 20) {
    showStatus('notionStatus', 'Secret이 너무 짧습니다', 'error');
    return;
  }

  // ASCII 문자만 포함되어 있는지 확인
  if (!/^[\x00-\x7F]*$/.test(secret)) {
    showStatus('notionStatus', 'Secret에 유효하지 않은 문자가 포함되어 있습니다', 'error');
    return;
  }

  elements.saveNotionSecretBtn.disabled = true;
  showStatus('notionStatus', '연결 확인 중...', 'info');

  try {
    // Secret 유효성 검증 (Notion API 호출 테스트)
    const response = await fetch('https://api.notion.com/v1/users/me', {
      headers: {
        'Authorization': `Bearer ${secret}`,
        'Notion-Version': '2022-06-28'
      }
    });

    if (!response.ok) {
      throw new Error('유효하지 않은 Secret입니다');
    }

    const userData = await response.json();

    // Secret 저장
    await chrome.storage.local.set({
      notionSecret: secret,
      notionWorkspaceName: userData.name || 'Workspace'
    });

    // UI 업데이트
    showStatus('notionStatus', `✅ Notion 연결 성공! (${userData.name || 'Workspace'})`, 'success');

    // 연결됨 상태로 UI 변경
    const notionOauthSection = document.getElementById('notionOauthSection');
    if (notionOauthSection) {
      notionOauthSection.replaceChildren(createConnectedUI('notion', userData.name || 'Workspace'));
    }

    elements.loadDbListBtn.disabled = false;

  } catch (error) {
    console.error('Notion secret validation error:', error);
    showStatus('notionStatus', `❌ ${error.message}`, 'error');
  } finally {
    elements.saveNotionSecretBtn.disabled = false;
  }
}

/**
 * Secret 입력 필드 가시성 토글
 */
function toggleSecretInputVisibility() {
  const input = elements.notionSecretInput;
  const btn = elements.toggleSecretVisibility;

  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
  }
}

/**
 * 계정 모달 토큰 입력 필드 가시성 토글
 */
function toggleAccountTokenVisibility() {
  const input = elements.accountThreadsToken;
  const btn = elements.toggleAccountTokenVisibility;

  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
  }
}

// === 계정 관리 기능 ===

/**
 * 계정 목록 로드 및 렌더링
 */
async function loadAccounts() {
  try {
    const result = await chrome.storage.local.get(['accounts', 'currentAccount']);
    const accounts = result.accounts || [];
    const currentAccountId = result.currentAccount || 'primary';

    renderAccountsList(accounts, currentAccountId);
  } catch (error) {
    console.error('Failed to load accounts:', error);
  }
}

/**
 * 계정 목록 렌더링 (XSS-safe)
 */
function renderAccountsList(accounts, currentAccountId) {
  const container = elements.accountsList;
  if (!container) return;

  // 안전하게 기존 내용 제거
  container.replaceChildren();

  if (accounts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-accounts';
    empty.textContent = '등록된 계정이 없습니다. 계정을 추가해주세요.';
    container.appendChild(empty);
    return;
  }

  accounts.forEach(account => {
    const item = document.createElement('div');
    item.className = 'account-item' + (account.id === currentAccountId ? ' active' : '');

    // 아바타
    const avatar = document.createElement('div');
    avatar.className = 'account-avatar';
    avatar.textContent = (account.username || account.name || '?').charAt(0).toUpperCase();

    // 정보
    const info = document.createElement('div');
    info.className = 'account-info';

    const usernameRow = document.createElement('div');
    usernameRow.className = 'account-username';
    usernameRow.textContent = account.username || account.name || '이름 없음';

    if (account.id === currentAccountId) {
      const badge = document.createElement('span');
      badge.className = 'account-badge';
      badge.textContent = '현재';
      usernameRow.appendChild(badge);
    }

    const dbInfo = document.createElement('div');
    dbInfo.className = 'account-db';
    const dbStatus = account.notionDbId ? `DB: ${account.notionDbId.substring(0, 8)}...` : 'Notion DB 미설정';
    const tokenStatus = account.threadsToken ? '✅ Token' : '❌ Token 미설정';
    dbInfo.textContent = `${dbStatus} | ${tokenStatus}`;

    info.appendChild(usernameRow);
    info.appendChild(dbInfo);

    // 액션 버튼
    const actions = document.createElement('div');
    actions.className = 'account-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-edit';
    editBtn.textContent = '수정';
    editBtn.addEventListener('click', () => showAccountModal(account));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.textContent = '삭제';
    deleteBtn.addEventListener('click', () => deleteAccount(account.id));

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(avatar);
    item.appendChild(info);
    item.appendChild(actions);
    container.appendChild(item);
  });
}

/**
 * 계정 모달 표시
 */
function showAccountModal(account = null) {
  if (!elements.accountModal) return;

  // 모달 제목 설정
  elements.modalTitle.textContent = account ? '계정 수정' : '계정 추가';

  // 폼 초기화
  elements.accountName.value = account?.name || '';
  elements.accountUsername.value = account?.username || '';
  elements.accountNotionDbId.value = account?.notionDbId || '';
  elements.accountFollowersHistoryDbId.value = account?.followersHistoryDbId || '';
  elements.accountThreadsToken.value = account?.threadsToken || '';
  elements.accountEditId.value = account?.id || '';

  // 모달 표시
  elements.accountModal.classList.add('show');
}

/**
 * 계정 모달 숨기기
 */
function hideAccountModal() {
  if (!elements.accountModal) return;
  elements.accountModal.classList.remove('show');
}

/**
 * 모달에서 계정 저장
 */
async function saveAccountFromModal() {
  const name = elements.accountName.value.trim();
  const username = elements.accountUsername.value.trim();
  const notionDbId = elements.accountNotionDbId.value.trim().replace(/-/g, ''); // 하이픈 제거
  const followersHistoryDbId = elements.accountFollowersHistoryDbId.value.trim().replace(/-/g, ''); // 하이픈 제거
  const threadsToken = elements.accountThreadsToken.value.trim();
  const editId = elements.accountEditId.value;

  // 유효성 검사
  if (!name) {
    showStatus('accountsStatus', '계정 이름을 입력해주세요', 'error');
    return;
  }

  if (!username) {
    showStatus('accountsStatus', 'Threads username을 입력해주세요', 'error');
    return;
  }

  if (!notionDbId || notionDbId.length !== 32) {
    showStatus('accountsStatus', 'Notion Database ID를 확인해주세요 (32자리)', 'error');
    return;
  }

  try {
    const result = await chrome.storage.local.get(['accounts']);
    const accounts = result.accounts || [];

    // 기존 계정 정보 (수정 시)
    const existingAccount = editId ? accounts.find(a => a.id === editId) : null;

    const account = {
      id: editId || `account_${Date.now()}`,
      name,
      username: username.startsWith('@') ? username : `@${username}`,
      notionDbId,
      followersHistoryDbId: followersHistoryDbId || null,
      threadsToken: threadsToken || existingAccount?.threadsToken || '',
      createdAt: existingAccount?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (editId) {
      // 수정
      const index = accounts.findIndex(a => a.id === editId);
      if (index >= 0) {
        accounts[index] = account;
      }
    } else {
      // 추가
      accounts.push(account);
    }

    await chrome.storage.local.set({ accounts });

    // 첫 번째 계정이면 현재 계정으로 설정
    if (accounts.length === 1) {
      await chrome.storage.local.set({ currentAccount: account.id });
    }

    hideAccountModal();
    await loadAccounts();
    showStatus('accountsStatus', editId ? '계정이 수정되었습니다' : '계정이 추가되었습니다', 'success');
  } catch (error) {
    console.error('Failed to save account:', error);
    showStatus('accountsStatus', '계정 저장에 실패했습니다', 'error');
  }
}

/**
 * 계정 삭제
 */
async function deleteAccount(accountId) {
  if (!confirm('이 계정을 삭제하시겠습니까?')) {
    return;
  }

  try {
    const result = await chrome.storage.local.get(['accounts', 'currentAccount']);
    const accounts = result.accounts || [];
    const filtered = accounts.filter(a => a.id !== accountId);

    await chrome.storage.local.set({ accounts: filtered });

    // 삭제된 계정이 현재 계정이면 첫 번째 계정으로 변경
    if (result.currentAccount === accountId && filtered.length > 0) {
      await chrome.storage.local.set({ currentAccount: filtered[0].id });
    }

    await loadAccounts();
    showStatus('accountsStatus', '계정이 삭제되었습니다', 'success');
  } catch (error) {
    console.error('Failed to delete account:', error);
    showStatus('accountsStatus', '계정 삭제에 실패했습니다', 'error');
  }
}

/**
 * Thread ID 마이그레이션 실행
 */
async function migrateThreadIds() {
  // 현재 계정 가져오기
  const result = await chrome.storage.local.get(['accounts', 'currentAccount']);
  const accounts = result.accounts || [];
  const currentAccountId = result.currentAccount;

  if (accounts.length === 0) {
    showStatus('migrateStatus', '등록된 계정이 없습니다. 먼저 계정을 추가해주세요.', 'error');
    return;
  }

  // 현재 계정 또는 첫 번째 계정 사용
  const accountId = currentAccountId || accounts[0]?.id;

  if (!accountId) {
    showStatus('migrateStatus', '계정을 찾을 수 없습니다.', 'error');
    return;
  }

  // Thread ID 필드 매핑 확인
  if (!elements.mappingThreadId.value) {
    showStatus('migrateStatus', 'Thread ID 필드를 먼저 매핑해주세요.', 'error');
    return;
  }

  elements.migrateThreadIdsBtn.disabled = true;
  showStatus('migrateStatus', '마이그레이션 중... (시간이 걸릴 수 있습니다)', 'info');

  try {
    // 먼저 설정 저장 (Thread ID 필드 매핑 포함)
    await saveSettings();

    const response = await chrome.runtime.sendMessage({
      type: 'MIGRATE_THREAD_IDS',
      accountId: accountId
    });

    if (response.success) {
      showStatus('migrateStatus', `✅ ${response.message}`, 'success');
    } else {
      showStatus('migrateStatus', `❌ ${response.error}`, 'error');
    }
  } catch (error) {
    console.error('Migration error:', error);
    showStatus('migrateStatus', `❌ 마이그레이션 실패: ${error.message}`, 'error');
  } finally {
    elements.migrateThreadIdsBtn.disabled = false;
  }
}

// 초기화
document.addEventListener('DOMContentLoaded', init);
