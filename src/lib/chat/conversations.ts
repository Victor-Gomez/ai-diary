import { getDb } from '../db/client';
import { newId } from '../utils/id';
import { nowIso } from '../utils/date';
import type { ChatMessage, Citation, Conversation, ChatRole } from '@/types';

interface ConversationRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  citations: string;
  created_at: string;
}

function mapConversation(r: ConversationRow): Conversation {
  return { id: r.id, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at };
}

function parseCitations(json: string): Citation[] {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? (v as Citation[]) : [];
  } catch {
    return [];
  }
}

function mapMessage(r: MessageRow): ChatMessage {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role as ChatRole,
    content: r.content,
    citations: parseCitations(r.citations),
    createdAt: r.created_at,
  };
}

export function createConversation(title = 'New conversation'): Conversation {
  const db = getDb();
  const id = newId();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`,
  ).run(id, title, ts, ts);
  return { id, title, createdAt: ts, updatedAt: ts };
}

export function listConversations(): Conversation[] {
  return getDb()
    .prepare<ConversationRow>(`SELECT * FROM conversations ORDER BY updated_at DESC`)
    .all()
    .map(mapConversation);
}

export function getConversation(id: string): Conversation | null {
  const row = getDb()
    .prepare<ConversationRow>(`SELECT * FROM conversations WHERE id = ?`)
    .get(id);
  return row ? mapConversation(row) : null;
}

export function renameConversation(id: string, title: string): void {
  getDb()
    .prepare(`UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?`)
    .run(title, nowIso(), id);
}

export function deleteConversation(id: string): boolean {
  return getDb().prepare(`DELETE FROM conversations WHERE id = ?`).run(id).changes > 0;
}

export function getMessages(conversationId: string): ChatMessage[] {
  return getDb()
    .prepare<MessageRow>(
      `SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC`,
    )
    .all(conversationId)
    .map(mapMessage);
}

export function addMessage(
  conversationId: string,
  role: ChatRole,
  content: string,
  citations: Citation[] = [],
): ChatMessage {
  const db = getDb();
  const id = newId();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO chat_messages (id, conversation_id, role, content, citations, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, conversationId, role, content, JSON.stringify(citations), ts);
  db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(ts, conversationId);
  return { id, conversationId, role, content, citations, createdAt: ts };
}
