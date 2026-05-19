"use server";

import fs from "fs";
import path from "path";
import { addManual, getManuals, deleteManual, clearAllData } from "@/lib/db";
import { runIngestion } from "@/scripts/ingest";
import { deleteDocumentsFromVectorDB, clearManualCollection } from "@/lib/chroma";

/**
 * 웹 프론트엔드로부터 파일을 받아 data/ 디렉터리에 저장한 뒤 실시간 RAG 임베딩(인제스천)을 트리거합니다.
 */
export async function uploadAndIngestFileAction(formData: FormData) {
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
    addManual(file.name, file.size);
    console.log(`[Web Upload] 파일 디스크 저장 완료: ${file.name} (${file.size} bytes)`);

    // 2. 실시간 인제스천 수행 (clearDB: false로 설정하여 기존 벡터 DB를 보존하고 누적 적재)
    const result = await runIngestion({ clearDB: false });
    
    return { 
      success: true, 
      message: `매뉴얼 '${file.name}' 업로드 및 RAG 적재 성공! (총 ${result.count}개 청크 반영)` 
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
    await deleteDocumentsFromVectorDB(fileName);

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
    const result = await runIngestion({ clearDB: true });
    return { success: true, message: `인제스천 초기화 갱신 성공! (총 ${result.count}개 청크 재적재)` };
  } catch (error) {
    return { success: false, message: `인제스천 갱신 실패: ${(error as any).message || error}` };
  }
}

/**
 * ChromaDB의 모든 컬렉션 데이터를 지우고, 로컬 저장된 모든 PDF 파일 및 DB 메타데이터/캐시를 완전히 삭제하여 
 * RAG 시스템을 공장 초기화 상태로 되돌립니다.
 */
export async function clearAllEmbeddingsAction() {
  try {
    // 1. ChromaDB의 매뉴얼 컬렉션 영구 삭제
    await clearManualCollection();
    console.log("[Web ClearAll] ChromaDB 컬렉션 삭제 완료");

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

    return { success: true, message: "모든 임베딩 데이터와 원본 파일, 질문 캐시가 완전히 삭제되었습니다." };
  } catch (error) {
    console.error("[Web ClearAll Error] 전체 초기화 실패:", error);
    return { success: false, message: `초기화 실패: ${(error as any).message || error}` };
  }
}
