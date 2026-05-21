/**
 * 외부 LLM API 전송 시 개인정보 및 핵심 기술 기밀 데이터가 무단 유출되지 않도록 필터링 및 마스킹합니다.
 */
export function filterSensitiveData(text: string): string {
  if (!text) return "";

  let filtered = text;

  // 1. 개인정보 필터링 (정규식 기반)
  // - 주민등록번호 패턴 (XXXXXX-XXXXXXX)
  const juminRegex = /\b\d{6}[-.\s]?[1-4]\d{6}\b/g;
  filtered = filtered.replace(juminRegex, "[PERSONAL_ID_MASKED]");

  // - 휴대전화번호 및 일반 전화번호 패턴 (010-XXXX-XXXX 등)
  const phoneRegex = /\b(01[016789]|02|0[3-9]\d{1})[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g;
  filtered = filtered.replace(phoneRegex, "[PHONE_MASKED]");

  // - 이메일 주소 패턴
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  filtered = filtered.replace(emailRegex, "[EMAIL_MASKED]");

  // 2. 사내 기밀 키워드 마스킹
  // 기획서 상의 "기밀 정보 필터링 정책" 시연을 위해, 데모용 기밀 단어 리스트를 마스킹 처리합니다.
  const confidentialKeywords = ["비밀코드", "대외비코드", "SuperSecretKey", "마스터패스워드"];
  for (const keyword of confidentialKeywords) {
    const regex = new RegExp(keyword, "gi");
    filtered = filtered.replace(regex, "[CONFIDENTIAL_DATA_MASKED]");
  }

  // 필터링이 수행된 경우 로깅
  if (filtered !== text) {
    console.log(`[🛡️ Security Filter] 사용자 입력에서 민감 데이터가 감지되어 마스킹 처리되었습니다.`);
    console.log(`- 원본: "${text}"`);
    console.log(`- 마스킹 결과: "${filtered}"`);
  }

  return filtered;
}
