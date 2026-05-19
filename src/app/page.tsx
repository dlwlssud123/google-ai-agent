"use client";

import { useState, useRef, useEffect } from "react";
import { askAgent, ChatMessage, ChatResponse } from "./actions/chat";
import { 
  uploadAndIngestFileAction, 
  getUploadedFilesAction, 
  deleteManualAction,
  forceRunIngestionAction 
} from "./actions/ingestActions";

export interface ManualFile {
  id: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  status: "pending" | "success" | "failed";
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [responses, setResponses] = useState<Record<number, ChatResponse>>({});
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 파일 업로드 및 실시간 RAG 적재 상태 관리
  const [manualFiles, setManualFiles] = useState<ManualFile[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionStage, setActionStage] = useState<"idle" | "uploading" | "ingesting" | "success" | "error">("idle");
  const [actionMessage, setActionMessage] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 스크롤 동기화
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // 마운트 시 실시간 적재된 파일 목록 조회
  useEffect(() => {
    fetchUploadedFiles();
  }, []);

  const fetchUploadedFiles = async () => {
    try {
      const res = await getUploadedFilesAction();
      if (res.success && res.files) {
        setManualFiles(res.files as ManualFile[]);
      }
    } catch (e) {
      console.error("파일 목록 패치 실패:", e);
    }
  };

  // 파일 업로드 및 실시간 임베딩 핸들러
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setActionLoading(true);
    setActionStage("uploading");
    setActionMessage(`'${file.name}' 업로드 파일 처리 중...`);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // 1단계: 파일 전송 및 백엔드 즉각 임베딩 트리거
      setActionStage("ingesting");
      setActionMessage("Gemini 임베딩 변환 및 ChromaDB 실시간 적재 중...");
      
      const res = await uploadAndIngestFileAction(formData);

