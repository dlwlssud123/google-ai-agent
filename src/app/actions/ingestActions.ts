"use server";

import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { addManual, getManuals, deleteManual, clearAllData, updateManualStatus, updateSessionManuals, getSessions } from "@/lib/db";
import { deleteDocumentsFromVectorDB, clearManualCollection } from "@/lib/chroma";

const execPromise = promisify(exec);

/**
 * 웹 프론트엔드로부터 파일을 받아 data/ 디렉터리에 저장한 뒤 실시간 RAG 임베딩(인제스천)을 트리거합니다.
 * @param sessionId 업로드 후 자동으로 연결할 세션 ID
 */
export async function uploadAndIngestFileAction(formData: FormData, sessionId?: string) {
  try {
    const file = formData.get("file") as File;
    if (!file) {
      return { success: false, message: "업로드된 파일이 없습니다." };
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const dataDir = path.resolve(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const filePath = path.join(dataDir, file.name);
    fs.writeFileSync(filePath, buffer);

    // 1. DB에 pending 상태로 파일 메타데이터 등록
    const newManual = addManual(file.name, file.size);
    console.log(`[Web Upload] 파일 디스크 저장 완료: ${file.name} (${file.size} bytes)`);

    // 2. 세션에 파일 연결 (업로드한 세션의 manualIds에 자동 추가)
    if (sessionId) {
      const sessions = getSessions();
      const session = sessions.find(s => s.id === sessionId);
      if (session) {
        const currentIds = session.manualIds || [];
        if (!currentIds.includes(newManual.id)) {
          updateSessionManuals(sessionId, [...currentIds, newManual.id]);
          console.log(`[Web Upload] 세션(${sessionId})에 파일(${newManual.id}) 연결 완료`);
        }
      }
    }

    // 3. 실시간 인제스천을 백그라운드 프로세스로 비차단(non-blocking) 실행
    // Next.js SSR Webpack 번들 내 pdfjs-dist worker 임포트 문제를 우회하기 위해 CLI 프로세스 격리 실행
    const command = `npx tsx src/scripts/ingest.ts --clearDB=false --file="${file.name}"`;
    console.log(`[Web Upload] 백그라운드 CLI 프로세스로 개별 파일 인제스천 가동: ${command}`);
    
    // exec 에 콜백만 등록하고 비동기적으로 바로 반환
    exec(command, { env: process.env }, (error, stdout, stderr) => {
      console.log("[CLI Ingest Background Process Finished]");
      if (stdout) console.log("[CLI Ingest Output]", stdout);
      if (stderr) console.warn("[CLI Ingest Warning]", stderr);
      if (error) {
        console.error("[CLI Ingest Error]", error);
        // 에러 발생 시 해당 매뉴얼 상태를 실패로 변경
        const safeId = file.name.replace(/[^a-zA-Z0-9가-힣]/g, "_");
        updateManualStatus(safeId, "failed");
      }
    });
    
    return { 
      success: true, 
      message: `매뉴얼 '${file.name}' 업로드 성공! 백그라운드에서 실시간 RAG DB 적재가 시작되었습니다. (완료 시 목록의 상태가 적재완료로 바뀝니다.)` 
    };
  } catch (error) {
    console.error("[Web Ingest Error] 파일 실시간 적재 실패:", error);
    return { success: false, message: `적재 실패: ${(error as any).message || error}` };
  }
}

/**
 * 로컬 데이터베이스 db.json에 등록되어 있는 실제 갱신 파일 목록을 반환합니다.
 */
export async function getUploadedFilesAction() {
  try {
    const files = getManuals();
    return { success: true, files };
  } catch (error) {
    return { success: false, files: [], message: (error as any).message };
  }
}

/**
 * 특정 매뉴얼을 로컬 디스크, db.json, 그리고 ChromaDB 벡터 임베딩 저장소에서 동시 영구 삭제합니다.
 */
export async function deleteManualAction(id: string) {
  try {
    // 1. DB에서 파일 정보 삭제 및 실제 파일명 획득
    const fileName = deleteManual(id);
    if (!fileName) {
      return { success: false, message: "삭제 대상 파일을 DB에서 찾을 수 없습니다." };
    }

    // 2. data/ 폴더에서 실제 파일 제거
    const filePath = path.join(path.resolve(process.cwd(), "data"), fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[Web Delete] 디스크 파일 삭제 완료: ${fileName}`);
    }

    // 3. ChromaDB에서 해당 소스 파일과 매칭되는 모든 임베딩 청크 제거 (멱등성 확보)
    try {
      await deleteDocumentsFromVectorDB(fileName);
    } catch (chromaError) {
      console.warn(`[Web Delete Warning] ChromaDB 청크 삭제 실패 (로컬 DB/디스크는 정상 삭제됨):`, chromaError);
      return { 
        success: true, 
        message: `'${fileName}' 매뉴얼이 디스크 및 로컬 DB에서 제거되었으나, ChromaDB 연동 실패로 일부 청크가 남아있을 수 있습니다. (ChromaDB 데몬 상태를 확인하세요)` 
      };
    }

    return { success: true, message: `'${fileName}' 매뉴얼이 디렉터리 및 ChromaDB에서 완벽하게 제거되었습니다.` };
  } catch (error) {
    console.error("[Web Delete Error] 파일 및 벡터 청크 삭제 실패:", error);
    return { success: false, message: `삭제 실패: ${(error as any).message || error}` };
  }
}

/**
 * ChromaDB 컬렉션을 완전히 비운 뒤, data/ 하위 모든 파일에 대해 인제스천을 처음부터 강제 재실행합니다.
 */
export async function forceRunIngestionAction() {
  try {
    const command = `npx tsx src/scripts/ingest.ts --clearDB=true`;
    console.log(`[Web Rebuild] 백그라운드 CLI 프로세스로 전체 인제스천 가동: ${command}`);
    
    // 전체 리셋 시작 전 모든 매뉴얼 상태를 pending으로 일시 지정
    const files = getManuals();
    for (const f of files) {
      updateManualStatus(f.id, "pending");
    }

    exec(command, { env: process.env }, (error, stdout, stderr) => {
      console.log("[CLI Rebuild Background Process Finished]");
      if (stdout) console.log("[CLI Rebuild Output]", stdout);
      if (stderr) console.warn("[CLI Rebuild Warning]", stderr);
      if (error) {
        console.error("[CLI Rebuild Error]", error);
        // 에러 발생 시 대기 중인 모든 매뉴얼의 상태를 실패로 변경
        const filesAfterError = getManuals();
        for (const f of filesAfterError) {
          if (f.status === "pending") {
            updateManualStatus(f.id, "failed");
          }
        }
      }
    });
    
    return { success: true, message: "백그라운드에서 전체 인제스천 초기화 및 재빌드가 기동되었습니다." };
  } catch (error) {
    return { success: false, message: `인제스천 갱신 실패: ${(error as any).message || error}` };
  }
}

/**
 * ChromaDB의 모든 컬렉션 데이터를 지우고, 로컬 저장된 모든 PDF 파일 및 DB 메타데이터/캐시를 완전히 삭제하여 
 * RAG 시스템을 공장 초기화 상태로 되돌립니다.
 */
export async function clearAllEmbeddingsAction() {
  let chromaSuccess = true;
  let chromaErrorMessage = "";

  try {
    // 1. ChromaDB의 매뉴얼 컬렉션 영구 삭제
    try {
      await clearManualCollection();
      console.log("[Web ClearAll] ChromaDB 컬렉션 삭제 완료");
    } catch (chromaError) {
      chromaSuccess = false;
      chromaErrorMessage = (chromaError as any).message || String(chromaError);
      console.warn("[Web ClearAll Warning] ChromaDB 컬렉션 삭제 중 오류 발생:", chromaError);
    }

    // 2. data/ 폴더 안의 db.json을 제외한 모든 실제 파일들 삭제
    const dataDir = path.resolve(process.cwd(), "data");
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir);
      for (const file of files) {
        if (file !== "db.json") {
          const filePath = path.join(dataDir, file);
          if (fs.statSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
            console.log(`[Web ClearAll] 디스크 파일 삭제 완료: ${file}`);
          }
        }
      }
    }

    // 3. db.json 내의 manuals 및 qa_cache 데이터를 완전히 리셋
    clearAllData();
    console.log("[Web ClearAll] local db.json 데이터 초기화 완료");

    if (!chromaSuccess) {
      return { 
        success: true, 
        message: `디스크 파일과 로컬 DB는 완전히 초기화되었으나, ChromaDB 컬렉션 삭제에 실패했습니다: ${chromaErrorMessage} (ChromaDB 데몬 상태를 확인하세요)` 
      };
    }

    return { success: true, message: "모든 임베딩 데이터와 원본 파일, 질문 캐시가 완전히 삭제되었습니다." };
  } catch (error) {
    console.error("[Web ClearAll Error] 전체 초기화 실패:", error);
    return { success: false, message: `초기화 실패: ${(error as any).message || error}` };
  }
}
