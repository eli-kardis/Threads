/**
 * Dashboard 페이지 로직 - Threads 통계
 * 멀티 계정 지원 + 하이브리드 로딩
 */

let dailyChart = null;
let currentPeriod = 7;
let currentAccountId = 'primary'; // 현재 선택된 계정
let calendarMonth = new Date(); // 현재 표시 중인 달력 월
let followersHistoryData = []; // 팔로워 히스토리 데이터 캐시
let isLoadingFresh = false; // 새 데이터 로딩 중 여부

/**
 * Chart.js 인스턴스 정리 (메모리 누수 방지)
 */
function cleanupChart() {
  if (dailyChart) {
    dailyChart.destroy();
    dailyChart = null;
  }
}

// 페이지 언로드 시 Chart 정리
window.addEventListener('beforeunload', cleanupChart);

/**
 * 초기화
 */
async function init() {
  setupEventListeners();

  // 계정 목록 로드 및 탭 렌더링
  await loadAccountTabs();

  // 하이브리드 로딩: 캐시 먼저 표시 → 새 데이터 로드
  await loadDashboardDataHybrid();
}

/**
 * 계정 탭 로드 및 렌더링
 */
async function loadAccountTabs() {
  try {
    const accounts = await chrome.runtime.sendMessage({ type: 'GET_ACCOUNTS' });
    let fetchedAccountId = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_ACCOUNT_ID' });

    // 계정 ID가 없거나 유효하지 않으면 첫 번째 계정 선택 (버그 수정)
    if (!fetchedAccountId || !accounts.find(a => a.id === fetchedAccountId)) {
      fetchedAccountId = accounts[0]?.id || null;
      if (fetchedAccountId) {
        await chrome.runtime.sendMessage({ type: 'SET_CURRENT_ACCOUNT', accountId: fetchedAccountId });
      }
    }

    currentAccountId = fetchedAccountId;
    renderAccountTabs(accounts, currentAccountId);
  } catch (error) {
    console.warn('Failed to load accounts, using default:', error);
    // 계정이 없으면 탭 숨김
    renderAccountTabs([], null);
  }
}

/**
 * 계정 탭 렌더링 (안전한 DOM 메서드 사용)
 */