      if (res.success) {
        setActionStage("success");
        setActionMessage(res.message || "성공적으로 적재 완료!");
        setTimeout(() => setActionStage("idle"), 4000);
      } else {
        setActionStage("error");
        setActionMessage(res.message || "적재 실패");
      }
    } catch (err: any) {
      setActionStage("error");
      setActionMessage(`처리 오류: ${err.message || err}`);
    } finally {
      setActionLoading(false);
      fetchUploadedFiles();
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 특정 파일 영구 삭제 핸들러
  const handleFileDelete = async (id: string, name: string) => {
    if (!confirm(`'${name}' 매뉴얼을 로컬 디스크 및 ChromaDB 벡터 저장소에서 완벽히 영구 삭제하시겠습니까?`)) {
      return;
    }

    setActionLoading(true);
    setActionStage("ingesting");
    setActionMessage(`'${name}' 연관 임베딩 삭제 중...`);

    try {
      const res = await deleteManualAction(id);
      if (res.success) {
        setActionStage("success");
        setActionMessage(res.message || "삭제 성공");
        setTimeout(() => setActionStage("idle"), 3000);
      } else {
        setActionStage("error");
        setActionMessage(res.message || "삭제 실패");
      }
    } catch (err: any) {
      setActionStage("error");
      setActionMessage(`삭제 중 오류: ${err.message || err}`);
    } finally {
      setActionLoading(false);
      fetchUploadedFiles();
    }
  };

  // 데이터베이스 인제스천 초기화 강제 갱신 핸들러
  const handleForceRebuild = async () => {
    if (!confirm("ChromaDB 컬렉션을 완전히 비운 후 data/ 디렉터리 내의 모든 파일로 처음부터 임베딩을 다시 빌드하시겠습니까?\n(수 분 가량 소요될 수 있습니다)")) {
      return;
    }

    setActionLoading(true);
    setActionStage("ingesting");
    setActionMessage("벡터 컬렉션 클리어 및 전체 매뉴얼 재임베딩 생성 중...");

    try {
      const res = await forceRunIngestionAction();
      if (res.success) {
        setActionStage("success");
        setActionMessage(res.message || "전체 재임베딩 완료!");
        setTimeout(() => setActionStage("idle"), 4000);
      } else {
        setActionStage("error");
        setActionMessage(res.message || "재임베딩 실패");
      }
    } catch (err: any) {
      setActionStage("error");
      setActionMessage(`동작 실패: ${err.message || err}`);
    } finally {
      setActionLoading(false);
      fetchUploadedFiles();
    }
  };

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

  // 파일 사이즈 사람이 읽기 좋은 포맷
  const formatBytes = (bytes: number, decimals = 1) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
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
        if (part.includes("경고") || part.includes("WARNING") || part.includes("fail-safe") || part.includes("금하며") || part.includes("격리")) {
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
        } fixed inset-y-0 left-0 z-50 w-80 bg-zinc-900 border-r border-zinc-800 p-5 transition-transform duration-300 lg:relative lg:translate-x-0 flex flex-col shrink-0`}
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">UnHarnesedYU</h2>
              <span className="text-[10px] text-indigo-400 font-semibold tracking-wider uppercase">RAG Control Center</span>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 rounded hover:bg-zinc-800">
            <svg className="w-6 h-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 연동 데이터 정보 & 실시간 업로드 컴포넌트 */}
        <div className="mt-5 flex-1 space-y-5 overflow-y-auto pr-1">
          {/* 매뉴얼 적재 리스트 (동적 연동) */}
          <div>
            <div className="flex justify-between items-center mb-2.5">
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">연동 및 적재 매뉴얼 ({manualFiles.length})</h3>
              <button 
                onClick={handleForceRebuild}
                disabled={actionLoading}
                className="text-[9px] font-bold text-zinc-400 bg-zinc-850 hover:bg-zinc-800 hover:text-indigo-400 px-1.5 py-0.5 rounded border border-zinc-800 transition-colors disabled:opacity-50"
                title="데이터베이스 전체 재임베딩 강제 실행"
              >
                🔄 전체 갱신
              </button>
            </div>
            
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
              {manualFiles.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-[10px] text-zinc-500 font-medium">연동된 매뉴얼 파일이 없습니다.</p>
                  <p className="text-[9px] text-zinc-600 mt-0.5">아래 드롭존에서 PDF를 업로드하세요.</p>
                </div>
              ) : (
                manualFiles.map((file) => (
                  <div key={file.id} className="flex justify-between items-start gap-2 bg-zinc-900/40 p-2 rounded-lg border border-zinc-900/80 hover:border-zinc-850 transition-colors group">
                    <div className="flex gap-2 min-w-0">
                      <span className="text-sm shrink-0">📄</span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-zinc-200 truncate" title={file.fileName}>
                          {file.fileName}
                        </p>
                        <p className="text-[9px] text-zinc-500 mt-0.5 flex items-center gap-1.5">
                          <span>{formatBytes(file.fileSize)}</span>
                          <span>•</span>
                          <span className={file.status === "success" ? "text-emerald-400 font-bold" : file.status === "pending" ? "text-amber-400 animate-pulse" : "text-rose-400"}>
                            {file.status === "success" ? "적재완료" : file.status === "pending" ? "임베딩중" : "실패"}
                          </span>
                        </p>
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => handleFileDelete(file.id, file.fileName)}
                      disabled={actionLoading}
                      className="text-zinc-500 hover:text-rose-400 p-1 opacity-0 group-hover:opacity-100 transition-all rounded hover:bg-zinc-800 shrink-0"
                      title="ChromaDB 및 디스크에서 즉시 영구 삭제"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Premium Glassmorphic Upload Dropzone */}
          <div>
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2.5">신규 매뉴얼 파일 추가</h3>
            <div className="relative border border-dashed border-zinc-800 rounded-xl bg-zinc-950/40 p-4 transition-all hover:bg-zinc-950/60 hover:border-indigo-500/50 flex flex-col items-center justify-center text-center">
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileUpload}
                disabled={actionLoading}
                accept=".pdf,image/*"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
              />
              <div className="w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-2 shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <p className="text-[11px] font-bold text-zinc-300">이곳에 PDF 마우스 드래그 또는 클릭</p>
              <p className="text-[9px] text-zinc-500 mt-1">파일 업로드 즉시 백그라운드에서 임베딩 적재가 시작됩니다.</p>
            </div>
          </div>

          {/* 실시간 프로그레스 피드백 */}
          {actionStage !== "idle" && (
            <div className={`border rounded-xl p-3 text-xs ${
              actionStage === "success" 
                ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-300"
                : actionStage === "error"
                ? "bg-rose-950/20 border-rose-500/30 text-rose-300"
                : "bg-indigo-950/10 border-indigo-500/30 text-zinc-200"
            }`}>
              <div className="flex items-center gap-2">
                {(actionStage === "uploading" || actionStage === "ingesting") && (
                  <svg className="w-3.5 h-3.5 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                {actionStage === "success" && <span className="text-emerald-400 text-sm">✓</span>}
                {actionStage === "error" && <span className="text-rose-400 text-sm">⚠</span>}
                <span className="font-bold text-[10px] uppercase tracking-wider">
                  {actionStage === "uploading" && "1단계: 업로드"}
                  {actionStage === "ingesting" && "2단계: DB 적재중"}
                  {actionStage === "success" && "완료"}
                  {actionStage === "error" && "오류 발생"}
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 mt-1 leading-relaxed">{actionMessage}</p>
            </div>
          )}

          {/* 시스템 정보 */}
          <div>
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2.5">시스템 정보</h3>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center bg-zinc-950/40 px-3 py-2 rounded-lg border border-zinc-900 text-[11px]">
                <span className="text-zinc-500 font-medium">LLM 엔진</span>
                <span className="text-zinc-300 font-bold">Gemini 2.5 Flash</span>
              </div>
              <div className="flex justify-between items-center bg-zinc-950/40 px-3 py-2 rounded-lg border border-zinc-900 text-[11px]">
                <span className="text-zinc-500 font-medium">Embedding 모델</span>
                <span className="text-indigo-400 font-bold text-[10px]">gemini-embedding-2</span>
              </div>
              <div className="flex justify-between items-center bg-zinc-950/40 px-3 py-2 rounded-lg border border-zinc-900 text-[11px]">
                <span className="text-zinc-500 font-medium">Vector DB</span>
                <span className="text-zinc-300 font-bold">ChromaDB Local</span>
              </div>
              <div className="flex justify-between items-center bg-zinc-950/40 px-3 py-2 rounded-lg border border-zinc-900 text-[11px]">
                <span className="text-zinc-500 font-medium">가드레일 모드</span>
                <span className="flex items-center gap-1.5 text-emerald-400 font-extrabold text-[10px]">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
                  Active (엄격)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 풋터 영역 */}
        <div className="pt-3 border-t border-zinc-800 text-[9px] text-zinc-500 text-center font-medium">
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
              <h1 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                RAG 장애 조치 지원 에이전트
                <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20 font-extrabold uppercase tracking-wide">
                  Quota Optimized
                </span>
              </h1>
              <p className="text-[10px] sm:text-xs text-zinc-400">오직 사내 매뉴얼(data/)에 명시된 엄격한 조치 절차만을 안내합니다.</p>
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
                      {/* 상태 뱃지 및 캐시 뱃지 (AI 응답인 경우만) */}
                      {!isUser && responseData && (
                        <div className="flex items-center justify-between gap-4 pb-3 mb-3 border-b border-zinc-800/50">
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

                          {/* ⚡ 의미 QA 캐시 히트 성공시 표시되는 고휘도 테두리 뱃지 */}
                          {responseData.isCached && (
                            <span className="flex items-center gap-1 text-[10px] font-black text-amber-300 bg-amber-500/15 border border-amber-400/30 px-2 py-0.5 rounded-full shadow-[0_0_12px_rgba(245,158,11,0.2)] animate-bounce shrink-0 select-none">
                              ⚡ QA 캐시 적용됨
                            </span>
                          )}
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
