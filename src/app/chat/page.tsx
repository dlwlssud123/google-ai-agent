"use client";

import Link from "next/link";

import { useState, useRef, useEffect } from "react";
import { askAgent, submitFeedbackAction } from "../actions/chat";
import { 
  uploadAndIngestFileAction, 
  getUploadedFilesAction, 
  deleteManualAction,
  forceRunIngestionAction,
  clearAllEmbeddingsAction
} from "../actions/ingestActions";
import {
  getSessionsAction,
  createSessionAction,
  updateSessionMessagesAction,
  deleteSessionAction,
  updateSessionTitleAction,
  updateSessionManualsAction
} from "../actions/sessionActions";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  status?: "success" | "fail-safe";
  citations?: { source: string; page: number }[];
  nextSteps?: string[];
  isCached?: boolean;
}

export interface ManualFile {
  id: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  status: "pending" | "success" | "failed";
}

interface ChatSessionView {
  id: string;
  title: string;
  messages: ChatMessage[];
  manualIds: string[];
  createdAt: string;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 멀티 세션 상태 관리
  const [sessions, setSessions] = useState<ChatSessionView[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // 파일 업로드 및 실시간 RAG 적재 상태 관리
  const [manualFiles, setManualFiles] = useState<ManualFile[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionStage, setActionStage] = useState<"idle" | "uploading" | "ingesting" | "success" | "error">("idle");
  const [actionMessage, setActionMessage] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 새 채팅방 생성 모달 상태
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState("");
  const [selectedManualIds, setSelectedManualIds] = useState<string[]>([]);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState("");
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);

  // 파일 연결 관리 미니 모달 상태
  const [showFileModal, setShowFileModal] = useState(false);

