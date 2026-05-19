import fs from "fs";
import path from "path";

// DB 스키마 정의
export interface ManualMetadata {
  id: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  status: "pending" | "success" | "failed";
}

export interface QACacheItem {
  query: string;
  vector: number[];
  answer: string;
  citations: Array<{ source: string; page: number }>;
  nextSteps: string[];
  status: string;
  createdAt: string;
}

export interface DatabaseSchema {
  manuals: ManualMetadata[];
  qa_cache: QACacheItem[];
}

const DB_DIR = path.resolve(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "db.json");

// DB 파일 초기화 및 안전 로드
function initDB(): DatabaseSchema {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_PATH)) {
    const initialData: DatabaseSchema = { manuals: [], qa_cache: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2), "utf8");
    return initialData;
  }

  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.error("[Local DB Error] db.json 파싱 오류, 초기화합니다.", error);
    const initialData: DatabaseSchema = { manuals: [], qa_cache: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2), "utf8");
    return initialData;
  }
}

// DB 파일 저장
function saveDB(data: DatabaseSchema) {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("[Local DB Error] db.json 저장 중 오류 발생:", error);
  }
}

// 두 벡터 간의 코사인 유사도 구하기
export function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ----------------------------------------------------
// 매뉴얼 파일 관리 API
// ----------------------------------------------------

export function getManuals(): ManualMetadata[] {
  const db = initDB();
  return db.manuals;
}

export function addManual(fileName: string, fileSize: number): ManualMetadata {
  const db = initDB();
  
  // 중복 제거
  const safeId = fileName.replace(/[^a-zA-Z0-9가-힣]/g, "_");
  const existingIdx = db.manuals.findIndex((m) => m.id === safeId);

  const newManual: ManualMetadata = {
    id: safeId,
    fileName,
    fileSize,
    uploadedAt: new Date().toISOString(),
    status: "pending",
  };

  if (existingIdx >= 0) {
    db.manuals[existingIdx] = newManual;
  } else {
    db.manuals.push(newManual);
  }

  saveDB(db);
  return newManual;
}

export function updateManualStatus(id: string, status: "pending" | "success" | "failed") {
  const db = initDB();
  const manual = db.manuals.find((m) => m.id === id);
  if (manual) {
    manual.status = status;
    saveDB(db);
  }
}

export function deleteManual(id: string): string | null {
  const db = initDB();
  const manualIdx = db.manuals.findIndex((m) => m.id === id);
  if (manualIdx >= 0) {
    const fileName = db.manuals[manualIdx].fileName;
    db.manuals.splice(manualIdx, 1);
    saveDB(db);
    return fileName;
  }
  return null;
}

// ----------------------------------------------------
// 의미 QA 캐싱 API
// ----------------------------------------------------

export function saveQACache(
  query: string,
  vector: number[],
  answer: string,
  citations: Array<{ source: string; page: number }>,
  nextSteps: string[],
  status: string
) {
  const db = initDB();
  
  // 중복 캐시 질문 방지 (완전히 동일한 질문이 있다면 최신으로 갱신)
  const existingIdx = db.qa_cache.findIndex((item) => item.query === query);
  
  const cacheItem: QACacheItem = {
    query,
    vector,
    answer,
    citations,
    nextSteps,
    status,
    createdAt: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    db.qa_cache[existingIdx] = cacheItem;
  } else {
    db.qa_cache.push(cacheItem);
  }

  // 너무 비대해지는 것을 방지하기 위해 최대 200개까지만 캐시 보존 (FIFO)
  if (db.qa_cache.length > 200) {
    db.qa_cache.shift();
  }

  saveDB(db);
}

export function getCachedResponse(
  queryVector: number[],
  threshold = 0.95
): Omit<QACacheItem, "vector"> | null {
  const db = initDB();
  let bestMatch: QACacheItem | null = null;
  let bestSimilarity = -1;

  for (const item of db.qa_cache) {
    const similarity = calculateCosineSimilarity(queryVector, item.vector);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = item;
    }
  }

  // 기준 임계치 이상 매치되는 경우 캐시 히트(Cache Hit) 판정
  if (bestMatch && bestSimilarity >= threshold) {
    console.log(`[QA Cache Hit] 의미 유사도 매칭 성공! 점수: ${bestSimilarity.toFixed(4)} (임계치: ${threshold})`);
    const { vector, ...rest } = bestMatch;
    return rest;
  }

  return null;
}

// 캐시를 전체 지우고 싶을 때 사용
export function clearQACache() {
  const db = initDB();
  db.qa_cache = [];
  saveDB(db);
}
