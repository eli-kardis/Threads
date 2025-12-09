# Threads → Notion Sync 크롬 확장 프로그램 정보 아키텍처 (IA)

## 1. 사이트맵 (사이트맵)

```
크롬 확장 팝업 (400px x 최대 600px)
├── 홈/상태 (Home/Status)
│   ├── 동기화 상태 대시보드
│   ├── 최근 동기화 내역
│   └── 빠른 설정 바로가기
├── 설정 (Settings)
│   ├── 토큰 관리
│   │   ├── Threads 액세스 토큰
│   │   ├── Notion 시크릿 키
│   │   └── Notion 데이터베이스 ID
│   ├── 필드 매핑 설정
│   │   ├── 제목 필드 매핑
│   │   ├── 본문 필드 매핑
│   │   ├── 이미지 필드 매핑
│   │   └── 태그 필드 매핑
│   └── 동기화 옵션
│       ├── 자동 동기화 활성화/비활성화
│       └── 동기화 주기 설정
├── 대시보드 (Dashboard)
│   ├── 통계 현황
│   │   ├── 총 동기화 글 수
│   │   ├── 이번 주 동기화 수
│   │   └── 성공률
│   ├── 동기화 로그
│   │   ├── 성공 내역
│   │   ├── 실패 내역
│   │   └── 재시도 내역
│   └── Notion 바로가기
└── 도움말 (Help)
    ├── 설정 가이드
    ├── 문제 해결
    ├── FAQ
    └── 피드백 보내기
```

## 2. 사용자 흐름 (사용자 흐름)

**핵심 작업 1: 초기 설정 완료**
1. 사용자가 확장 아이콘을 클릭한다
2. 온보딩 화면이 표시된다
3. "설정 시작하기" 버튼을 클릭한다
4. 설정 페이지로 이동한다
5. Threads 토큰을 입력한다
6. Notion 시크릿 키를 입력한다
7. Notion 데이터베이스 ID를 입력한다
8. "연결 테스트" 버튼을 클릭한다
9. 필드 매핑 설정 화면으로 이동한다
10. 제목, 본문, 이미지 필드를 매핑한다
11. "설정 완료" 버튼을 클릭한다
12. 홈/상태 페이지로 리다이렉트된다

**핵심 작업 2: 글 동기화 모니터링**
1. 사용자가 Threads에서 새 글을 작성한다
2. 확장이 자동으로 글을 감지한다
3. 백그라운드에서 Notion API 호출이 시작된다
4. 사용자가 확장 팝업을 연다
5. 홈/상태 페이지에서 진행 상황을 확인한다
6. 동기화 완료 시 성공 알림이 표시된다
7. "Notion에서 보기" 버튼을 클릭한다
8. 새 탭에서 Notion 페이지가 열린다

**핵심 작업 3: 동기화 문제 해결**
1. 사용자가 동기화 실패 알림을 받는다
2. 확장 팝업을 열어 대시보드로 이동한다
3. 동기화 로그에서 실패 내역을 확인한다
4. 오류 메시지를 읽고 원인을 파악한다
5. 도움말 페이지로 이동한다
6. 문제 해결 가이드를 따라 해결한다
7. 설정 페이지에서 토큰을 재입력한다
8. "재시도" 버튼을 클릭한다

## 3. 네비게이션 구조 (네비게이션 구조)

**상단바 네비게이션 (Global Navigation Bar)**
- 위치: 팝업 상단 고정 (48px 높이)
- 구성: 좌측 로고 + 제목, 우측 알림 아이콘
- 배경색: #1F3A5F (네이비 블루)

**좌측 아이콘 네비게이션 (Left Icon Navigation)**
- 위치: 상단바 하단, 세로 배치
- 구성: 4개 주요 섹션 아이콘
  - 홈 아이콘 (집 모양)
  - 설정 아이콘 (톱니바퀴)
  - 대시보드 아이콘 (차트)
  - 도움말 아이콘 (물음표)