  // PDF 뷰어 모달 상태
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfFileName, setPdfFileName] = useState("");
  const [pdfPage, setPdfPage] = useState<number | null>(null);

  // 피드백 완료 토스트 메시지 상태
  const [feedbackToast, setFeedbackToast] = useState<{ show: boolean; message: string }>({ show: false, message: "" });

  // 멀티모달 데모 이미지 상태
  const [demoImageUrl, setDemoImageUrl] = useState<string | null>(null);
  const [showMultimodalGuide, setShowMultimodalGuide] = useState(false);

  // 피드백 제출 핸들러
  const handleFeedback = async (queryText: string, answerText: string, rating: "helpful" | "unhelpful") => {
    try {
      const res = await submitFeedbackAction(queryText, answerText, rating);
      if (res.success) {
        setFeedbackToast({
          show: true,
          message: rating === "helpful" 
            ? "👍 도움이 되었다고 평가해 주셨습니다. (RAG 검색 우선순위에 반영됩니다)" 
            : "👎 도움이 되지 않았다고 평가해 주셨습니다."
        });
        setTimeout(() => {
          setFeedbackToast({ show: false, message: "" });
        }, 3500);
      } else {
        alert(res.message);
      }
    } catch (err) {
      console.error("피드백 전송 실패:", err);
    }
  };

  // PDF 뷰어 열기 핸들러
  const handleOpenPdf = (source: string, page: number) => {
    const baseName = source.split(/[\\\/]/).pop() || source;
    setPdfFileName(baseName);
    setPdfPage(page);
    setShowPdfModal(true);
  };

  // 스크롤 동기화
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

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

  const fetchSessions = async (targetSessionId: string | null = null) => {
    try {
      const res = await getSessionsAction();
      if (res.success && res.sessions) {
        const loadedSessions = res.sessions as ChatSessionView[];
        setSessions(loadedSessions);
        
        // 만약 세션 목록이 비어 있으면, 기본 세션을 하나 자동 생성
        if (loadedSessions.length === 0) {
          const createRes = await createSessionAction("새로운 대화");
          if (createRes.success && createRes.session) {
            setSessions([createRes.session]);
            setCurrentSessionId(createRes.session.id);
            setMessages([]);
          }
        } else {
          // targetSessionId 가 전달되면 해당 세션을 사용하고, 없으면 현재 선택된 세션이나 첫 번째 세션 사용
          const nextSessionId = targetSessionId || currentSessionId || loadedSessions[0].id;
          
          // 해당 세션이 실제로 존재하는지 체크
          const exist = loadedSessions.find((s) => s.id === nextSessionId);
          if (exist) {
            setCurrentSessionId(nextSessionId);
            setMessages(exist.messages || []);
          } else {
            setCurrentSessionId(loadedSessions[0].id);
            setMessages(loadedSessions[0].messages || []);
          }
        }
      }
    } catch (e) {
      console.error("세션 목록 로드 실패:", e);
    }
  };

  // 마운트 시 실시간 적재된 파일 목록 및 세션 로드
  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchUploadedFiles();
      fetchSessions();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  // pending 상태의 파일이 하나라도 있다면 백그라운드 인제스천 실시간 감지를 위해 4초 간격으로 폴링 수행
  useEffect(() => {
    const hasPending = manualFiles.some(file => file.status === "pending");
    if (!hasPending) return;

    const interval = setInterval(() => {
      fetchUploadedFiles();
    }, 4000);

    return () => clearInterval(interval);
  }, [manualFiles]);

  // 특정 세션 선택 핸들러
  const handleSelectSession = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      setMessages(session.messages || []);
    }
  };

  // 신규 세션 생성 핸들러 (모달 방식)
  const handleOpenNewSession = () => {
    setNewSessionTitle("");
    setSelectedManualIds([]);
    setShowNewSessionModal(true);
  };

  const handleConfirmNewSession = async () => {
    try {
      const title = newSessionTitle.trim() || "새로운 대화";
      const res = await createSessionAction(title, selectedManualIds);
      if (res.success && res.session) {
        setSessions((prev) => [...prev, res.session]);
        setCurrentSessionId(res.session.id);
        setMessages([]);
      }
    } catch (e) {
      console.error("신규 세션 생성 실패:", e);
    } finally {
      setShowNewSessionModal(false);
    }
  };

  const handleStartRenameSession = (session: ChatSessionView, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditingSessionTitle(session.title || "");
  };

  const handleCancelRenameSession = (e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    setEditingSessionId(null);
    setEditingSessionTitle("");
  };

  const handleRenameSession = async (sessionId: string, e?: React.SyntheticEvent) => {
    e?.preventDefault();
    e?.stopPropagation();

    const title = editingSessionTitle.trim();
    if (!title) {
      alert("대화방 이름을 입력해 주세요.");
      return;
    }

    setRenamingSessionId(sessionId);
    try {
      const res = await updateSessionTitleAction(sessionId, title);
      if (res.success && res.session) {
        setSessions((prev) => prev.map((session) => (session.id === sessionId ? res.session : session)));
        setEditingSessionId(null);
        setEditingSessionTitle("");
      } else {
        alert(res.message || "대화방 이름을 저장하지 못했습니다.");
      }
    } catch (err) {
      console.error("세션 이름 수정 실패:", err);
      alert("대화방 이름을 저장하지 못했습니다.");
    } finally {
      setRenamingSessionId(null);
    }
  };

  // 현재 세션의 파일 연결 토글 핸들러
  const handleToggleManualForSession = async (manualId: string) => {
    if (!currentSessionId) return;
    const session = sessions.find(s => s.id === currentSessionId);
    if (!session) return;

    const current: string[] = session.manualIds || [];
    const updated = current.includes(manualId)
      ? current.filter((id: string) => id !== manualId)
      : [...current, manualId];

    await updateSessionManualsAction(currentSessionId, updated);
    // 로컬 세션 상태 즉시 동기화
    setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, manualIds: updated } : s));
  };

  // 현재 세션에 연결된 파일 목록 (파생)
  const currentSessionManualIds: string[] = sessions.find(s => s.id === currentSessionId)?.manualIds || [];

  // 세션 개별 삭제 핸들러
  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // 세션 선택 이벤트 전파 방지
    if (!confirm("이 대화방을 삭제하시겠습니까?")) return;

    try {
      const res = await deleteSessionAction(sessionId);
      if (res.success) {
        const updated = sessions.filter((s) => s.id !== sessionId);
        setSessions(updated);
        
        if (currentSessionId === sessionId) {
          if (updated.length > 0) {
            setCurrentSessionId(updated[0].id);
            setMessages(updated[0].messages || []);
          } else {
            // 남은 세션이 없으면 기본 새 대화방 자동 생성
            const createRes = await createSessionAction("새로운 대화");
            if (createRes.success && createRes.session) {
              setSessions([createRes.session]);
              setCurrentSessionId(createRes.session.id);
              setMessages([]);
            }
          }
        }
      }
    } catch (err) {
      console.error("세션 삭제 실패:", err);
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
      
      // 현재 세션 ID를 함꿭 전달 → 업로드 증했로드 세션에 자동 연결
      const res = await uploadAndIngestFileAction(formData, currentSessionId ?? undefined);

      if (res.success) {
        setActionStage("success");
        setActionMessage(res.message || "성공적으로 적재 완료!");
        setTimeout(() => setActionStage("idle"), 4000);
      } else {
        setActionStage("error");
        setActionMessage(res.message || "적재 실패");
      }
    } catch (err) {
      setActionStage("error");
      setActionMessage(`처리 오류: ${getErrorMessage(err)}`);
    } finally {
      setActionLoading(false);
      fetchUploadedFiles();
      // 업로드 완료 후 로컀 세션 상태도 즉시 갱신 (새 파일이 manualIds에 등록됴으므로)
      await fetchSessions(currentSessionId);
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
    } catch (err) {
      setActionStage("error");
      setActionMessage(`삭제 중 오류: ${getErrorMessage(err)}`);
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
    } catch (err) {
      setActionStage("error");
      setActionMessage(`동작 실패: ${getErrorMessage(err)}`);
    } finally {
      setActionLoading(false);
      fetchUploadedFiles();
    }
  };

  // 전체 데이터 초기화 핸들러
  const handleClearAll = async () => {
    if (!confirm("주의: ChromaDB의 모든 임베딩, 로컬에 저장된 모든 매뉴얼 원본 PDF 및 질문 캐시를 완전히 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.")) {
      return;
    }

    setActionLoading(true);
    setActionStage("ingesting");
    setActionMessage("모든 매뉴얼 및 ChromaDB 임베딩, 캐시 삭제 중...");

    try {
      const res = await clearAllEmbeddingsAction();
      if (res.success) {
        setActionStage("success");
        setActionMessage(res.message || "전체 삭제 성공");
        setMessages([]); // 초기화 시 대화 이력도 비움
        await fetchSessions();
        setTimeout(() => setActionStage("idle"), 4000);
      } else {
        setActionStage("error");
        setActionMessage(res.message || "삭제 실패");
      }
    } catch (err) {
      setActionStage("error");
      setActionMessage(`초기화 오류: ${getErrorMessage(err)}`);
    } finally {
      setActionLoading(false);
      fetchUploadedFiles();
    }
  };

  // AI 질의 수행 함수
  const handleSend = async (textToSend: string) => {
    if (!textToSend || !textToSend.trim() || loading) return;

    const userText = textToSend.trim();
    setQuery("");

    // 1. 작업자 메시지 즉시 렌더링 추가
    const userMsg: ChatMessage = { role: "user", content: userText };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setLoading(true);

    // 임시로 세션에도 유저의 질문은 즉시 동기화해 둠 (유저의 대화 도중 새로고침 시 이탈 방지)
    if (currentSessionId) {
      await updateSessionMessagesAction(currentSessionId, newHistory);
    }

    try {
      // 2. Server Action 호출 (RAG + Gemini 2.5)
      // 이전 히스토리는 RAG 메타데이터를 제외한 순수 {role, content} 배열만 전달
      const cleanHistory = newHistory.map(({ role, content }) => ({ role, content }));
      const res = await askAgent(userText, cleanHistory.slice(0, -1), currentSessionId ?? undefined);

      // 3. 답변 및 이력 기록 저장
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: res.answer,
        status: res.status,
        citations: res.citations,
        nextSteps: res.nextSteps,
        isCached: res.isCached
      };
      
      const updatedMessages = [...newHistory, assistantMsg];
      setMessages(updatedMessages);
      
      if (currentSessionId) {
        await updateSessionMessagesAction(currentSessionId, updatedMessages);
        // 세션 목록 갱신 (첫 질문으로 방 타이틀이 바뀔 수 있으므로 패치하되 현재 활성 세션 유지)
        await fetchSessions(currentSessionId);
      }
    } catch (e) {
      console.error(e);
      const errorMsg: ChatMessage = {
        role: "assistant",
        content: "장애 조치 AI 에이전트와 통신하는 도중 오류가 발생했습니다. 환경설정 또는 API 키 상태를 확인하십시오."
      };
      const updatedMessages = [...newHistory, errorMsg];
      setMessages(updatedMessages);
      
      if (currentSessionId) {
        await updateSessionMessagesAction(currentSessionId, updatedMessages);
      }
    } finally {
      setLoading(false);
    }
  };

  // 인용구 포맷팅 보조 헬퍼
  const formatCitation = (citation: { source: string; page: number }) => {
    const baseName = citation.source.split(/[\\\/]/).pop() || citation.source;
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

      {/* ─── 새 채팅방 생성 모달 ─── */}
      {showNewSessionModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white">새 채팅방 만들기</h2>
                <p className="text-[11px] text-zinc-400 mt-1">사용할 매뉴얼을 선택하면 해당 파일 범위 내에서만 RAG 검색합니다.</p>
              </div>
              <button
                onClick={() => setShowNewSessionModal(false)}
                className="text-zinc-500 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800 transition-all shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 채팅방 이름 입력 */}
            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">채팅방 이름 (선택)</label>
              <input
                type="text"
                value={newSessionTitle}
                onChange={e => setNewSessionTitle(e.target.value)}
                placeholder="새로운 대화"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500/60"
              />
            </div>

            {/* 매뉴얼 파일 선택 */}
            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">
                사용할 매뉴얼 선택 ({selectedManualIds.length}개 선택됨)
              </label>
              {manualFiles.length === 0 ? (
                <div className="text-center py-6 bg-zinc-800/50 rounded-xl border border-zinc-700">
                  <p className="text-[11px] text-zinc-500">업로드된 매뉴얼이 없습니다.</p>
                  <p className="text-[10px] text-zinc-600 mt-1">채팅방 생성 후 파일을 업로드할 수 있습니다.</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                  {manualFiles.map(file => {
                    const checked = selectedManualIds.includes(file.id);
                    return (
                      <label
                        key={file.id}
                        className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                          checked
                            ? "bg-indigo-950/30 border-indigo-500/40"
                            : "bg-zinc-800/50 border-zinc-700/50 hover:border-zinc-600"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setSelectedManualIds(prev =>
                            prev.includes(file.id)
                              ? prev.filter(id => id !== file.id)
                              : [...prev, file.id]
                          )}
                          className="accent-indigo-500 w-3.5 h-3.5 shrink-0"
                        />
                        <span className="text-sm shrink-0">{file.fileName.match(/\.(jpg|jpeg|png|gif)$/i) ? "🖼️" : "📄"}</span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-zinc-200 truncate">{file.fileName}</p>
                          <p className="text-[9px] text-zinc-500">{formatBytes(file.fileSize)}</p>
                        </div>
                        {checked && <span className="ml-auto text-[10px] text-indigo-400 font-bold shrink-0">✔</span>}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowNewSessionModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-all"
              >
                취소
              </button>
              <button
                onClick={handleConfirmNewSession}
                className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white transition-all shadow-lg shadow-indigo-600/20"
              >
                대화 시작
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 파일 연결 관리 모달 (기존 세션용) ─── */}
      {showFileModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white">파일 연결 관리</h2>
                <p className="text-[11px] text-zinc-400 mt-1">현재 채팅방에서 RAG 검색에 사용할 파일을 선택하세요.</p>
              </div>
              <button
                onClick={() => setShowFileModal(false)}
                className="text-zinc-500 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800 transition-all shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar pr-1">
              {manualFiles.map(file => {
                const isLinked = currentSessionManualIds.includes(file.id);
                return (
                  <label
                    key={file.id}
                    className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      isLinked
                        ? "bg-indigo-950/30 border-indigo-500/40"
                        : "bg-zinc-800/50 border-zinc-700/50 hover:border-zinc-600"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isLinked}
                      onChange={() => handleToggleManualForSession(file.id)}
                      className="accent-indigo-500 w-3.5 h-3.5 shrink-0"
                    />
                    <span className="text-sm shrink-0">{file.fileName.match(/\.(jpg|jpeg|png|gif)$/i) ? "🖼️" : "📄"}</span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-zinc-200 truncate">{file.fileName}</p>
                      <p className="text-[9px] text-zinc-500">{formatBytes(file.fileSize)}</p>
                    </div>
                    {isLinked && <span className="ml-auto text-[10px] text-indigo-400 font-bold shrink-0">✔ 연결됨</span>}
                  </label>
                );
              })}
            </div>
            <button
              onClick={() => setShowFileModal(false)}
              className="w-full px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white transition-all"
            >
              완료
            </button>
          </div>
        </div>
      )}

      {/* 1. 사이드바 - 등록 매뉴얼 및 시스템 상태 모니터링 */}
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-50 w-80 bg-zinc-900 border-r border-zinc-800 p-5 transition-transform duration-300 lg:relative lg:translate-x-0 flex flex-col shrink-0`}
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <Link href="/" className="flex items-center gap-2.5 group" title="홈으로 이동">
            <div className="w-9 h-9 bg-indigo-600 group-hover:bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/30 transition-colors">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide group-hover:text-indigo-300 transition-colors">UnHarnesedYU</h2>
              <span className="text-[10px] text-indigo-400 font-semibold tracking-wider uppercase">RAG Control Center</span>
            </div>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 rounded hover:bg-zinc-800">
            <svg className="w-6 h-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 연동 데이터 정보 & 실시간 업로드 컴포넌트 */}
        <div className="mt-5 flex-1 space-y-5 overflow-y-auto pr-1 flex flex-col min-h-0">
          {/* 채팅방 세션 목록 영역 */}
          <div className="flex flex-col min-h-0 shrink-0">
            <div className="flex justify-between items-center mb-2.5">
              <h3 className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">채팅 대화방</h3>
              <button 
                onClick={handleOpenNewSession}
                className="text-[9px] font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-2 py-0.5 rounded border border-indigo-500/30 transition-all flex items-center gap-1 shadow-sm"
              >
                <span>+</span> 새 대화
              </button>
            </div>
            
            <div className="overflow-y-auto custom-scrollbar space-y-1.5 pr-1 max-h-40 bg-zinc-950/40 border border-zinc-900 rounded-xl p-2">
              {sessions.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-[10px] text-zinc-500 font-medium">생성된 대화방이 없습니다.</p>
                </div>
              ) : (
                sessions.map((session) => {
                  const isActive = session.id === currentSessionId;
                  const isEditing = session.id === editingSessionId;
                  const isRenaming = session.id === renamingSessionId;
                  return (
                    <div 
                      key={session.id} 
                      onClick={isEditing ? undefined : () => handleSelectSession(session.id)}
                      className={`flex justify-between items-center gap-2 px-3 py-1.5 rounded-lg transition-all border group ${
                        isActive 
                          ? "bg-indigo-600/10 border-indigo-500/30 text-zinc-100 shadow-inner" 
                          : "bg-transparent border-transparent hover:bg-zinc-900/30 hover:border-zinc-900 text-zinc-400 hover:text-zinc-200"
                      } ${isEditing ? "" : "cursor-pointer"}`}
                    >
                      {isEditing ? (
                        <form
                          onSubmit={(e) => handleRenameSession(session.id, e)}
                          onClick={(e) => e.stopPropagation()}
                          className="flex min-w-0 flex-1 items-center gap-1.5"
                        >
                          <input
                            type="text"
                            value={editingSessionTitle}
                            onChange={(e) => setEditingSessionTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") handleCancelRenameSession(e);
                            }}
                            disabled={isRenaming}
                            autoFocus
                            maxLength={60}
                            className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] font-medium text-zinc-100 outline-none transition focus:border-indigo-500 disabled:opacity-60"
                          />
                          <button
                            type="submit"
                            disabled={isRenaming}
                            className="rounded-md p-1 text-emerald-400 transition hover:bg-emerald-500/10 hover:text-emerald-300 disabled:opacity-50"
                            title="대화방 이름 저장"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelRenameSession}
                            disabled={isRenaming}
                            className="rounded-md p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
                            title="취소"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </form>
                      ) : (
                        <>
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="text-xs shrink-0">💬</span>
                            <span className="truncate text-[11px] font-medium" title={session.title}>
                              {session.title}
                            </span>
                          </div>

                          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-all group-hover:opacity-100">
                            <button
                              onClick={(e) => handleStartRenameSession(session, e)}
                              className="rounded p-0.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-indigo-300"
                              title="대화방 이름 수정"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 7.125L16.875 4.5" />
                              </svg>
                            </button>
                            <button 
                              onClick={(e) => handleDeleteSession(session.id, e)}
                              className="rounded p-0.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-rose-400"
                              title="이 대화방 삭제"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 매뉴얼 적재 리스트 (현재 세션 연결 상태 표시 + 토글) */}
          <div>
            <div className="flex justify-between items-center mb-2.5">
              <div>
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">연동 매뉴얼 ({currentSessionManualIds.length}/{manualFiles.length})</h3>
                <p className="text-[9px] text-zinc-600 mt-0.5">이 채팅방에서 검색할 파일</p>
              </div>
              <div className="flex gap-1.5">
                <button 
                  onClick={() => setShowFileModal(true)}
                  disabled={manualFiles.length === 0}
                  className="text-[9px] font-bold text-indigo-400 bg-zinc-850 hover:bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-800 transition-colors disabled:opacity-50"
                  title="전체 파일 연결 관리"
                >
                  관리
                </button>
                <button 
                  onClick={handleForceRebuild}
                  disabled={actionLoading}
                  className="text-[9px] font-bold text-zinc-400 bg-zinc-850 hover:bg-zinc-800 hover:text-indigo-400 px-1.5 py-0.5 rounded border border-zinc-800 transition-colors disabled:opacity-50"
                  title="데이터베이스 전체 재임베딩 강제 실행"
                >
                  🔄 갱신
                </button>
                <button 
                  onClick={handleClearAll}
                  disabled={actionLoading}
                  className="text-[9px] font-bold text-rose-400 bg-zinc-850 hover:bg-zinc-800 hover:text-rose-350 px-1.5 py-0.5 rounded border border-zinc-800 transition-colors disabled:opacity-50"
                  title="모든 임베딩 및 원본 파일, 질문 캐시 영구 제거"
                >
                  🗑️ 삭제
                </button>
              </div>
            </div>
            
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2 max-h-44 overflow-y-auto custom-scrollbar">
              {manualFiles.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-[10px] text-zinc-500 font-medium">연동된 매뉴얼 파일이 없습니다.</p>
                  <p className="text-[9px] text-zinc-600 mt-0.5">아래 드롭존에서 PDF를 업로드하세요.</p>
                </div>
              ) : (
                manualFiles.map((file) => {
                  const isLinked = currentSessionManualIds.includes(file.id);
                  return (
                    <div key={file.id} className={`flex justify-between items-start gap-2 p-2 rounded-lg border transition-colors group ${
                      isLinked
                        ? "bg-indigo-950/20 border-indigo-500/30"
                        : "bg-zinc-900/40 border-zinc-900/80 opacity-50"
                    }`}>
                      <div className="flex gap-2 min-w-0">
                        <span className="text-sm shrink-0">{file.fileName.match(/\.(jpg|jpeg|png|gif)$/i) ? "🖼️" : "📄"}</span>
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
                      
                      <div className="flex gap-1 shrink-0">
                        {/* 연결 토글 버튼 */}
                        <button
                          onClick={() => handleToggleManualForSession(file.id)}
                          title={isLinked ? "이 채팅방에서 제외" : "이 채팅방에 연결"}
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-all ${
                            isLinked
                              ? "text-indigo-300 border-indigo-500/40 hover:text-rose-400 hover:border-rose-500/40"
                              : "text-zinc-500 border-zinc-800 hover:text-indigo-400 hover:border-indigo-500/40"
                          }`}
                        >
                          {isLinked ? "✔ 연결" : "+ 추가"}
                        </button>
                        {/* 영구 삭제 버튼 */}
                        <button 
                          onClick={() => handleFileDelete(file.id, file.fileName)}
                          disabled={actionLoading}
                          className="text-zinc-500 hover:text-rose-400 p-1 opacity-40 hover:opacity-100 transition-all rounded hover:bg-zinc-800"
                          title="ChromaDB 및 디스크에서 즉시 영구 삭제"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })
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

        {/* ── 메시지 없을 때: ChatGPT 스타일 홈 화면 ── */}
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4 pb-8">
            {/* 모바일 사이드바 버튼 (헤더가 없으므로 별도 배치) */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden absolute top-4 left-4 p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800"
            >
              <svg className="w-5 h-5 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* 인사 텍스트 */}
            <div className="text-center mb-8">
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                무슨 장애가 발생했나요?
              </h1>
              <p className="text-sm text-zinc-500">
                에러 코드나 이상 증상을 입력하면 매뉴얼 기반으로 조치 절차를 안내합니다.
              </p>
            </div>

            {/* 입력창 - 가운데 배치 */}
            <div className="w-full max-w-2xl relative">
              {showMultimodalGuide && (
                <div className="absolute bottom-full mb-3 left-0 right-0 z-30 bg-zinc-900 border border-indigo-500/30 rounded-2xl p-4 shadow-2xl space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <span className="text-base">📸</span>
                      <h4 className="text-xs font-bold text-white">[로드맵] 멀티모달 비전 기반 장애 분석 기능 확장 안내</h4>
                    </div>
                    <span className="text-[10px] font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">Phase 2 준비중</span>
                  </div>
                  <p className="text-[11px] text-zinc-300 leading-relaxed">
                    현재 버전은 텍스트(에러코드) RAG 중심으로 조치 사항을 반환합니다. 향후 Phase 2 고도화 시, 작업자가 현장 계기판이나 기계 외관 사진을 촬영하여 전송하면 Gemini Vision 멀티모달 분석을 통해 외관 상태(누유, 크랙) 및 수치를 자동 판독하고 즉각 장애 원인을 추론하는 기술적 확장이 예정되어 있습니다.
                  </p>
                  {demoImageUrl && (
                    <div className="bg-indigo-950/20 rounded-xl p-3 border border-indigo-500/20 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-indigo-300">🖼️ 업로드된 현장 이미지</span>
                        <button onClick={() => setDemoImageUrl(null)} className="text-zinc-500 hover:text-zinc-300 text-[10px] cursor-pointer">지우기</button>
                      </div>
                      <div className="flex gap-3">
                        <img src={demoImageUrl} alt="Demo" className="w-20 h-20 object-cover rounded-lg border border-zinc-800 shrink-0" />
                        <div className="text-[10px] leading-relaxed text-zinc-300 space-y-1">
                          <p className="font-bold text-emerald-400">✓ [데모 분석 결과] 설비 식별 완료</p>
                          <p>• 이미지 형태 분석: 유압 조절 밸브 및 디지털 압력계 감지</p>
                          <p>• 계기판 수치 판독 (시뮬레이션): <strong>0.32 MPa</strong> (정상 범위 외 미달)</p>
                          <p>• 권고 조치: 에러코드 <strong>E-02</strong>에 준하는 오일 누유 여부 검사 요망</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <form
                onSubmit={(e) => { e.preventDefault(); handleSend(query); }}
                className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-2xl p-1.5 focus-within:border-indigo-600/60 focus-within:ring-1 focus-within:ring-indigo-600/30 transition-all duration-200 shadow-xl shadow-black/30"
              >
                <div className="relative shrink-0 pl-2">
                  <button
                    type="button"
                    onClick={() => setShowMultimodalGuide(!showMultimodalGuide)}
                    className={`flex items-center justify-center w-10 h-10 rounded-xl border transition-all duration-200 cursor-pointer ${
                      showMultimodalGuide
                        ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20"
                        : "bg-zinc-850 border-zinc-800 text-zinc-400 hover:text-zinc-250 hover:border-zinc-700"
                    }`}
                    title="멀티모달 카메라/사진 분석 안내"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                </div>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={loading}
                  placeholder="장애 에러코드 혹은 이상 증상을 입력하십시오..."
                  className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 px-3 py-3 focus:outline-none disabled:opacity-50"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!query.trim() || loading}
                  className="flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 text-white disabled:text-zinc-600 transition-all duration-200 shrink-0 shadow-lg shadow-indigo-600/20"
                >
                  <svg className="w-5 h-5 transform rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </form>

              {/* 빠른 예시 질문 */}
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {["E-01 에러 코드 조치 방법", "유압 펌프 압력 저하", "모터 과열 알람 원인", "냉각수 누수 점검"].map((suggest) => (
                  <button
                    key={suggest}
                    onClick={() => handleSend(suggest)}
                    className="text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 hover:text-zinc-200 px-3 py-1.5 rounded-xl transition-all duration-150"
                  >
                    {suggest}
                  </button>
                ))}
              </div>

              <p className="mt-5 text-center text-[10px] text-zinc-700 leading-relaxed px-2">
                ⚠️ 본 에이전트는 사내 매뉴얼에 기반한 참고 정보만을 제공합니다. 모든 최종 판단은 담당 전문가의 확인 하에 수행하십시오.
              </p>
            </div>
          </div>

        ) : (
          // ── 메시지 있을 때: 일반 채팅 레이아웃 ──
          <>
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


            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg, index) => {
                const isUser = msg.role === "user";
                const responseData = msg;

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
                            📖 매뉴얼 근거 및 출처 페이지 (클릭 시 해당 페이지 뷰어 팝업)
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {responseData.citations.map((cite, cIdx) => (
                              <button
                                key={cIdx}
                                onClick={() => handleOpenPdf(cite.source, cite.page)}
                                className="inline-flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 text-[10px] text-indigo-300 hover:text-indigo-200 font-semibold px-2.5 py-1.5 rounded-lg transition-all cursor-pointer shadow-sm"
                              >
                                📄 {formatCitation(cite)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 피드백 루프 버튼 영역 */}
                      {!isUser && (
                        <div className="mt-4 pt-3 border-t border-zinc-800/50 flex items-center justify-between gap-3 text-[10px] text-zinc-500">
                          <span className="font-medium">💡 이 해결책이 설비 조치에 도움이 되었나요?</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleFeedback(messages[index - 1]?.content || "", responseData.content, "helpful")}
                              className="inline-flex items-center gap-1 bg-zinc-950 border border-zinc-800 hover:border-emerald-500/40 hover:bg-emerald-950/10 text-[10px] text-zinc-300 hover:text-emerald-400 font-bold px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
                              title="도움됨"
                            >
                              👍 도움이 됨
                            </button>
                            <button
                              onClick={() => handleFeedback(messages[index - 1]?.content || "", responseData.content, "unhelpful")}
                              className="inline-flex items-center gap-1 bg-zinc-950 border border-zinc-800 hover:border-rose-500/40 hover:bg-rose-950/10 text-[10px] text-zinc-300 hover:text-rose-400 font-bold px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
                              title="도움안됨"
                            >
                              👎 도움이 안됨
                            </button>
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
            {/* 멀티모달 확장 로드맵 가이드 안내 UI */}
            {showMultimodalGuide && (
              <div className="absolute bottom-full mb-3 left-0 right-0 z-30 bg-zinc-900 border border-indigo-500/30 rounded-2xl p-4 shadow-2xl space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <span className="text-base">📸</span>
                    <h4 className="text-xs font-bold text-white">
                      [로드맵] 멀티모달 비전 기반 장애 분석 기능 확장 안내
                    </h4>
                  </div>
                  <span className="text-[10px] font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">
                    Phase 2 준비중
                  </span>
                </div>
                
                <p className="text-[11px] text-zinc-300 leading-relaxed">
                  현재 버전은 텍스트(에러코드) RAG 중심으로 조치 사항을 반환합니다. 
                  향후 **Phase 2 고도화** 시, 작업자가 현장 계기판이나 기계 외관 사진을 촬영하여 전송하면 
                  **Gemini Vision 멀티모달 분석**을 통해 외관 상태(누유, 크랙) 및 수치를 자동 판독하고 
                  즉각 장애 원인을 추론하는 기술적 확장이 예정되어 있습니다.
                </p>

                {/* 데모용 파일 업로드 컴포넌트 */}
                <div className="bg-zinc-950/60 rounded-xl p-3 border border-zinc-800/80 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-zinc-400">📷 비전 분석 데모 시연하기</p>
                    <p className="text-[9px] text-zinc-500 mt-0.5 truncate">현장 설비 사진을 업로드해 보세요 (미리보기 및 목업 분석 기능)</p>
                  </div>
                  <label className="bg-indigo-650 hover:bg-indigo-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg border border-indigo-500/20 cursor-pointer shrink-0 transition-colors">
                    사진 업로드
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = () => {
                            setDemoImageUrl(reader.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* 이미지 미리보기 및 시뮬레이션 결과 */}
                {demoImageUrl && (
                  <div className="bg-indigo-950/20 rounded-xl p-3 border border-indigo-500/20 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-indigo-300">🖼️ 업로드된 현장 이미지</span>
                      <button 
                        onClick={() => setDemoImageUrl(null)}
                        className="text-zinc-500 hover:text-zinc-300 text-[10px] cursor-pointer"
                      >
                        지우기
                      </button>
                    </div>
                    <div className="flex gap-3">
                      <img 
                        src={demoImageUrl} 
                        alt="Demo Target" 
                        className="w-20 h-20 object-cover rounded-lg border border-zinc-800 shrink-0" 
                      />
                      <div className="text-[10px] leading-relaxed text-zinc-300 space-y-1">
                        <p className="font-bold text-emerald-400">✓ [데모 분석 결과] 설비 식별 완료</p>
                        <p>• 이미지 형태 분석: 유압 조절 밸브 및 디지털 압력계 감지</p>
                        <p>• 계기판 수치 판독 (시뮬레이션): <strong>0.32 MPa</strong> (정상 범위 외 미달)</p>
                        <p>• 권고 조치: 에러코드 <strong>E-02</strong>에 준하는 오일 누유 여부 검사 요망</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend(query);
              }}
              className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-1.5 focus-within:border-indigo-600/60 focus-within:ring-1 focus-within:ring-indigo-600/30 transition-all duration-200"
            >
              {/* 멀티모달 카메라/사진 단추 */}
              <div className="relative shrink-0 pl-2">
                <button
                  type="button"
                  onClick={() => setShowMultimodalGuide(!showMultimodalGuide)}
                  className={`flex items-center justify-center w-10 h-10 rounded-xl border transition-all duration-200 cursor-pointer ${
                    showMultimodalGuide 
                      ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20" 
                      : "bg-zinc-850 border-zinc-800 text-zinc-400 hover:text-zinc-250 hover:border-zinc-700"
                  }`}
                  title="멀티모달 카메라/사진 분석 안내"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              </div>

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

            {/* 면책 고지 */}
            <p className="mt-3 text-center text-[10px] text-zinc-600 leading-relaxed px-2">
              ⚠️ 본 에이전트는 사내 매뉴얼에 기반한 참고 정보만을 제공하며, 실제 현장 조치에 대한 법적·기술적 책임을 지지 않습니다.
              모든 최종 판단 및 조치는 반드시 담당 전문가의 확인 하에 수행하십시오.
            </p>

          </div>
        </div>
          </>
        )}
      </div>

      {/* ─── 피드백 토스트 알림 ─── */}
      {feedbackToast.show && (
        <div className="fixed bottom-24 right-6 z-[100] bg-indigo-900 border border-indigo-500/40 text-indigo-100 rounded-xl px-4 py-3 shadow-2xl flex items-center gap-2 max-w-sm">
          <span className="text-base">✨</span>
          <p className="text-[11px] font-bold leading-relaxed">{feedbackToast.message}</p>
        </div>
      )}

      {/* ─── PDF 뷰어 모달 ─── */}
      {showPdfModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/90 shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">📄</span>
                <div>
                  <h2 className="text-sm font-bold text-white leading-none">{pdfFileName}</h2>
                  <p className="text-[10px] text-indigo-400 font-semibold mt-1">
                    매뉴얼 뷰어 {pdfPage ? `• p.${pdfPage} 바로 가기` : ""}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowPdfModal(false);
                  setPdfFileName("");
                  setPdfPage(null);
                }}
                className="text-zinc-400 hover:text-zinc-100 p-1.5 rounded-xl hover:bg-zinc-800 transition-all cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 bg-zinc-950 p-2 relative h-full">
              {pdfFileName ? (
                <iframe
                  src={`/api/pdf?file=${encodeURIComponent(pdfFileName)}${pdfPage ? `#page=${pdfPage}` : ""}`}
                  className="w-full h-full border-none rounded-xl bg-white"
                  title="PDF Manual Viewer"
                />
              ) : (
                <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
                  불러올 PDF 매뉴얼이 없습니다.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
