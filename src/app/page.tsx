"use client";

import { useState, useRef, useEffect } from "react";
import { askAgent, ChatMessage, ChatResponse } from "./actions/chat";

export default function Home() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [responses, setResponses] = useState<Record<number, ChatResponse>>({});
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 스크롤 동기화
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // 빠른 시작(Quick Starter) 질문 모음
  const quickQuestions = [
    {
      label: "🎯 RAG 검색 정확도 목표",
      text: "RAG 검색 정확도 정량적 목표가 무엇인가요?"
    },
    {
      label: "📅 애자일 추진 일정",
      text: "2단계 애자일 스프린트 추진 일정"
    },
    {
      label: "🛡️ AI 할루시네이션 방지",
      text: "AI 할루시네이션 가드레일 설계 원칙"
    },
    {
      label: "⚠️ 무관한 에러 검증 (Fail-safe)",
      text: "공장 모터 실린더 윤활유 과열 현상 어떻게 처리하나요?"
    }
  ];

  // AI 질의 수행 함수
  const handleSend = async (textToSend: string) => {
    if (!textToSend || !textToSend.trim() || loading) return;

    const userText = textToSend.trim();
    setQuery("");

    // 1. 작업자 메시지 즉시 렌더링 추가
    const newHistory: ChatMessage[] = [...messages, { role: "user", content: userText }];
    setMessages(newHistory);
    setLoading(true);

    try {
      // 2. Server Action 호출 (RAG + Gemini 2.5)
      const res = await askAgent(userText, messages);

      // 3. 답변 및 이력 기록 저장
      setMessages((prev) => [...prev, { role: "assistant", content: res.answer }]);
      setResponses((prev) => ({
        ...prev,
        [newHistory.length]: res
      }));
    } catch (e) {
      console.error(e);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "장애 조치 AI 에이전트와 통신하는 도중 오류가 발생했습니다. 환경설정 또는 API 키 상태를 확인하십시오."
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  // 인용구 포맷팅 보조 헬퍼
  const formatCitation = (citation: { source: string; page: number }) => {
    const baseName = citation.source.split(/[\\/]/).pop() || citation.source;
    return `${baseName} (p.${citation.page})`;
  };

  // 마크다운 파싱 렌더러
  const renderMarkdown = (text: string) => {
    return text.split("\n").map((line, idx) => {
      const trimmed = line.trim();

      // 1. 단계별 숫자 리스트
      const numListMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
      if (numListMatch) {
        const num = numListMatch[1];
        const content = numListMatch[2];
        return (
          <div key={idx} className="flex gap-3 my-3 items-start pl-1">
            <span className="flex items-center justify-center bg-indigo-500/20 text-indigo-300 font-bold rounded-lg w-6 h-6 text-sm shrink-0 border border-indigo-500/30 shadow-inner">
              {num}
            </span>
            <span className="text-zinc-200 leading-relaxed font-medium">
              {parseBold(content)}
            </span>
          </div>
        );
      }

      // 2. 글머리 불릿 리스트
      if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
        const content = trimmed.substring(2);
        return (
          <div key={idx} className="flex gap-2.5 my-2 items-start pl-7">
            <span className="w-1.5 h-1.5 bg-indigo-400/70 rounded-full shrink-0 mt-2.5"></span>
            <span className="text-zinc-300 leading-relaxed">
              {parseBold(content)}
            </span>
          </div>
        );
      }

      // 빈 라인 처리
      if (!trimmed) return <div key={idx} className="h-2"></div>;

      return (
        <p key={idx} className="text-zinc-300 my-1.5 leading-relaxed pl-1">
          {parseBold(line)}
        </p>
      );
    });
  };

  const parseBold = (text: string) => {
    const parts = text.split(/\*\*([^*]+)\*\*/g);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        // WARNING, 경고 구문 감지하여 초고휘도 경고 스타일 반영
        if (part.includes("경고") || part.includes("WARNING") || part.includes("fail-safe")) {
          return (
            <strong
              key={i}
              className="text-rose-400 font-extrabold bg-rose-500/15 px-1.5 py-0.5 rounded border border-rose-500/30 mx-0.5 animate-pulse inline-block"
            >
              ⚠️ {part}
            </strong>
          );
        }
        return (
          <strong key={i} className="text-indigo-300 font-bold mx-0.5">
            {part}
          </strong>
        );
      }
      return part;
    });
  };

  return (
    <div className="flex h-screen w-full bg-zinc-950 text-zinc-100 overflow-hidden font-sans antialiased">
      {/* 1. 사이드바 - 등록 매뉴얼 및 시스템 상태 모니터링 */}
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-50 w-72 bg-zinc-900 border-r border-zinc-800 p-5 transition-transform duration-300 lg:relative lg:translate-x-0 flex flex-col shrink-0`}
      >
        <div className="flex items-center justify-between pb-5 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">UnHarnesedYU</h2>
              <span className="text-[10px] text-zinc-400 font-semibold tracking-wider uppercase">RAG AI Agent</span>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 rounded hover:bg-zinc-800">
            <svg className="w-6 h-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 연동 데이터 정보 */}
        <div className="mt-6 flex-1 space-y-6 overflow-y-auto pr-1">
          <div>
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">연동 및 적재된 매뉴얼 (RAG)</h3>
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 space-y-3">
              <div className="flex items-start gap-2.5">
                <span className="text-xl">📄</span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-zinc-200 truncate">UnHarenesedYU_이진녕_7614_A안.pdf</p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">총 7개 페이지 완벽 파싱 및 임베딩 완료</p>
                </div>
              </div>
              <div className="h-px bg-zinc-800"></div>
              <div className="flex justify-between items-center text-[10px] font-semibold text-zinc-400">
                <span>데이터 컬렉션</span>
                <span className="bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded text-indigo-400">equipment_manuals</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">시스템 정보</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center bg-zinc-950/50 px-3.5 py-2.5 rounded-xl border border-zinc-900 text-xs">
                <span className="text-zinc-400 font-medium">LLM 엔진</span>
                <span className="text-zinc-200 font-bold">Gemini 2.5 Flash</span>
              </div>
              <div className="flex justify-between items-center bg-zinc-950/50 px-3.5 py-2.5 rounded-xl border border-zinc-900 text-xs">
                <span className="text-zinc-400 font-medium">Embedding 모델</span>
                <span className="text-zinc-200 font-bold text-[10px] text-indigo-300">gemini-embedding-2</span>
              </div>
              <div className="flex justify-between items-center bg-zinc-950/50 px-3.5 py-2.5 rounded-xl border border-zinc-900 text-xs">
                <span className="text-zinc-400 font-medium">Vector DB</span>
                <span className="text-zinc-200 font-bold">ChromaDB Local</span>
              </div>
              <div className="flex justify-between items-center bg-zinc-950/50 px-3.5 py-2.5 rounded-xl border border-zinc-900 text-xs">
                <span className="text-zinc-400 font-medium">가드레일 상태</span>
                <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
                  Active (엄격)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 풋터 영역 */}
        <div className="pt-4 border-t border-zinc-800 text-[10px] text-zinc-500 text-center font-medium">
          <p>© 2026 UnHarnesedYU. All Rights Reserved.</p>
          <p className="mt-0.5">설비 다운타임 최소화 워크플로우 엔진</p>
        </div>
      </aside>

      {/* 모바일 사이드바 Backdrop */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-40 bg-black/60 lg:hidden"></div>
      )}

      {/* 2. 메인 컨텐츠 영역 */}
      <div className="flex flex-1 flex-col h-full bg-zinc-950 overflow-hidden relative">
        {/* 상단 헤더 바 */}
        <header className="flex h-16 items-center justify-between border-b border-zinc-900 bg-zinc-950/70 backdrop-blur-md px-4 sm:px-6 shrink-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800"
            >
              <svg className="w-5 h-5 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div>
              <h1 className="text-sm sm:text-base font-bold text-white">RAG 장애 조치 지원 에이전트</h1>
              <p className="text-[10px] sm:text-xs text-zinc-400">오직 사내 매뉴얼에 명시된 엄격한 조치 절차만을 안내합니다.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 text-zinc-300 text-[11px] font-bold px-3 py-1.5 rounded-xl">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              현장 에이전트 활성
            </span>
          </div>
        </header>

        {/* 대화 피드 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center max-w-lg mx-auto text-center space-y-6 my-10">
              <div className="w-16 h-16 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-3xl flex items-center justify-center shadow-inner animate-pulse">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>

              <div>
                <h3 className="text-lg font-bold text-white">현장 장애 증상 검색 및 조치 RAG</h3>
                <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                  설비 에러 코드, 알람 내용, 혹은 동작 이상 등의 증상을 하단에 검색해 주십시오.<br />
                  ChromaDB에 등록된 사내 매뉴얼에 기반하여 엄격한 가이드라인을 단계별로 생성합니다.
                </p>
              </div>

              {/* 빠른 질문 */}
              <div className="w-full space-y-2">
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider text-left pl-1">
                  💡 추천 테스트 시나리오
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {quickQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(q.text)}
                      className="text-left bg-zinc-900/60 border border-zinc-800/80 hover:bg-zinc-800/70 hover:border-zinc-700 p-3 rounded-xl transition-all duration-200 group"
                    >
                      <p className="text-[11px] font-extrabold text-indigo-300 group-hover:text-indigo-200">
                        {q.label}
                      </p>
                      <p className="text-[10px] text-zinc-400 truncate mt-0.5">
                        {q.text}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg, index) => {
                const isUser = msg.role === "user";
                const responseData = responses[index];

                return (
                  <div key={index} className={`flex flex-col ${isUser ? "items-end" : "items-start"} w-full`}>
                    {/* 발신자 태그 */}
                    <span className="text-[10px] text-zinc-500 font-extrabold tracking-wider uppercase mb-1.5 px-1.5">
                      {isUser ? "🚨 작업자" : "⚡ 에이전트"}
                    </span>

                    {/* 말풍선 */}
                    <div
                      className={`relative max-w-[90%] sm:max-w-[85%] rounded-2xl p-4 shadow-xl border ${
                        isUser
                          ? "bg-zinc-800 border-zinc-700 text-zinc-100 rounded-tr-none"
                          : responseData?.status === "fail-safe"
                          ? "bg-rose-950/20 border-rose-500/30 text-zinc-200 rounded-tl-none"
                          : "bg-zinc-900 border-zinc-800 text-zinc-200 rounded-tl-none"
                      }`}
                    >
                      {/* 상태 뱃지 (AI 응답인 경우만) */}
                      {!isUser && responseData && (
                        <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800/50">
                          <span
                            className={`flex items-center gap-1.5 text-[10px] font-extrabold px-2.5 py-1 rounded-full border ${
                              responseData.status === "success"
                                ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                                : "bg-rose-500/10 border-rose-500/25 text-rose-400 animate-pulse"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                responseData.status === "success" ? "bg-emerald-400" : "bg-rose-400"
                              }`}
                            ></span>
                            {responseData.status === "success" ? "절차 매칭 성공" : "Fail-safe 안전 제어 작동"}
                          </span>
                        </div>
                      )}

                      {/* 본문 텍스트 */}
                      <div className="text-sm font-medium space-y-1.5">
                        {isUser ? <p className="leading-relaxed">{msg.content}</p> : renderMarkdown(msg.content)}
                      </div>

                      {/* 출처 표시 영역 */}
                      {!isUser && responseData?.citations && responseData.citations.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-zinc-800/50">
                          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-2">
                            📖 매뉴얼 근거 및 출처 페이지
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {responseData.citations.map((cite, cIdx) => (
                              <span
                                key={cIdx}
                                className="inline-flex items-center gap-1 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-[10px] text-indigo-300 font-semibold px-2 py-1 rounded-lg transition-colors cursor-default"
                              >
                                📄 {formatCitation(cite)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* AI 에이전트의 추천 다음단계 흐름 (워크플로우 제어 단추) */}
                    {!isUser && responseData?.nextSteps && responseData.nextSteps.length > 0 && (
                      <div className="mt-3 pl-3 w-full max-w-[85%]">
                        <p className="text-[9px] text-zinc-500 font-extrabold uppercase tracking-widest mb-1.5">
                          ➡ 다음 추천 점검 항목 (워크플로우)
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {responseData.nextSteps.map((step, sIdx) => (
                            <button
                              key={sIdx}
                              onClick={() => handleSend(step)}
                              className="text-left text-[11px] font-bold text-zinc-300 bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 hover:bg-indigo-950/20 px-3 py-1.5 rounded-xl transition-all duration-200 shadow-sm"
                            >
                              {step}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* 로딩 표시기 */}
              {loading && (
                <div className="flex flex-col items-start w-full">
                  <span className="text-[10px] text-zinc-500 font-extrabold tracking-wider uppercase mb-1.5 px-1.5 animate-pulse">
                    ⚡ 에이전트 분석 중...
                  </span>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-tl-none p-4 w-52 flex items-center justify-center shadow-xl">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* 3. 하단 질의 입력 폼 */}
        <div className="p-4 sm:p-5 bg-zinc-950 border-t border-zinc-900 shrink-0 z-20">
          <div className="max-w-3xl mx-auto relative">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend(query);
              }}
              className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-1.5 focus-within:border-indigo-600/60 focus-within:ring-1 focus-within:ring-indigo-600/30 transition-all duration-200"
            >
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={loading}
                placeholder={
                  loading
                    ? "장애 매뉴얼을 탐색하는 중입니다..."
                    : "장애 에러코드 혹은 이상 증상을 입력하십시오..."
                }
                className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 px-3 py-2.5 focus:outline-none disabled:opacity-50"
              />

              <button
                type="submit"
                disabled={!query.trim() || loading}
                className="flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 text-white disabled:text-zinc-600 transition-all duration-200 shrink-0 shadow-lg shadow-indigo-600/20"
              >
                {loading ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                ) : (
                  <svg className="w-5 h-5 transform rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </form>
            <div className="flex justify-between items-center text-[10px] text-zinc-500 mt-2 px-1 font-semibold">
              <span>⚠️ 최종 책임은 실제 기기 유지보수 작업자 본인에게 있습니다. (Human-in-the-loop)</span>
              <span>v1.0.0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