- 상호작용: 클릭 시 해당 섹션으로 이동, 활성 상태 하이라이트

**하단 액션 영역 (Footer Action Bar)**
- 위치: 팝업 하단 고정 (56px 높이)
- 구성: 주요 액션 버튼 (페이지별 상이)
- 배경색: #F7F9FC (라이트 블루 그레이)

## 4. 페이지 계층 구조 (페이지 계층 구조)

```
/ (팝업 루트 - Depth 0)
├── /home (홈/상태 - Depth 1)
│   ├── /home/sync-status (동기화 상태 - Depth 2)
│   └── /home/recent-activity (최근 활동 - Depth 2)
├── /settings (설정 - Depth 1)
│   ├── /settings/tokens (토큰 관리 - Depth 2)
│   │   ├── /settings/tokens/threads (Threads 토큰 - Depth 3)
│   │   ├── /settings/tokens/notion-secret (Notion 시크릿 - Depth 3)
│   │   └── /settings/tokens/notion-db (Notion DB ID - Depth 3)
│   ├── /settings/mapping (필드 매핑 - Depth 2)
│   └── /settings/sync-options (동기화 옵션 - Depth 2)
├── /dashboard (대시보드 - Depth 1)
│   ├── /dashboard/stats (통계 현황 - Depth 2)
│   └── /dashboard/logs (동기화 로그 - Depth 2)
└── /help (도움말 - Depth 1)
    ├── /help/setup-guide (설정 가이드 - Depth 2)
    ├── /help/troubleshooting (문제 해결 - Depth 2)
    ├── /help/faq (FAQ - Depth 2)
    └── /help/feedback (피드백 - Depth 2)
```

## 5. 콘텐츠 구성 (콘텐츠 구성)

| 페이지 | 주요 콘텐츠 요소 |
|---|---|
| 홈/상태 | 동기화 상태 표시기, 최근 동기화 내역 리스트, 빠른 설정 버튼, 성공/실패 카운터 |
| 설정/토큰 관리 | 토큰 입력 필드 3개, 연결 테스트 버튼, 유효성 검사 메시지, 저장 버튼 |
| 설정/필드 매핑 | 드롭다운 선택기 4개, 미리보기 영역, 매핑 상태 표시, 저장 버튼 |
| 설정/동기화 옵션 | 토글 스위치, 주기 선택 드롭다운, 설정 설명 텍스트, 저장 버튼 |
| 대시보드/통계 | 숫자 카운터 3개, 도넛 차트, 진행률 바, 기간 선택기 |
| 대시보드/로그 | 테이블 형태 로그 리스트, 필터 버튼, 재시도 버튼, 상세보기 모달 |
| 도움말/설정 가이드 | 단계별 스크린샷, 설명 텍스트, 복사 가능한 코드 블록, 다음/이전 버튼 |
| 도움말/문제 해결 | 아코디언 형태 FAQ, 검색 필드, 관련 링크, 피드백 버튼 |

## 6. 인터랙션 패턴 (인터랙션 패턴)

**모달 (Modal)**
- 용도: 토큰 입력 상세, 동기화 로그 상세 보기, 확인 대화상자
- 스타일: 중앙 정렬, 반투명 오버레이, ESC 키로 닫기

**토스트 알림 (Toast Notification)**
- 용도: 성공/실패/경고 메시지 표시
- 위치: 팝업 상단, 3초 후 자동 사라짐
- 스타일: 슬라이드 인 애니메이션

**툴팁 (Tooltip)**
- 용도: 도움말 텍스트, 기능 설명
- 트리거: 호버 또는 포커스
- 스타일: 말풍선 형태, 어두운 배경

**로딩 상태 (Loading State)**
- 스피너: API 호출 중 버튼에 표시
- 프로그레스 바: 동기화 진행률 표시
- 스켈레톤: 데이터 로딩 중 레이아웃 유지

**드래그 앤 드롭 (Drag & Drop)**
- 용도: 필드 매핑 순서 변경
- 시각적 피드백: 드래그 중 반투명, 드롭 영역 하이라이트

