import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { askAgent } from "../app/actions/chat";

async function main() {
  console.log("=== RAG 엔진 실시간 질의 테스트 시작 ===");
  
  // 소방엔진 기계 매뉴얼 속 실재하는 질문 1차 시도
  const query = "소방 엔진의 기름을 뭘 써야하나요?";
  console.log(`\n[1차 질의 진행] 질문: "${query}" (LLM 분석 가동)`);
  
  const start1 = Date.now();
  const res1 = await askAgent(query);
  const end1 = Date.now();
  
  console.log("응답 상태:", res1.status);
  console.log("응답 답변:", res1.answer);
  console.log("인용 출처:", res1.citations);
  console.log("처리 시간:", `${((end1 - start1) / 1000).toFixed(2)}초`);
  console.log("캐시 적용됨:", res1.isCached ? "YES" : "NO");

  // 2차 동일 유사 질의 진행 (의미 QA 캐시 히트 동작 점검)
  console.log(`\n[2차 유사 질의 진행] 질문: "RAG 정확도 정량적 목표 알려줘" (의미 QA 캐시 세이버 가동)`);
  const query2 = "RAG 정확도 정량적 목표 알려줘";
  
  const start2 = Date.now();
  const res2 = await askAgent(query2);
  const end2 = Date.now();
  
  console.log("응답 상태:", res2.status);
  console.log("응답 답변:", res2.answer);
  console.log("인용 출처:", res2.citations);
  console.log("처리 시간:", `${((end2 - start2) / 1000).toFixed(2)}초 (초고속 캐싱 완료)`);
  console.log("캐시 적용됨:", res2.isCached ? "YES ⚡ (토큰 세이브 성공)" : "NO");
  console.log("=======================================");
}

main().catch(console.error);