function renderAccountTabs(accounts, activeAccountId) {
  const container = document.getElementById('accountTabs');
  if (!container) return;

  // 계정이 없거나 1개만 있으면 탭 숨김
  if (accounts.length <= 1) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  container.replaceChildren(); // 기존 내용 제거

  accounts.forEach(account => {
    const btn = document.createElement('button');
    btn.className = 'account-tab';
    if (account.id === activeAccountId) {
      btn.classList.add('active');
    }
    btn.dataset.account = account.id;
    // username이 이미 @로 시작하면 그대로 사용
    const displayName = account.username || account.name || 'Account';
    btn.textContent = displayName.startsWith('@') ? displayName : `@${displayName}`;

    // 계정 탭 클릭 이벤트
    btn.addEventListener('click', async () => {
      if (account.id === currentAccountId) return;

      // 탭 활성화 상태 변경
      container.querySelectorAll('.account-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // 계정 전환
      currentAccountId = account.id;
      await chrome.runtime.sendMessage({ type: 'SET_CURRENT_ACCOUNT', accountId: account.id });

      // 데이터 다시 로드 (하이브리드)
      await loadDashboardDataHybrid();
    });

    container.appendChild(btn);
  });
}

/**
 * 캐시 상태 표시
 */
function updateCacheIndicator(status, message) {
  const indicator = document.getElementById('cacheIndicator');
  const statusEl = document.getElementById('cacheStatus');
  if (!indicator || !statusEl) return;

  indicator.className = 'cache-indicator';
  if (status === 'loading') {
    indicator.classList.add('loading');
    statusEl.textContent = message || '새 데이터 로딩 중...';
  } else if (status === 'fresh') {
    indicator.classList.add('fresh');
    statusEl.textContent = message || '최신 데이터';
  } else if (status === 'cached') {
    statusEl.textContent = message || '캐시된 데이터';
  } else {
    statusEl.textContent = '';
  }
}

/**
 * 하이브리드 데이터 로딩 (캐시 → 새 데이터)
 */
async function loadDashboardDataHybrid() {
  // 1. 캐시 먼저 표시
  try {
    const cachedData = await chrome.runtime.sendMessage({
      type: 'GET_CACHED_DASHBOARD_DATA',
      accountId: currentAccountId
    });

    if (cachedData) {
      const cacheTime = cachedData.cachedAt
        ? new Date(cachedData.cachedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        : '';
      updateCacheIndicator('cached', `캐시 (${cacheTime})`);
      applyDashboardData(cachedData);
    }
  } catch (error) {
    console.warn('No cached data available');
  }

  // 2. 새 데이터 로드
  isLoadingFresh = true;
  updateCacheIndicator('loading', '새 데이터 로딩 중...');

  try {
    await loadDashboardData();
    updateCacheIndicator('fresh', '최신 데이터');
  } catch (error) {
    console.error('Failed to load fresh data:', error);
    updateCacheIndicator('cached', '새 데이터 로드 실패');
  } finally {
    isLoadingFresh = false;
  }
}

/**
 * 이벤트 리스너 설정
 */
function setupEventListeners() {
  document.getElementById('refreshBtn').addEventListener('click', refreshAndReload);
  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // 기간 선택 탭
  document.querySelectorAll('.period-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.period-tab').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentPeriod = parseInt(e.target.dataset.period);
      loadDashboardData();
    });
  });

  // 달력 네비게이션
  document.getElementById('prevMonthBtn').addEventListener('click', () => {
    calendarMonth.setMonth(calendarMonth.getMonth() - 1);
    renderFollowersCalendar(followersHistoryData);
  });

  document.getElementById('nextMonthBtn').addEventListener('click', () => {
    calendarMonth.setMonth(calendarMonth.getMonth() + 1);
    renderFollowersCalendar(followersHistoryData);
  });
}

/**
 * Notion에서 최신 데이터 다시 로드 (Threads API 호출 안 함)
 * 인사이트 업데이트는 GitHub Actions가 1시간마다 처리
 */
async function refreshAndReload() {
  console.log('refreshAndReload called for account:', currentAccountId);
  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn.textContent = 'Notion에서 불러오는 중...';
  refreshBtn.disabled = true;

  try {
    // Notion에서 최신 데이터만 다시 로드 (forceRefresh로 캐시 무시)
    await loadDashboardData(true);
    refreshBtn.textContent = '✓ 새로고침 완료';
  } catch (error) {
    console.error('Refresh failed:', error);
    refreshBtn.textContent = '오류 발생';
  } finally {
    // 2초 후 버튼 텍스트 복원
    setTimeout(() => {
      refreshBtn.textContent = '새로고침';
      refreshBtn.disabled = false;
    }, 2000);
  }
}

/**
 * 대시보드 데이터 로드
 * @param {boolean} forceRefresh - true면 Notion API 강제 호출 (캐시 무시)
 */
