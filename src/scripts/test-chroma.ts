import { getOrCreateManualCollection, addDocumentsToVectorDB, querySimilarityFromVectorDB, clearManualCollection } from "../lib/chroma";

async function main() {
  console.log("=== ChromaDB 연동 및 동작 테스트 시작 ===");
  
  try {
    // 1. 기존 컬렉션 정리 (테스트용)
    await clearManualCollection();

    // 2. 컬렉션 생성 확인
    console.log("1. 컬렉션 생성/가져오기 시도...");
    const collection = await getOrCreateManualCollection();
    console.log("컬렉션 객체 획득 성공:", collection.name);

    // 3. 테스트 데이터 임베딩 벡터 가상 생성 (예: 3차원 벡터)
    // 실제 임베딩 모델은 보통 768차원 또는 1536차원이나, 연동 테스트를 위해 임의의 3차원 벡터 사용
    console.log("2. 테스트 데이터 준비 및 적재...");
    const dummyDocs = [
      {
        id: "doc1",
        vector: [0.1, 0.2, 0.9],
        text: "설비 A의 메인 모터 과열 시 냉각수 밸브를 즉시 개방하고, 온도를 50도 이하로 유지하십시오.",
        metadata: { source: "motor_manual.pdf", page: 12 }
      },
      {
        id: "doc2",
        vector: [0.9, 0.1, 0.1],
        text: "전원 차단 스위치는 설비 우측 하단의 빨간색 비상 정지 버튼 바로 옆에 위치해 있습니다.",
        metadata: { source: "safety_guide.pdf", page: 5 }
      },
      {
        id: "doc3",
        vector: [0.15, 0.25, 0.85],
        text: "모터 과열 경고등(적색)이 점멸할 경우, 즉시 가동을 중단하고 수동 냉각 모드로 전환하십시오.",
        metadata: { source: "motor_manual.pdf", page: 13 }
      }
    ];

    await addDocumentsToVectorDB(dummyDocs);
    console.log("데이터 적재 완료!");

    // 4. 유사도 검색 테스트
    // 쿼리 벡터: [0.1, 0.2, 0.8] (과열 및 냉각 관련인 doc1, doc3과 유사할 것으로 예상)
    console.log("3. 유사도 검색 테스트 진행...");
    const queryVector = [0.1, 0.2, 0.8];
    const searchResults = await querySimilarityFromVectorDB(queryVector, 2);

    console.log("\n--- 검색 결과 (유사도 Top 2) ---");
    searchResults.forEach((res, idx) => {
      console.log(`[순위 ${idx + 1}] ID: ${res.id}, 유사도 거리: ${res.distance}`);
      console.log(`- 내용: ${res.document}`);
      console.log(`- 출처: ${res.metadata?.source} (페이지: ${res.metadata?.page})`);
      console.log("--------------------------------");
    });

    console.log("=== ChromaDB 연동 및 동작 테스트 성공 ===");
  } catch (error) {
    console.error("ChromaDB 테스트 진행 중 오류 발생:", error);
    process.exit(1);
  }
}

main();
