# 팔로워 히스토리 자동 기록 설정 가이드

이 가이드는 **Notion에 팔로워 히스토리를 자동으로 기록**하는 기능을 설정하는 방법을 안내합니다.

GitHub Actions가 **매일 자정(KST 00:00)에 자동으로 팔로워 수를 Notion에 저장**하므로, 브라우저를 열지 않아도 매일 팔로워 변화가 기록됩니다.

---

## 📋 필요한 것

1. **Notion 계정** (Integration 생성 권한 필요)
2. **GitHub 계정** (리포지토리에 대한 Secret 설정 권한)
3. **이미 설정된 Threads to Notion Sync 확장 프로그램**

---

## 1단계: Notion에 팔로워 히스토리 데이터베이스 생성

### 1.1 새 데이터베이스 만들기

1. Notion에서 새 페이지를 만듭니다
2. `/database` 입력 후 "Table - Full page" 선택
3. 데이터베이스 이름을 `Followers History` 로 설정

### 1.2 필수 필드 추가

다음 필드들을 **정확히 이 이름으로** 추가해주세요:

| 필드 이름 | 타입 | 설명 |
|---------|------|------|
| `Date` | Date | 기록 날짜 (YYYY-MM-DD) |
| `Followers` | Number | 팔로워 수 |
| `Account` | Text | 계정 ID (primary 또는 secondary) |
| `Change` | Number | 전날 대비 변화량 (선택) |

### 1.3 Integration 연결

1. 데이터베이스 우측 상단 `...` 클릭
2. **"연결 추가"** → **"Threads to Notion Sync"** Integration 선택
   - Integration이 없다면 [Notion Integration 생성 가이드](https://www.notion.so/my-integrations) 참고
   - Integration에 "읽기 및 쓰기" 권한 부여 필요

### 1.4 데이터베이스 ID 복사

1. 데이터베이스 페이지를 **전체 화면으로 엽니다**
2. 브라우저 주소창에서 URL을 복사합니다
   ```
   https://notion.so/workspace/[DATABASE_ID]?v=...
   ```
3. `[DATABASE_ID]` 부분만 복사합니다 (32자리 문자열)
   - 하이픈(-)은 포함해도 되고 제거해도 됩니다 (자동으로 처리됨)

---

## 2단계: Chrome 확장 프로그램에 DB ID 등록

1. 확장 프로그램 아이콘 클릭
2. **"설정"** 버튼 클릭
3. **"계정 관리"** 섹션에서 해당 계정 편집
4. **"Followers History DB ID"** 필드에 복사한 ID 붙여넣기
5. **"저장"** 클릭

---

## 3단계: GitHub Actions 시크릿 설정

### 3.1 GitHub 리포지토리로 이동

1. 리포지토리 페이지에서 **"Settings"** 탭 클릭
2. 왼쪽 메뉴에서 **"Secrets and variables"** → **"Actions"** 클릭

### 3.2 시크릿 추가

다음 시크릿을 추가합니다:

#### Primary 계정용
- **이름**: `FOLLOWERS_HISTORY_DB_PRIMARY`
- **값**: 1단계에서 복사한 Followers History DB ID

#### Secondary 계정용 (사용하는 경우)
- **이름**: `FOLLOWERS_HISTORY_DB_SECONDARY`
- **값**: Secondary 계정의 Followers History DB ID

### 3.3 기존 시크릿 확인

다음 시크릿들이 이미 설정되어 있어야 합니다:
- `NOTION_SECRET`
- `THREADS_TOKEN_PRIMARY` (또는 `SECONDARY`)
- `NOTION_DB_PRIMARY` (또는 `SECONDARY`)

---

## 4단계: 테스트

### 4.1 수동 실행으로 테스트

1. GitHub 리포지토리에서 **"Actions"** 탭 클릭
2. 왼쪽에서 **"Midnight Special Sync"** 워크플로우 선택
3. **"Run workflow"** 버튼 클릭
4. 브랜치 선택 후 **"Run workflow"** 클릭

### 4.2 결과 확인

1. 워크플로우 실행이 완료되면 (약 1-2분 소요)
2. Notion의 Followers History 데이터베이스를 엽니다
3. 오늘 날짜로 새 엔트리가 생성되었는지 확인합니다

---

## 자동 실행 스케줄

설정이 완료되면 GitHub Actions가 다음 일정으로 자동 실행됩니다:

- **매일 자정 (KST 00:00 / UTC 15:00)**: 팔로워 수 기록 + 전체 동기화
- **매시간 (1시~23시)**: 새 게시글 동기화 + 인사이트 업데이트

---

## 대시보드에서 확인

설정 완료 후:
1. 확장 프로그램 대시보드를 엽니다
2. **"팔로워 변화 추이"** 섹션에서 달력을 확인합니다
3. Notion에 저장된 팔로워 히스토리가 자동으로 표시됩니다

---

## 문제 해결

### 팔로워가 기록되지 않는 경우

1. **GitHub Actions 로그 확인**
   - Actions 탭에서 최근 실행된 워크플로우 클릭
   - 로그에서 오류 메시지 확인

2. **Notion Integration 권한 확인**
   - Followers History DB에 Integration이 연결되어 있는지 확인
   - Integration에 "읽기 및 쓰기" 권한이 있는지 확인

3. **필드 이름 확인**
   - Notion DB의 필드 이름이 정확히 `Date`, `Followers`, `Account`, `Change` 인지 확인
   - 대소문자, 띄어쓰기 주의

4. **GitHub 시크릿 확인**
   - `FOLLOWERS_HISTORY_DB_PRIMARY` (또는 `SECONDARY`) 시크릿이 정확히 설정되었는지 확인
   - DB ID가 32자리인지 확인

### 대시보드에 표시되지 않는 경우

1. 확장 프로그램 설정에서 **Followers History DB ID**가 입력되어 있는지 확인
2. 대시보드에서 **"새로고침"** 버튼 클릭
3. 브라우저 콘솔(F12)에서 오류 메시지 확인

---

## 추가 정보

- 팔로워 히스토리는 **최근 90일**까지 표시됩니다
- **전날 대비 변화량**이 자동으로 계산되어 저장됩니다
- 같은 날짜에 중복 기록이 생성되지 않습니다 (이미 있으면 건너뜀)
- 로컬 스토리지 팔로워 기록과 Notion 팔로워 히스토리가 **별도로 관리**됩니다
  - Notion 우선, 없으면 로컬 스토리지 사용 (자동 fallback)