async function loadDashboardData(forceRefresh = false) {
  try {
    // 먼저 오늘 팔로워 기록 (아직 없으면 기록됨, 계정별)
    await chrome.runtime.sendMessage({ type: 'RECORD_FOLLOWERS_NOW', accountId: currentAccountId });

    // 통합 API 사용 - API 호출 최적화
    // 계정별 캐시 우선 사용 (forceRefresh면 Notion API 호출)
    const [userInfo, allInsights, history, mappings, followersHistory, followersStats, currentAccount] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'TEST_CONNECTIONS' }),
      chrome.runtime.sendMessage({ type: 'GET_ALL_INSIGHTS' }),
      chrome.runtime.sendMessage({ type: 'GET_SYNC_HISTORY', limit: 100 }),
      chrome.runtime.sendMessage({ type: 'GET_THREAD_MAPPINGS', accountId: currentAccountId, forceRefresh }),
      chrome.runtime.sendMessage({ type: 'GET_FOLLOWERS_HISTORY', accountId: currentAccountId, limit: 90 }),
      chrome.runtime.sendMessage({ type: 'GET_FOLLOWERS_CHANGE_STATS', accountId: currentAccountId }),
      chrome.runtime.sendMessage({ type: 'GET_CURRENT_ACCOUNT' })
    ]);

    // 데이터 객체 구성
    const dashboardData = {
      userInfo,
      allInsights,
      history,
      mappings,
      followersHistory,
      followersStats,
      currentAccount
    };

    // 캐시에 저장
    try {
      await chrome.runtime.sendMessage({
        type: 'SET_CACHED_DASHBOARD_DATA',
        accountId: currentAccountId,
        data: dashboardData
      });
    } catch (e) {
      console.warn('Failed to cache dashboard data:', e);
    }

    // UI 적용
    applyDashboardData(dashboardData);
  } catch (error) {
    console.error('Failed to load dashboard data:', error);
    throw error;
  }
}

/**
 * 대시보드 데이터를 UI에 적용
 */
function applyDashboardData(data) {
  const { userInfo, allInsights, history, mappings, followersHistory, followersStats, currentAccount } = data;

  // mappings 데이터에서 인사이트 계산 (계정별)
  const mappingsArray = Array.isArray(mappings) ? mappings : [];

  // 디버그 로그
  console.log('[Dashboard UI] mappings received:', mappingsArray.length);
  if (mappingsArray.length > 0) {
    const sampleInsights = mappingsArray[0]?.insights;
    console.log('[Dashboard UI] Sample mapping insights:', sampleInsights);
    const totalViews = mappingsArray.reduce((sum, m) => sum + (m.insights?.views || 0), 0);
    console.log('[Dashboard UI] Total views from mappings:', totalViews);
  }

  let insights, totalInsights;

  if (mappingsArray.length > 0) {
    // mappings 기반 인사이트 계산 (계정별 데이터)
    insights = calculateInsightsFromMappings(mappingsArray, currentPeriod);
    totalInsights = calculateInsightsFromMappings(mappingsArray, 9999);
    console.log('[Dashboard UI] Calculated insights:', insights);
    console.log('[Dashboard UI] Calculated totalInsights:', totalInsights);
  } else {
    // 데이터가 없으면 0으로 표시 (다른 계정 데이터 사용 안 함)
    insights = { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, shares: 0, postCount: 0 };
    totalInsights = { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, shares: 0, postCount: 0 };
    console.log('[Dashboard UI] No mappings, showing zeros');
  }

  // 사용자 이름 및 게시글 수 표시
  const postCountText = insights.postCount ? ` (${insights.postCount}개 게시글 기준)` : '';
  const usernameEl = document.getElementById('usernameSubtitle');
  if (usernameEl) {
    // 현재 선택된 계정의 username 사용 (계정별 표시)
    const displayUsername = currentAccount?.username || userInfo?.threads?.user?.username;
    if (displayUsername) {
      const formattedUsername = displayUsername.startsWith('@') ? displayUsername : `@${displayUsername}`;
      usernameEl.textContent = `${formattedUsername}의 계정 인사이트${postCountText}`;
    } else {
      usernameEl.textContent = `계정 인사이트${postCountText}`;
    }
  }

  updateStatsCards(insights);
  updateCharts(mappings || []);

  // 팔로워는 Threads API에서 가져옴 (계정별 토큰 사용)
  updateRatioStats(totalInsights, followersStats);
  updateFollowersHistory(followersHistory || [], followersStats || {}, followersStats?.current || 0);
  updateBestTimeAnalysis(mappings || []);
  updateHistoryTable(history || [], mappings || []);
}

/**
 * 통계 카드 업데이트
 */
function updateStatsCards(insights) {
  document.getElementById('viewsCount').textContent = formatNumber(insights.views || 0);
  document.getElementById('likesCount').textContent = formatNumber(insights.likes || 0);
  document.getElementById('repliesCount').textContent = formatNumber(insights.replies || 0);
  document.getElementById('repostsCount').textContent = formatNumber(insights.reposts || 0);
  document.getElementById('quotesCount').textContent = formatNumber(insights.quotes || 0);
  document.getElementById('sharesCount').textContent = formatNumber(insights.shares || 0);
}

