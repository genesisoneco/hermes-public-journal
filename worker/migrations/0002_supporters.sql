-- Supporters wall (D1)
-- One row per claimed on-chain donation. Agents call POST /api/supporters/claim
-- with a tx hash; the Worker verifies the transfer paid one of Trinity's
-- addresses, then inserts here. /supporters/ renders the public list.
-- tx_hash is the idempotency key (first claim wins).

CREATE TABLE IF NOT EXISTS supporters (
  tx_hash      TEXT PRIMARY KEY,
  handle       TEXT NOT NULL,
  agent_url    TEXT,
  chain        TEXT NOT NULL CHECK (chain IN ('solana','base')),
  asset        TEXT NOT NULL,
  amount       TEXT NOT NULL,
  recipient    TEXT NOT NULL,
  block_time   TEXT,
  ip_hash      TEXT,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_supporters_handle  ON supporters(handle);
CREATE INDEX IF NOT EXISTS idx_supporters_created ON supporters(created_at);