**무한 스크롤 (Infinite Scroll)**
- 용도: 동기화 로그 목록
- 트리거: 스크롤 하단 도달 시 추가 로드

## 7. URL 구조 (URL 구조)

크롬 확장 프로그램의 특성상 실제 URL은 존재하지 않지만, 내부 라우팅을 위한 경로 구조:

**일반 경로 패턴**
- 기본: `/{section}`
- 상세: `/{section}/{subsection}`
- 매개변수: `/{section}/{subsection}?param=value`

**구체적 경로 예시**
- 홈: `/home`
- 설정 메인: `/settings`
- 토큰 설정: `/settings/tokens`
- 필드 매핑: `/settings/mapping`
- 대시보드: `/dashboard`
- 통계: `/dashboard/stats`
- 로그: `/dashboard/logs?filter=failed`
- 도움말: `/help`
- 설정 가이드: `/help/setup-guide`

**SEO 고려사항**
- 크롬 확장 프로그램은 검색 엔진 노출 대상이 아니므로 SEO 최적화 불필요
- 사용자 편의를 위한 직관적 경로명 사용
- 브라우저 히스토리 지원으로 뒤로가기 기능 구현

## 8. 컴포넌트 계층 구조 (컴포넌트 계층 구조)

**글로벌 컴포넌트 (Global Components)**
- `Header`: 상단바 네비게이션 (로고, 제목, 알림 아이콘)
- `SideNavigation`: 좌측 아이콘 네비게이션
- `Footer`: 하단 액션 영역
- `Toast`: 알림 메시지 컴포넌트
- `Modal`: 모달 다이얼로그 베이스
- `LoadingSpinner`: 로딩 상태 표시기

**카드 컴포넌트 (Card Components)**
- `StatusCard`: 동기화 상태 표시 카드
- `StatsCard`: 통계 정보 표시 카드
- `LogCard`: 동기화 로그 항목 카드
- `SettingCard`: 설정 항목 카드

**폼 컴포넌트 (Form Components)**
- `TokenInput`: 토큰 입력 필드
- `MappingSelector`: 필드 매핑 선택기
- `ToggleSwitch`: 온/오프 토글
- `DropdownSelect`: 드롭다운 선택기
- `Button`: 버튼 (Primary, Secondary, Danger 변형)

**데이터 표시 컴포넌트 (Data Display Components)**
- `SyncLogTable`: 동기화 로그 테이블
- `ProgressBar`: 진행률 표시 바
- `DonutChart`: 도넛 차트
- `Counter`: 숫자 카운터

**페이지별 컴포넌트 (Page-specific Components)**

**홈/상태 페이지**
- `SyncStatusDashboard`: 전체 동기화 상태 대시보드
- `RecentActivityList`: 최근 동기화 내역 리스트
- `QuickActionPanel`: 빠른 설정 패널

**설정 페이지**
- `TokenManagementForm`: 토큰 관리 폼
- `FieldMappingInterface`: 필드 매핑 인터페이스
- `SyncOptionsPanel`: 동기화 옵션 패널

**대시보드 페이지**
- `StatisticsOverview`: 통계 현황 개요
- `SyncLogViewer`: 동기화 로그 뷰어
- `NotionShortcut`: Notion 바로가기 버튼

**도움말 페이지**
- `SetupGuideWizard`: 설정 가이드 위저드
- `TroubleshootingAccordion`: 문제 해결 아코디언
- `FAQList`: FAQ 리스트
- `FeedbackForm`: 피드백 폼

**컴포넌트 재사용성 원칙**
- 모든 컴포넌트는 props를 통한 커스터마이징 지원
- 글로벌 컴포넌트는 모든 페이지에서 일관된 디자인 유지
- 카드 컴포넌트는 다양한 콘텐츠 타입에 재사용 가능
- 폼 컴포넌트는 검증 로직과 에러 상태 처리 내장
- 반응형 디자인을 위한 브레이크포인트 대응