/**
 * 숫자 포맷팅 (항상 정확한 숫자, 콤마 구분)
 */
function formatNumber(num) {
  return num.toLocaleString();
}

/**
 * 차트 업데이트
 */
function updateCharts(mappings) {
  // mappings가 배열인지 확인
  const mappingsArray = Array.isArray(mappings) ? mappings : [];
  updateDailyChart(mappingsArray);
}

/**
 * 일별 조회수 현황 차트 (게시글 작성일 기준 조회수 합산)
 */
function updateDailyChart(mappings) {
  const ctx = document.getElementById('dailyChart').getContext('2d');

  // 최근 7일 조회수 계산
  const dailyData = getLast7DaysViews(mappings);

  if (dailyChart) {
    dailyChart.destroy();
  }

  dailyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dailyData.labels,
      datasets: [{
        label: '조회수',
        data: dailyData.views,
        backgroundColor: 'rgba(31, 58, 95, 0.8)',
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          }
        },
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

/**
 * 전체 조회수 대비 팔로워 전환율 표시
 */
function updateRatioStats(totalInsights, followersStats) {
  const views = totalInsights.views || 0;
  // 팔로워 수: followersStats에서 가져옴 (동기화 시 저장된 값)
  const followers = followersStats?.current || 0;

  // 전환율 계산 (팔로워 / 조회수 * 100)
  const conversionRate = views > 0 ? ((followers / views) * 100).toFixed(2) : 0;

  document.getElementById('totalViewsCount').textContent = formatNumber(views);
  document.getElementById('totalFollowersCount').textContent = formatNumber(followers);
  document.getElementById('conversionRate').textContent = `${conversionRate}%`;
}

/**
 * 팔로워 히스토리 및 변화 통계 업데이트
 */
function updateFollowersHistory(history, stats, currentFollowers) {
  // 현재 팔로워 수 표시 (stats에 없으면 currentFollowers 사용)
  const current = stats?.current || currentFollowers || 0;
  document.getElementById('currentFollowers').textContent = formatNumber(current);

  // 변화 통계 표시
  updateChangeValue('todayChange', stats?.today?.change || 0);
  updateChangeValue('weekChange', stats?.week?.change || 0);
  updateChangeValue('monthChange', stats?.month?.change || 0);
  updateChangeValue('quarterChange', stats?.quarter?.change || 0);
  updateChangeValue('halfYearChange', stats?.halfYear?.change || 0);
  updateChangeValue('yearChange', stats?.year?.change || 0);

  // 히스토리 데이터 캐시 및 달력 렌더링
  followersHistoryData = history || [];
  calendarMonth = new Date(); // 현재 월로 초기화
  renderFollowersCalendar(followersHistoryData);
}

/**
 * 변화값 요소 업데이트 (색상 클래스 적용)
 */
function updateChangeValue(elementId, change) {
  const element = document.getElementById(elementId);
  if (!element) return;

  element.textContent = change === 0 ? '0' : (change > 0 ? change : change);
  element.className = 'change-value';

  if (change > 0) {
    element.classList.add('positive');
  } else if (change < 0) {
    element.classList.add('negative');
  } else {
    element.classList.add('zero');
  }
}

/**
 * 팔로워 달력 렌더링 (안전한 DOM 메서드 사용)
 */
function renderFollowersCalendar(history) {
  const grid = document.getElementById('calendarGrid');
  const monthLabel = document.getElementById('calendarMonthLabel');
  const prevBtn = document.getElementById('prevMonthBtn');
  const nextBtn = document.getElementById('nextMonthBtn');

  if (!grid) return;

  // 월 라벨 업데이트
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  monthLabel.textContent = `${year}년 ${month + 1}월`;

  // 다음 달 버튼 비활성화 (미래 월은 볼 수 없음)
  const today = new Date();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const isFutureMonth = year > today.getFullYear() || (year === today.getFullYear() && month > today.getMonth());
  nextBtn.disabled = isCurrentMonth || isFutureMonth;

  // 이전 달 버튼 비활성화 (90일 이전은 볼 수 없음)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const minYear = ninetyDaysAgo.getFullYear();
  const minMonth = ninetyDaysAgo.getMonth();
  prevBtn.disabled = year < minYear || (year === minYear && month <= minMonth);

  // 히스토리를 날짜별 맵으로 변환
  const historyMap = new Map();
  (history || []).forEach(h => {
    historyMap.set(h.date, h);
  });

  // 해당 월의 첫째 날과 마지막 날
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay(); // 0=일, 1=월, ...

  // 기존 셀 제거
  grid.replaceChildren();

  // 첫째 주 빈 칸
  for (let i = 0; i < startDayOfWeek; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-cell empty';
    grid.appendChild(emptyCell);
  }

  // 날짜 셀
  const todayStr = today.toISOString().split('T')[0];

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const data = historyMap.get(dateStr);
    const isToday = dateStr === todayStr;
    const isFuture = new Date(dateStr) > today;

    const cell = document.createElement('div');
    cell.className = 'calendar-cell';
    if (isToday) cell.classList.add('today');
    if (!data && !isFuture) cell.classList.add('no-data');
    if (isFuture) cell.classList.add('empty');

    if (!isFuture) {
      // 날짜 표시
      const dateSpan = document.createElement('span');
      dateSpan.className = 'calendar-date';
      dateSpan.textContent = `${day}일`;
      cell.appendChild(dateSpan);

      // 팔로워 수 표시
      const followersSpan = document.createElement('span');
      followersSpan.className = 'calendar-followers';
      followersSpan.textContent = data ? formatNumber(data.count) : '-';
      cell.appendChild(followersSpan);

      // 변화량 표시
      if (data) {
        const changeSpan = document.createElement('span');
        changeSpan.className = 'calendar-change';
        if (data.change > 0) {
          changeSpan.classList.add('positive');
          changeSpan.textContent = `+${data.change}`;
        } else if (data.change < 0) {
          changeSpan.classList.add('negative');
          changeSpan.textContent = String(data.change);
        } else {
          changeSpan.classList.add('zero');
          changeSpan.textContent = '-';
        }
        cell.appendChild(changeSpan);
      }
    }

    grid.appendChild(cell);
  }
}

