/**
 * Dashboard 페이지 로직
 */

let dailyChart = null;
let ratioChart = null;
let currentFilter = 'all';

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
  document.getElementById('refreshBtn').addEventListener('click', loadDashboardData);
  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // 필터 버튼
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.filter;
      loadHistory();
    });
  });
}

/**
 * 대시보드 데이터 로드
 */
async function loadDashboardData() {
  try {
    const [stats, history] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_SYNC_STATS' }),
      chrome.runtime.sendMessage({ type: 'GET_SYNC_HISTORY', limit: 100 })
    ]);

    updateStatsCards(stats);
    updateCharts(history, stats);
    updateHistoryTable(history);
  } catch (error) {
    console.error('Failed to load dashboard data:', error);
  }
}

/**
 * 통계 카드 업데이트
 */
function updateStatsCards(stats) {
  document.getElementById('totalCount').textContent = stats.total || 0;
  document.getElementById('successCount').textContent = stats.success || 0;
  document.getElementById('failedCount').textContent = stats.failed || 0;
  document.getElementById('successRate').textContent = `${stats.successRate || 0}%`;

  document.getElementById('totalChange').textContent = `+${stats.thisWeek || 0} 이번 주`;
  document.getElementById('successChange').textContent = `+${stats.today || 0} 오늘`;
}

/**
 * 차트 업데이트
 */
function updateCharts(history, stats) {
  updateDailyChart(history);
  updateRatioChart(stats);
}

/**
 * 일별 차트 업데이트
 */
function updateDailyChart(history) {
  const ctx = document.getElementById('dailyChart').getContext('2d');

  // 최근 7일 데이터 계산
  const dailyData = getLast7DaysData(history);

  if (dailyChart) {
    dailyChart.destroy();
  }

  dailyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dailyData.labels,
      datasets: [
        {
          label: '성공',
          data: dailyData.success,
          backgroundColor: 'rgba(16, 185, 129, 0.8)',
          borderRadius: 4
        },
        {
          label: '실패',
          data: dailyData.failed,
          backgroundColor: 'rgba(239, 68, 68, 0.8)',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          align: 'end'
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: {
            display: false
          }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      }
    }
  });
}

/**
 * 비율 차트 업데이트
 */
function updateRatioChart(stats) {
  const ctx = document.getElementById('ratioChart').getContext('2d');

  if (ratioChart) {
    ratioChart.destroy();
  }

  const successCount = stats.success || 0;
  const failedCount = stats.failed || 0;

  if (successCount === 0 && failedCount === 0) {
    // 데이터가 없을 때
    ratioChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['데이터 없음'],
        datasets: [{
          data: [1],
          backgroundColor: ['#E5E7EB'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
    return;
  }

  ratioChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['성공', '실패'],
      datasets: [{
        data: [successCount, failedCount],
        backgroundColor: [
          'rgba(16, 185, 129, 0.8)',
          'rgba(239, 68, 68, 0.8)'
        ],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });
}

/**
 * 최근 7일 데이터 계산
 */
function getLast7DaysData(history) {
  const labels = [];
  const success = [];
  const failed = [];

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

    const dayHistory = history.filter(item => {
      const itemDate = new Date(item.timestamp);
      return itemDate >= dayStart && itemDate < dayEnd;
    });

    success.push(dayHistory.filter(h => h.status === 'success').length);
    failed.push(dayHistory.filter(h => h.status === 'failed').length);
  }

  return { labels, success, failed };
}

/**
 * 히스토리 테이블 업데이트
 */
function updateHistoryTable(history) {
  const tbody = document.getElementById('historyTableBody');

  let filteredHistory = history;
  if (currentFilter !== 'all') {
    filteredHistory = history.filter(h => h.status === currentFilter);
  }

  if (!filteredHistory || filteredHistory.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-state">동기화 기록이 없습니다</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredHistory.slice(0, 20).map(item => `
    <tr>
      <td>${item.title || `Thread ${item.threadId?.slice(0, 8) || 'Unknown'}`}</td>
      <td>
        <span class="status-badge ${item.status}">
          ${item.status === 'success' ? '✓ 성공' : '✕ 실패'}
        </span>
      </td>
      <td>${formatRelativeTime(item.timestamp)}</td>
      <td>
        ${item.notionPageId
          ? `<a href="https://notion.so/${item.notionPageId.replace(/-/g, '')}" target="_blank" style="color: #1F3A5F;">열기</a>`
          : '-'
        }
      </td>
    </tr>
  `).join('');
}

/**
 * 히스토리만 다시 로드
 */
async function loadHistory() {
  try {
    const history = await chrome.runtime.sendMessage({ type: 'GET_SYNC_HISTORY', limit: 100 });
    updateHistoryTable(history);
  } catch (error) {
    console.error('Failed to load history:', error);
  }
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

// 초기화
document.addEventListener('DOMContentLoaded', init);
