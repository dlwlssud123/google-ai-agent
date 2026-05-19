This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

---

## ChromaDB 및 데이터 적재 (RAG Ingestion) 설정

이 프로젝트는 RAG(검색 증강 생성) 기술을 사용하여 `data/` 폴더에 위치한 PDF 및 이미지 매뉴얼 정보를 기반으로 AI가 답변을 도출하도록 돕습니다. 로컬 개발 환경에서 파이프라인을 작동하려면 다음과 같이 ChromaDB와 인제스천 스크립트를 구동해야 합니다.

### 1. ChromaDB 로컬 서버 실행

로컬 벡터 데이터베이스를 사용하기 위해 별도의 터미널에서 ChromaDB 서버를 구동합니다. (Python 및 `chromadb` 패키지가 설치되어 있어야 합니다.)

```bash
# Windows 환경에서 파이썬 패키지 경로의 chroma.exe 직접 가동
C:\Users\vbnm9\AppData\Local\Python\pythoncore-3.14-64\Scripts\chroma.exe run --path ./chroma_db --port 8000
```

* 기본적으로 포트 `8000`에서 실행되며, `.env.local` 파일의 `CHROMADB_URL=http://localhost:8000` 설정과 연결됩니다.

### 2. 데이터 적재 파이프라인 실행 (Data Ingestion)

`data/` 디렉토리에 위치한 모든 PDF 및 이미지 파일을 파싱하고, Gemini Embedding API를 활용해 벡터 데이터를 추출한 뒤 로컬 ChromaDB에 적재합니다.

```bash
# 기본 실행 (무료 API 요금제를 위한 속도 제한 방지 적용 - freeTier=true 기본값)
npx tsx src/scripts/ingest.ts --clearDB=true

# 유료(Pay-as-you-go) API 키 사용 시 빠른 적재 처리 (동시 처리 3개, 지연 150ms)
npx tsx src/scripts/ingest.ts --clearDB=true --freeTier=false
```

#### 옵션 설명
* **`--clearDB=true`**: 기존에 ChromaDB에 적재되어 있던 벡터 데이터를 초기화하고 처음부터 새로 적재합니다.
* **`--freeTier=true` (기본값)**: Gemini API 무료 요금제의 RPM(분당 요청 15회) 제한을 우회하기 위해 **동시성 1**, **페이지 간 지연 시간 4,000ms(4초)**를 적용하며, API 호출에 대해 429 Too Many Requests 에러가 검출되면 자동으로 15초 이상 대기하는 지수 백오프 기반의 재시도 로직이 수행됩니다.