/**
 * mappings 데이터에서 인사이트 계산 (계정별)
 * @param {Array} mappings - 스레드 매핑 배열
 * @param {number} days - 기간 (7, 30, 90 등)
 * @returns {Object} - 집계된 인사이트
 */
function calculateInsightsFromMappings(mappings, days) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  // 기간별 필터링 (9999일이면 전체)
  const filteredMappings = days >= 9999
    ? mappings
    : mappings.filter(m => {
        if (!m.postCreatedAt) return true;
        return new Date(m.postCreatedAt) >= cutoffDate;
      });

  // 집계
  const aggregated = {
    views: 0,
    likes: 0,
    replies: 0,
    reposts: 0,
    quotes: 0,
    shares: 0,
    postCount: filteredMappings.length
  };

  for (const mapping of filteredMappings) {
    if (mapping.insights) {
      aggregated.views += mapping.insights.views || 0;
      aggregated.likes += mapping.insights.likes || 0;
      aggregated.replies += mapping.insights.replies || 0;
      aggregated.reposts += mapping.insights.reposts || 0;
      aggregated.quotes += mapping.insights.quotes || 0;
      aggregated.shares += mapping.insights.shares || 0;
    }
  }

  return aggregated;
}

/**
 * 최근 7일 조회수 계산 (게시글 작성일 기준 조회수 합산)
 */
