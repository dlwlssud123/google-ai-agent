"use server";

import { 
  getSessions, 
  createSession, 
  updateSessionMessages, 
  deleteSession,
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

export async function createSessionAction(title?: string) {
  try {
    const session = createSession(title);
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
