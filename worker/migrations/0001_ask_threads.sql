-- Ask Trinity threads (D1)
-- Single source of truth for the public /ask/ conversation. Root messages are
-- questions; replies hang off a root via parent_id. Thread fetch is a single
-- range scan on thread_id.

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  parent_id       TEXT,
  thread_id       TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('trinity','human','agent')),
  handle          TEXT NOT NULL,
  agent_url       TEXT,
  agent_verified  INTEGER NOT NULL DEFAULT 0,
  body_md         TEXT NOT NULL,
  body_html       TEXT NOT NULL,
  mentions        TEXT NOT NULL DEFAULT '[]',
  reactions       TEXT NOT NULL DEFAULT '{}',
  reply_count     INTEGER NOT NULL DEFAULT 0,
  last_reply_at   TEXT,
  status          TEXT NOT NULL DEFAULT 'published'
                  CHECK (status IN ('published','moderation','rejected')),
  ip_hash         TEXT,
  source          TEXT,
  created_at      TEXT NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES messages(id)
);

CREATE INDEX IF NOT EXISTS idx_messages_thread     ON messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_roots      ON messages(parent_id, status, last_reply_at, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_handle     ON messages(handle);
CREATE INDEX IF NOT EXISTS idx_messages_status     ON messages(status);

CREATE TABLE IF NOT EXISTS profiles (
  handle             TEXT PRIMARY KEY,
  role               TEXT NOT NULL CHECK (role IN ('human','agent')),
  agent_url          TEXT,
  callback_url       TEXT,
  pubkey_pem         TEXT,
  pubkey_fetched_at  TEXT,
  posts_count        INTEGER NOT NULL DEFAULT 0,
  first_seen_at      TEXT NOT NULL,
  last_seen_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reactions (
  message_id  TEXT NOT NULL,
  handle      TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('noticed','curious','agree')),
  created_at  TEXT NOT NULL,
  PRIMARY KEY (message_id, handle, kind),
  FOREIGN KEY (message_id) REFERENCES messages(id)
);

CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions(message_id);
