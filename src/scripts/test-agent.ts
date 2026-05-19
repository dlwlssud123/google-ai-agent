import dotenv from "dotenv";
import path from "path";
import { askAgent } from "../app/actions/chat";

// .env.local 환경 변수 로드
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function testAgent() {
  console.log("=== RAG 장애 조치 AI 에이전트 통합 테스트 시작 ===");

  const queries = [
    "RAG 검색 정확도 정량적 목표가 무엇인가요?", // 매뉴얼에 명백히 있는 내용 (성공 케이스)
    "전자레인지에서 이상한 소리가 납니다. 어떻게 고치나요?", // 매뉴얼에 절대 없는 내용 (Fail-safe 케이스)
    "소방엔진의 엔진오일(기름) 점검 및 교환 방법은 무엇인가요?", // 소방엔진 기름 관련 질의 1
    "소방엔진의 연료나 윤활유(기름) 관련 규격과 주의사항은 무엇인가요?" // 소방엔진 기름 관련 질의 2
  ];

  for (const query of queries) {
    console.log(`\n----------------------------------------`);
    console.log(`사용자 검색/질의: "${query}"`);
    console.log(`----------------------------------------`);

    try {
      const response = await askAgent(query, []);
      console.log(`상태(status): ${response.status}`);
      console.log(`답변(answer):\n${response.answer}`);
      console.log(`인용출처(citations):`, JSON.stringify(response.citations));
      console.log(`추천 다음단계(nextSteps):`, JSON.stringify(response.nextSteps));
    } catch (e) {
      console.error("테스트 중 예상치 못한 에러 발생:", e);
    }
  }

  console.log("\n=== RAG 장애 조치 AI 에이전트 통합 테스트 종료 ===");
}

testAgent();
