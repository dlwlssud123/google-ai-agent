"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const features = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    title: "즉각적인 장애 조치",
    desc: "에러 코드 하나만 입력하면 수백 페이지 매뉴얼을 실시간 탐색해 단계별 조치 절차를 즉시 반환합니다.",
    color: "indigo",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    title: "매뉴얼 기반 RAG",
    desc: "ChromaDB 벡터 저장소에 사내 PDF를 적재하면, AI가 해당 문서 범위 내에서만 엄격하게 답변합니다.",
    color: "violet",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    title: "시멘틱 유사도 검색",
    desc: "Gemini Embedding으로 생성된 의미 벡터를 Cosine 유사도로 검색해 정확한 문맥의 근거를 인용합니다.",
    color: "sky",
  },
];

const steps = [
  {
    num: "01",
    title: "매뉴얼 PDF 업로드",
    desc: "사내 장비 매뉴얼 PDF를 업로드하면 Gemini Embedding API가 자동으로 벡터화하여 ChromaDB에 적재합니다.",
    icon: "📄",
  },
  {
    num: "02",
    title: "증상 또는 에러코드 질의",
    desc: "현장에서 발생한 이상 증상이나 에러코드를 자연어로 입력합니다. 복잡한 쿼리 문법 없이 대화하듯 질문하면 됩니다.",
    icon: "💬",
  },
  {
    num: "03",
    title: "출처 인용 답변 수신",
    desc: "Gemini 2.5가 관련 매뉴얼 페이지를 정확히 인용하며 단계별 조치 절차를 생성합니다. 원본 PDF 뷰어로 근거를 즉시 확인할 수 있습니다.",
    icon: "⚡",
  },
];

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % features.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 font-sans antialiased overflow-x-hidden">

      {/* ── 네비게이션 바 ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-900">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-600/40">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-sm font-bold text-white tracking-wide">UnHarnesedYU</span>
        </div>
        <Link
          href="/chat"
          id="nav-cta-btn"
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all duration-200 shadow-lg shadow-indigo-600/30 hover:shadow-indigo-500/40 hover:-translate-y-0.5"
        >
          채팅 시작
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>
      </nav>

      {/* ── HERO 섹션 ── */}
      <section className="relative flex flex-col items-center justify-center min-h-screen px-6 text-center pt-20 overflow-hidden">

        {/* 배경 글로우 */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-1/2 left-1/4 w-[300px] h-[300px] bg-violet-600/8 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute top-1/2 right-1/4 w-[300px] h-[300px] bg-sky-600/8 rounded-full blur-[80px] pointer-events-none" />

        {/* 상단 뱃지 */}
        <div
          className={`inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 text-xs font-bold px-4 py-1.5 rounded-full mb-8 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          Powered by Gemini 2.5 · ChromaDB RAG
        </div>

        {/* 메인 타이틀 */}
        <h1
          className={`text-4xl sm:text-5xl md:text-6xl font-black text-white leading-tight tracking-tight mb-6 transition-all duration-700 delay-100 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        >
          설비 장애를
          <br />
          <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-sky-400 bg-clip-text text-transparent">
            30초 안에 해결하세요
          </span>
        </h1>

        {/* 서브 타이틀 */}
        <p
          className={`text-sm sm:text-base text-zinc-400 max-w-xl leading-relaxed mb-10 transition-all duration-700 delay-200 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        >
          사내 매뉴얼 PDF를 업로드하면, 현장 에러코드 하나만으로{" "}
          <span className="text-zinc-200 font-semibold">정확한 조치 절차</span>를 실시간으로 생성합니다.
          <br />
          Fail-safe 안전 제어 내장, 출처 페이지 인용으로 신뢰성을 보장합니다.
        </p>

        {/* CTA 버튼 */}
        <div
          className={`flex flex-col sm:flex-row items-center gap-3 transition-all duration-700 delay-300 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        >
          <Link
            href="/chat"
            id="hero-cta-btn"
            className="group flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-7 py-3.5 rounded-2xl transition-all duration-200 shadow-xl shadow-indigo-600/30 hover:shadow-indigo-500/40 hover:-translate-y-1 text-sm"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            채팅 시작하기
            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
            <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            별도 설치 없이 바로 사용
          </div>
        </div>

        {/* 스크롤 인디케이터 */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 animate-bounce opacity-40">
          <span className="text-[10px] text-zinc-500 font-medium tracking-wider uppercase">Scroll</span>
          <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </section>

      {/* ── FEATURES 섹션 ── */}
      <section id="features" className="px-6 py-24 max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest mb-3">핵심 기능</p>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            현장 엔지니어를 위한<br />AI 장애 조치 시스템
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {features.map((f, i) => {
            const colorMap: Record<string, string> = {
              indigo: "bg-indigo-500/10 border-indigo-500/20 text-indigo-400 group-hover:bg-indigo-500/20 group-hover:border-indigo-500/40",
              violet: "bg-violet-500/10 border-violet-500/20 text-violet-400 group-hover:bg-violet-500/20 group-hover:border-violet-500/40",
              sky: "bg-sky-500/10 border-sky-500/20 text-sky-400 group-hover:bg-sky-500/20 group-hover:border-sky-500/40",
            };
            const isActive = activeFeature === i;
            return (
              <div
                key={i}
                onMouseEnter={() => setActiveFeature(i)}
                className={`group relative flex flex-col gap-4 p-6 rounded-2xl border transition-all duration-300 cursor-default ${
                  isActive
                    ? "bg-zinc-900 border-zinc-700 shadow-xl shadow-black/20 -translate-y-1"
                    : "bg-zinc-900/40 border-zinc-800 hover:bg-zinc-900 hover:border-zinc-700"
                }`}
              >
                <div className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-all duration-300 ${colorMap[f.color]}`}>
                  {f.icon}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white mb-2">{f.title}</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">{f.desc}</p>
                </div>
                {isActive && (
                  <div className="absolute bottom-0 left-6 right-6 h-0.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-500 rounded-full" />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── HOW IT WORKS 섹션 ── */}
      <section id="how-it-works" className="px-6 py-24 bg-zinc-900/30 border-y border-zinc-900">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest mb-3">사용 방법</p>
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              3단계로 즉시 시작
            </h2>
          </div>

          <div className="flex flex-col gap-6">
            {steps.map((step, i) => (
              <div
                key={i}
                className="group flex items-start gap-6 p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 transition-all duration-300 hover:-translate-y-0.5"
              >
                {/* 번호 */}
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <div className="w-12 h-12 rounded-xl bg-indigo-600/10 border border-indigo-500/25 flex items-center justify-center text-xl">
                    {step.icon}
                  </div>
                  {i < steps.length - 1 && (
                    <div className="w-0.5 h-6 bg-zinc-800 group-hover:bg-indigo-500/30 transition-colors rounded-full" />
                  )}
                </div>
                {/* 내용 */}
                <div className="pt-1.5">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="text-[10px] font-black text-indigo-400 tracking-widest">{step.num}</span>
                    <h3 className="text-sm font-bold text-white">{step.title}</h3>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed max-w-xl">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA 섹션 ── */}
      <section className="px-6 py-28 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-indigo-950/20 to-transparent pointer-events-none" />
        <div className="relative max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[11px] font-bold px-3 py-1 rounded-full mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            현장 에이전트 활성 중
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-5 leading-tight">
            지금 바로
            <br />
            <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
              시작해 보세요
            </span>
          </h2>
          <p className="text-sm text-zinc-400 mb-10 leading-relaxed">
            PDF 업로드부터 첫 번째 장애 조치 답변까지,<br />
            단 3분이면 충분합니다.
          </p>
          <Link
            href="/chat"
            id="bottom-cta-btn"
            className="group inline-flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-8 py-4 rounded-2xl transition-all duration-200 shadow-2xl shadow-indigo-600/40 hover:shadow-indigo-500/50 hover:-translate-y-1 text-sm"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            채팅 시작하기
            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ── 푸터 ── */}
      <footer className="border-t border-zinc-900 px-6 py-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-xs font-bold text-zinc-400">UnHarnesedYU</span>
        </div>
        <p className="text-[11px] text-zinc-600">© 2026 UnHarnesedYU. All Rights Reserved.</p>
        <p className="text-[10px] text-zinc-700 mt-1">설비 다운타임 최소화 워크플로우 RAG 엔진</p>
      </footer>

    </main>
  );
}
