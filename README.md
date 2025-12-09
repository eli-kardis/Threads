# Threads to Notion Sync

Threads에 작성한 글을 자동으로 Notion 데이터베이스에 동기화하는 크롬 확장 프로그램입니다.

## 기능

- **자동 동기화**: 새 Threads 게시글을 5초 이내에 Notion에 저장
- **필드 매핑**: Notion 데이터베이스 필드에 맞춤 매핑
- **완전 무료**: 서버 없이 클라이언트에서 모든 처리
- **개인정보 보호**: API 토큰은 로컬에만 저장

## 설치

### 개발 모드로 설치

1. 이 저장소를 클론합니다:
   ```bash
   git clone https://github.com/eli-kardis/Threads.git
   ```

2. Chrome에서 `chrome://extensions`로 이동

3. "개발자 모드" 활성화

4. "압축해제된 확장 프로그램을 로드합니다" 클릭

5. 프로젝트 폴더 선택

## 설정

### 1. Threads API 토큰 발급

1. [Meta Developer Portal](https://developers.facebook.com/)에서 앱 생성
2. Threads API 권한 설정
3. Access Token 발급

### 2. Notion Integration 설정

1. [Notion Integrations](https://www.notion.so/my-integrations)에서 새 Integration 생성
2. Internal Integration Secret 복사
3. 동기화할 데이터베이스에 Integration 연결
4. 데이터베이스 URL에서 Database ID 확인

### 3. 확장 프로그램 설정

1. 확장 프로그램 아이콘 클릭 → 설정
2. Threads Access Token 입력
3. Notion Secret & Database ID 입력
4. 필드 매핑 설정
5. 저장

## 폴더 구조

```
/
├── manifest.json           # 확장 프로그램 설정
├── icons/                  # 아이콘 파일
├── src/
│   ├── background.js       # 백그라운드 서비스 워커
│   ├── content.js          # 콘텐츠 스크립트 (Threads 페이지)
│   ├── api/
│   │   ├── notion.js       # Notion API 클라이언트
│   │   └── threads.js      # Threads API 클라이언트
│   ├── storage/
│   │   └── storage.js      # 로컬 스토리지 관리
│   ├── ui/
│   │   ├── popup.html/js   # 팝업 UI
│   │   └── options.html/js # 설정 페이지
│   └── shared/
│       └── utils.js        # 공통 유틸리티
└── README.md
```

## 기술 스택

- **Manifest v3**: 최신 Chrome 확장 프로그램 표준
- **JavaScript ES6+**: 순수 JavaScript
- **chrome.storage.local**: 로컬 데이터 저장
- **Notion API**: 페이지 생성
- **Threads API**: 게시글 조회

## 개발

### 로컬 테스트

1. Chrome에서 확장 프로그램 로드
2. Threads 페이지 (`threads.net`) 방문
3. 개발자 도구에서 로그 확인

### 파일 수정 후 적용

1. `chrome://extensions`에서 확장 프로그램 새로고침 버튼 클릭
2. 또는 Threads 탭 새로고침

## 라이선스

MIT License

## 기여

이슈와 PR 환영합니다!