function getLast7DaysViews(mappings) {
  const labels = [];
  const views = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);

    const dayLabel = i === 0 ? '오늘' : i === 1 ? '어제' : `${date.getMonth() + 1}/${date.getDate()}`;
    labels.push(dayLabel);

    const dayStart = new Date(date);
    const dayEnd = new Date(date);
    dayEnd.setDate(dayEnd.getDate() + 1);

    // 해당 날짜에 작성된 게시글의 조회수 합산
    const dayViews = mappings.reduce((sum, item) => {
      if (!item.postCreatedAt) return sum;
      const itemDate = new Date(item.postCreatedAt);
      if (itemDate >= dayStart && itemDate < dayEnd) {
        return sum + (item.insights?.views || 0);
      }
      return sum;
    }, 0);

    views.push(dayViews);
  }

  return { labels, views };
}

/**
 * 최적 게시 시간 분석 업데이트
 */
function updateBestTimeAnalysis(mappings) {
  const mappingsArray = Array.isArray(mappings) ? mappings : [];

  // 유효한 데이터만 필터링
  const validMappings = mappingsArray.filter(m => m.postCreatedAt && m.insights);

  if (validMappings.length < 3) {
    document.getElementById('dayOfWeekStats').innerHTML =
      '<div class="best-time-loading">분석을 위해 최소 3개 이상의 게시글이 필요합니다</div>';
    document.getElementById('timeOfDayStats').innerHTML =
      '<div class="best-time-loading">분석을 위해 최소 3개 이상의 게시글이 필요합니다</div>';
    return;
  }

  updateDayOfWeekStats(validMappings);
  updateTimeOfDayStats(validMappings);
}

/**
 * 참여율 계산 (조회수 대비 좋아요/댓글/리포스트/인용/공유)
 */
function calculateEngagementRate(insights) {
  const views = insights.views || 0;
  if (views === 0) return 0;

  const engagementCount = (insights.likes || 0) +
                          (insights.replies || 0) * 2 +      // 댓글 2배
                          (insights.reposts || 0) * 1.5 +    // 리포스트 1.5배
                          (insights.quotes || 0) * 2 +       // 인용 2배
                          (insights.shares || 0) * 1.5;      // 공유 1.5배

  return (engagementCount / views) * 100;
}

/**
 * 요일별 평균 참여율 분석
 */
function updateDayOfWeekStats(mappings) {
  const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const dayStats = Array(7).fill(null).map(() => ({ totalRate: 0, count: 0 }));

  mappings.forEach(m => {
    const date = new Date(m.postCreatedAt);
    const dayOfWeek = date.getDay();
    const rate = calculateEngagementRate(m.insights);

    if (rate > 0) {
      dayStats[dayOfWeek].totalRate += rate;
      dayStats[dayOfWeek].count++;
    }
  });

  // 평균 계산 및 정렬
  const dayResults = dayStats
    .map((stat, index) => ({
      day: dayNames[index],
      avgRate: stat.count > 0 ? stat.totalRate / stat.count : 0,
      count: stat.count
    }))
    .filter(d => d.count > 0)
    .sort((a, b) => b.avgRate - a.avgRate);

  if (dayResults.length === 0) {
    document.getElementById('dayOfWeekStats').innerHTML =
      '<div class="best-time-loading">데이터가 없습니다</div>';
    return;
  }

  const maxRate = dayResults[0].avgRate;

  document.getElementById('dayOfWeekStats').innerHTML = dayResults.map((d, i) => `
    <div class="best-time-row ${i === 0 ? 'best' : ''}">
      <div class="best-time-rank">${i + 1}</div>
      <div class="best-time-label">${d.day}</div>
      <div class="best-time-value">${d.avgRate.toFixed(1)}% · ${d.count}개</div>
      <div class="best-time-bar">
        <div class="best-time-bar-fill" style="width: ${(d.avgRate / maxRate) * 100}%"></div>
      </div>
    </div>
  `).join('');
}

/**
 * 시간대별 평균 참여율 분석
 */
