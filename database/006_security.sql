CREATE TABLE IF NOT EXISTS admin_mfa (
 admin_id VARCHAR(160) PRIMARY KEY,
 enabled TINYINT NOT NULL DEFAULT 0,
 secret TEXT NULL,
 pending TEXT NULL,
 pending_until BIGINT NOT NULL DEFAULT 0,
 pending_panel CHAR(64) NULL,
 last_step BIGINT NOT NULL DEFAULT -1,
 recovery LONGTEXT NOT NULL,
 FOREIGN KEY (admin_id) REFERENCES administrators(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS admin_audit (
 id CHAR(36) PRIMARY KEY,
 occurred_at VARCHAR(24) NOT NULL,
 actor_id VARCHAR(160) NOT NULL,
 actor_name VARCHAR(160) NOT NULL,
 action VARCHAR(80) NOT NULL,
 target_type VARCHAR(40) NOT NULL,
 target_id VARCHAR(160) NOT NULL,
 election_id VARCHAR(36) NOT NULL,
 details LONGTEXT NOT NULL,
 INDEX audit_time (occurred_at,id),
 INDEX audit_election (election_id,occurred_at),
 INDEX audit_actor (actor_id,occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
