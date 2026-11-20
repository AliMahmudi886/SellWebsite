CREATE TABLE IF NOT EXISTS api_rate_limit_windows (
  bucket TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0 CHECK (hits >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (bucket, subject_hash, window_start)
);

CREATE INDEX IF NOT EXISTS api_rate_limit_windows_expiry_idx
  ON api_rate_limit_windows(expires_at);