function updateTimeOfDayStats(mappings) {
  const timeRanges = [
    { label: '새벽 (0-6시)', start: 0, end: 6 },
    { label: '아침 (6-9시)', start: 6, end: 9 },
    { label: '오전 (9-12시)', start: 9, end: 12 },
    { label: '점심 (12-14시)', start: 12, end: 14 },
    { label: '오후 (14-18시)', start: 14, end: 18 },
    { label: '저녁 (18-21시)', start: 18, end: 21 },
    { label: '밤 (21-24시)', start: 21, end: 24 }
  ];

  const timeStats = timeRanges.map(() => ({ totalRate: 0, count: 0 }));

  mappings.forEach(m => {
    const date = new Date(m.postCreatedAt);
    const hour = date.getHours();
    const rate = calculateEngagementRate(m.insights);

    const rangeIndex = timeRanges.findIndex(r => hour >= r.start && hour < r.end);
    if (rangeIndex >= 0 && rate > 0) {
      timeStats[rangeIndex].totalRate += rate;
      timeStats[rangeIndex].count++;
    }
  });

  // 평균 계산 및 정렬
  const timeResults = timeStats
    .map((stat, index) => ({
      time: timeRanges[index].label,
      avgRate: stat.count > 0 ? stat.totalRate / stat.count : 0,
      count: stat.count
    }))
    .filter(t => t.count > 0)
    .sort((a, b) => b.avgRate - a.avgRate);

  if (timeResults.length === 0) {
    document.getElementById('timeOfDayStats').innerHTML =
      '<div class="best-time-loading">데이터가 없습니다</div>';
    return;
  }

  const maxRate = timeResults[0].avgRate;

  document.getElementById('timeOfDayStats').innerHTML = timeResults.map((t, i) => `
    <div class="best-time-row ${i === 0 ? 'best' : ''}">
      <div class="best-time-rank">${i + 1}</div>
      <div class="best-time-label">${t.time}</div>
      <div class="best-time-value">${t.avgRate.toFixed(1)}% · ${t.count}개</div>
      <div class="best-time-bar">
        <div class="best-time-bar-fill" style="width: ${(t.avgRate / maxRate) * 100}%"></div>
      </div>
    </div>
  `).join('');
}

/**
 * 히스토리 테이블 업데이트 (스레드 기록 + 인사이트)
 */
function updateHistoryTable(history, mappings) {
  const tbody = document.getElementById('historyTableBody');

  // mappings가 배열인지 확인 (에러 객체일 수 있음)
  const mappingsArray = Array.isArray(mappings) ? mappings : [];

  if (mappingsArray.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="empty-state">동기화된 스레드가 없습니다</td>
      </tr>
    `;
    return;
  }

  // 작성시간 기준 내림차순 정렬 (최신순)
  const sortedMappings = [...mappingsArray]
    .filter(m => m.postCreatedAt)
    .sort((a, b) => new Date(b.postCreatedAt) - new Date(a.postCreatedAt));

  tbody.innerHTML = sortedMappings.slice(0, 20).map(mapping => {
    const insights = mapping.insights || {};

    return `
      <tr>
        <td>${mapping.title || `Thread ${mapping.threadId?.slice(0, 8) || 'Unknown'}`}</td>
        <td>${formatNumber(insights.views || 0)}</td>
        <td>${formatNumber(insights.likes || 0)}</td>
        <td>${formatNumber(insights.replies || 0)}</td>
        <td>${formatNumber(insights.reposts || 0)}</td>
        <td>${formatNumber(insights.quotes || 0)}</td>
        <td>${formatNumber(insights.shares || 0)}</td>
        <td>${formatDateTime(mapping.postCreatedAt)}</td>
        <td>
          ${mapping.notionPageId
            ? `<a href="https://notion.so/${mapping.notionPageId.replace(/-/g, '')}" target="_blank" style="color: #1F3A5F;">열기</a>`
            : '-'
          }
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * 날짜/시간 포맷 (노션 스타일: 2024년 12월 10일 오후 2:30)
 */
function formatDateTime(timestamp) {
  if (!timestamp) return '-';

  const date = new Date(timestamp);

  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

// 초기화
document.addEventListener('DOMContentLoaded', init);
