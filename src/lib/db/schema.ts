import type Database from 'better-sqlite3-multiple-ciphers';

/**
 * Schema definition and lightweight migration.
 *
 * The schema is intentionally future-proof: a nullable `embedding` BLOB column
 * exists on both entries and memories so vector similarity search can be added
 * later (Phase 4) without restructuring. Full-text search is provided by an
 * FTS5 virtual table kept in sync via triggers.
 */
export function applySchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id          TEXT PRIMARY KEY,
      content     TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      embedding   BLOB
    );

    CREATE INDEX IF NOT EXISTS idx_entries_created ON entries(created_at);

    CREATE TABLE IF NOT EXISTS entry_analysis (
      id          TEXT PRIMARY KEY,
      entry_id    TEXT NOT NULL UNIQUE REFERENCES entries(id) ON DELETE CASCADE,
      summary     TEXT NOT NULL DEFAULT '',
      mood        REAL NOT NULL DEFAULT 0.5,
      stress      REAL NOT NULL DEFAULT 0.5,
      energy      REAL NOT NULL DEFAULT 0.5,
      topics      TEXT NOT NULL DEFAULT '[]',
      people      TEXT NOT NULL DEFAULT '[]',
      places      TEXT NOT NULL DEFAULT '[]',
      activities  TEXT NOT NULL DEFAULT '[]',
      important   INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL DEFAULT 'New conversation',
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role            TEXT NOT NULL,
      content         TEXT NOT NULL,
      citations       TEXT NOT NULL DEFAULT '[]',
      created_at      TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON chat_messages(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS memories (
      id                TEXT PRIMARY KEY,
      content           TEXT NOT NULL,
      type              TEXT NOT NULL DEFAULT 'other',
      importance        REAL NOT NULL DEFAULT 0.5,
      source_entry_ids  TEXT NOT NULL DEFAULT '[]',
      embedding         BLOB,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Full-text search over entry content (external-content FTS5 table).
    CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
      content,
      content='entries',
      content_rowid='rowid'
    );
  `);

  // Keep the FTS index in sync with the entries table via triggers.
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
      INSERT INTO entries_fts(rowid, content) VALUES (new.rowid, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
      INSERT INTO entries_fts(entries_fts, rowid, content)
        VALUES ('delete', old.rowid, old.content);
    END;
    CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
      INSERT INTO entries_fts(entries_fts, rowid, content)
        VALUES ('delete', old.rowid, old.content);
      INSERT INTO entries_fts(rowid, content) VALUES (new.rowid, new.content);
    END;
  `);
}
