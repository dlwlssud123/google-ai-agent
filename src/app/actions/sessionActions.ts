"use server";

import { 
  getSessions, 
  createSession, 
  updateSessionMessages, 
  deleteSession,
  updateSessionManuals,
  updateSessionTitle
} from "@/lib/db";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function getSessionsAction() {
  try {
    const sessions = getSessions();
    return { success: true, sessions };
  } catch (error) {
    console.error("[Session Action] getSessionsAction 실패:", error);
    return { success: false, sessions: [], message: getErrorMessage(error) };
  }
}

export async function createSessionAction(title?: string, manualIds?: string[]) {
  try {
    const session = createSession(title, manualIds ?? []);
    return { success: true, session };
  } catch (error) {
    console.error("[Session Action] createSessionAction 실패:", error);
    return { success: false, message: getErrorMessage(error) };
  }
}

export async function updateSessionMessagesAction(id: string, messages: unknown[]) {
  try {
    updateSessionMessages(id, messages);
    return { success: true };
  } catch (error) {
    console.error("[Session Action] updateSessionMessagesAction 실패:", error);
    return { success: false, message: getErrorMessage(error) };
  }
}

export async function updateSessionTitleAction(id: string, title: string) {
  try {
    const session = updateSessionTitle(id, title);
    if (!session) {
      return { success: false, message: "대화방 이름을 저장할 수 없습니다." };
    }
    return { success: true, session };
  } catch (error) {
    console.error("[Session Action] updateSessionTitleAction 실패:", error);
    return { success: false, message: getErrorMessage(error) };
  }
}

export async function deleteSessionAction(id: string) {
  try {
    deleteSession(id);
    return { success: true };
  } catch (error) {
    console.error("[Session Action] deleteSessionAction 실패:", error);
    return { success: false, message: getErrorMessage(error) };
  }
}

/**
 * 특정 세션에 연결된 매뉴얼 ID 목록을 갱신합니다.
 */
export async function updateSessionManualsAction(sessionId: string, manualIds: string[]) {
  try {
    updateSessionManuals(sessionId, manualIds);
    return { success: true };
  } catch (error) {
    console.error("[Session Action] updateSessionManualsAction 실패:", error);
    return { success: false, message: getErrorMessage(error) };
  }
}
