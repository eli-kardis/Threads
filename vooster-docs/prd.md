# Threads → Notion Sync Chrome Extension PRD

## 1. 제품 개요
Threads(Instagram Threads)에 게시한 글을 자동으로 Notion 데이터베이스에 저장해 주는 크롬 확장 프로그램입니다. 사용자는 자신의 Threads·Notion API 토큰만 입력하면 1분 내로 설정이 끝나고, 이후 모든 글이 자동으로 구조화되어 백업됩니다. 서버가 따로 없으므로 완전 무료이며, 개인정보는 로컬에만 저장됩니다.

## 2. 문제 정의
- Threads에는 내 게시글을 모아서 볼 기본 기능이 없습니다.
- 수동으로 복사·붙여넣기 하려면 시간이 많이 듭니다.
- 글이 흩어져 아이디어를 잃고, 재활용이 어렵습니다.

## 3. 목표
"Threads 글을 자동으로 체계적으로 저장해 아이디어 손실을 막고, 복붙 시간을 절약해 창작에 집중한다."

### 정량 목표 (MVP 기준)
- 초기 설치 100명, 주간 활성 사용자 50명
- 평균 초기 세팅 시간 < 1분
- 동기화 성공률 95% 이상

## 4. 주요 사용자(Persona)
| 구분 | 설명 |
| --- | --- |
| 이름 | 소피 김 (29) 1인 크리에이터 |
| 특징 | Threads·Instagram을 통해 팬과 소통, Notion 으로 콘텐츠 아카이빙 |
| 주요 Pain | 내 글 모아보기 기능 부재, 수동 백업 시간 낭비 |
| 목표 | 자동 백업으로 창작 시간 확보, 언제든 과거 아이디어 검색 |

## 5. 핵심 기능 (MVP)
1. **자동 동기화** (Core)
   - 새 Threads 글이 게시되면 5초 이내 Notion DB 페이지 생성
2. **Notion DB/필드 매핑 설정** (Core)
   - 사용자 토큰·Database ID 입력 후, 제목·본문·이미지 등 컬럼 맵핑 UI 제공
3. **동기화 상태 알림** (Nice to have)
   - 성공/실패 토스트 팝업, 배지 카운트 표시

### 백로그(차기)
- 해시태그·키워드 필터링 후 선택적 동기화
- 글 수정 시 Notion 페이지 업데이트
- 게시물 통계 시각화

## 6. 사용 시나리오 (요약)
1. 크롬 웹스토어에서 확장 설치
2. 첫 실행 시 설정 페이지 자동 팝업
3. Threads·Notion 토큰과 DB ID 입력 → 저장
4. Threads 에서 글 작성·게시
5. 확장이 이벤트 감지·API 호출 → Notion 페이지 생성
6. 성공 토스트 노티; Notion DB에서 글 확인

## 7. 기능 상세 요구사항
| ID | 기능 | 설명 |
| --- | --- | --- |
| FR1 | 토큰 입력 UI | Threads Access Token, Notion Secret, DB ID 입력 후 저장(Local) |
| FR2 | 게시 감지 | DOM Mutation 또는 Threads API Polling으로 새 글 포착 |
| FR3 | 데이터 수집 | 글 내용, 이미지 URL, 작성 시각 메타데이터 추출 |
| FR4 | Notion 페이지 생성 | 지정 DB에 JSON으로 생성, 필드 매핑 반영 |
| FR5 | 알림 | chrome.notifications API로 결과 표시 |
| NFR1 | 보안 | 토큰은 chrome.storage.local 에 암호화 저장, 외부 전송 금지 |
| NFR2 | 성능 | 동기화 지연 ≤ 5초, CPU 점유율 평균 5% 이하 |

## 8. 기술/제약 사항
- 전부 클라이언트 사이드(JavaScript)로 구현, 별도 서버 없음
- Threads 공식 API 공개 범위 미비 시, 비공식 GraphQL 호출이나 DOM 파싱 사용 가능성
- Notion API Rate Limit 3초/리퀘스트 → 큐 & Retry 필요

## 9. KPI & 측정 지표
- 설치 수, MAU, 동기화 성공률, 평균 설정 시간, 알림 클릭률

## 10. 일정(가안)
| 주차 | 작업 |
| --- | --- |
| 1주차 | 기술 검토, PoC, UI Wireframe |
| 2주차 | 핵심 기능 개발(FR1~FR4) |
| 3주차 | QA, Manifest 제출, Chrome Web Store 등록 |

## 11. 위험 & 대응
- Threads 비공식 API 변경 → 버전 모니터링 및 핫픽스 절차 준비
- Notion Rate Limit 초과 → 재시도 로직 및 사용자 알림

## 12. 버전 관리 & 배포
- GitHub Private Repo → 출시 후 Public 전환 고려
- Manifest v3 적용, Web Store 자동 업데이트 채널 사용

## 13. 성공 정의
"1분 만에 설정 끝내고, 글을 올리면 아무것도 신경 쓰지 않아도 Notion에 정확히 저장되는 경험"