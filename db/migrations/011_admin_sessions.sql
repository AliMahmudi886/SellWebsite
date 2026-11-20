CREATE TABLE admin_sessions (
  token_hash text PRIMARY KEY,
  email text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX admin_sessions_expiry_idx ON admin_sessions (expires_at);
CREATE TABLE admin_mfa_claims (
  email text NOT NULL,
  proof_hash text NOT NULL,
  expires_at timestamptz,
  PRIMARY KEY (email, proof_hash)
);
CREATE INDEX admin_mfa_claims_expiry_idx ON admin_mfa_claims (expires_at);
