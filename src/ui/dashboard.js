/**
 * Dashboard 페이지 로직 - Threads 통계
 */

let dailyChart = null;
let currentPeriod = 7;

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
  await loadDashboardData();
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
}

/**
 * 통계 새로고침 후 데이터 다시 로드 (팝업과 동일한 로직)
 */
async function refreshAndReload() {
  console.log('refreshAndReload called');
  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn.textContent = '새로고침 중...';
  refreshBtn.disabled = true;

  try {
    // 14일 이내 인사이트 새로고침 + 새 글 동기화
    console.log('Sending SYNC_NOW...');
    const result = await chrome.runtime.sendMessage({ type: 'SYNC_NOW' });
    console.log('SYNC_NOW result:', result);

    // 결과 표시
    if (result.success) {
      const parts = [];
      if (result.refreshedCount > 0) parts.push(`${result.refreshedCount}개 새로고침`);
      if (result.syncedCount > 0) parts.push(`${result.syncedCount}개 동기화`);
      refreshBtn.textContent = parts.length > 0 ? `✓ ${parts.join(', ')}` : '✓ 최신 상태';
    }

    // 데이터 다시 로드
    await loadDashboardData();
  } catch (error) {
    console.error('Refresh failed:', error);
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
 */
async function loadDashboardData() {
  try {
    // 통합 API 사용 - API 호출 최적화
    const [userInfo, allInsights, history, mappings] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'TEST_CONNECTIONS' }),
      chrome.runtime.sendMessage({ type: 'GET_ALL_INSIGHTS' }),
      chrome.runtime.sendMessage({ type: 'GET_SYNC_HISTORY', limit: 100 }),
      chrome.runtime.sendMessage({ type: 'GET_THREAD_MAPPINGS' })
    ]);

    // 현재 선택된 기간에 따라 인사이트 선택
    const periodMap = { 7: 'week', 30: 'month', 90: 'total' };
    const insights = allInsights[periodMap[currentPeriod]] || allInsights.week;
    const totalInsights = allInsights.total;

    // 사용자 이름 및 게시글 수 표시
    if (userInfo?.threads?.user?.username) {
      const postCountText = insights.postCount ? ` (${insights.postCount}개 게시글 기준)` : '';
      document.getElementById('usernameSubtitle').textContent =
        `@${userInfo.threads.user.username}의 계정 인사이트${postCountText}`;
    }

    updateStatsCards(insights);
    updateCharts(mappings);
    updateRatioStats(totalInsights);
    updateBestTimeAnalysis(mappings);
    updateHistoryTable(history, mappings);
  } catch (error) {
    console.error('Failed to load dashboard data:', error);
  }
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
function updateRatioStats(totalInsights) {
  const views = totalInsights.views || 0;
  const followers = totalInsights.followers_count || 0;

  // 전환율 계산 (팔로워 / 조회수 * 100)
  const conversionRate = views > 0 ? ((followers / views) * 100).toFixed(2) : 0;

  document.getElementById('totalViewsCount').textContent = formatNumber(views);
  document.getElementById('totalFollowersCount').textContent = formatNumber(followers);
  document.getElementById('conversionRate').textContent = `${conversionRate}%`;
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
