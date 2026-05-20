"use server";

import { 
  getSessions, 
  createSession, 
  updateSessionMessages, 
  deleteSession,
  updateSessionManuals,
  ChatSession 
} from "@/lib/db";

export async function getSessionsAction() {
  try {
    const sessions = getSessions();
    return { success: true, sessions };
  } catch (error) {
    console.error("[Session Action] getSessionsAction 실패:", error);
    return { success: false, sessions: [], message: (error as any).message };
  }
}

export async function createSessionAction(title?: string, manualIds?: string[]) {
  try {
    const session = createSession(title, manualIds ?? []);
    return { success: true, session };
  } catch (error) {
    console.error("[Session Action] createSessionAction 실패:", error);
    return { success: false, message: (error as any).message };
  }
}

export async function updateSessionMessagesAction(id: string, messages: any[]) {
  try {
    updateSessionMessages(id, messages);
    return { success: true };
  } catch (error) {
    console.error("[Session Action] updateSessionMessagesAction 실패:", error);
    return { success: false, message: (error as any).message };
  }
}

export async function deleteSessionAction(id: string) {
  try {
    deleteSession(id);
    return { success: true };
  } catch (error) {
    console.error("[Session Action] deleteSessionAction 실패:", error);
    return { success: false, message: (error as any).message };
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
    return { success: false, message: (error as any).message };
  }
}
