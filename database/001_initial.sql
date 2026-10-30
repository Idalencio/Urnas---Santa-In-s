CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(80) PRIMARY KEY, applied_at VARCHAR(24) NOT NULL) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS terminals (
 id VARCHAR(160) PRIMARY KEY, name VARCHAR(160) NOT NULL, location VARCHAR(160) NOT NULL DEFAULT '', model VARCHAR(16) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS candidates (
 id VARCHAR(160) PRIMARY KEY, terminal_id VARCHAR(160) NULL, name VARCHAR(160) NOT NULL, code CHAR(2) NOT NULL,
 image VARCHAR(250) NOT NULL DEFAULT '', active TINYINT NOT NULL DEFAULT 1,
 UNIQUE KEY candidates_terminal_code_unique (terminal_id,code), FOREIGN KEY (terminal_id) REFERENCES terminals(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS elections (
 id VARCHAR(160) PRIMARY KEY, name VARCHAR(160) NOT NULL, terminal_id VARCHAR(160) NOT NULL,
 starts_at VARCHAR(24) NOT NULL, ends_at VARCHAR(24) NOT NULL, closed TINYINT NOT NULL DEFAULT 0,
 archived TINYINT NOT NULL DEFAULT 0, candidate_snapshot LONGTEXT NOT NULL, digits TINYINT NOT NULL DEFAULT 2,
 INDEX elections_terminal_period (terminal_id,closed,starts_at,ends_at), FOREIGN KEY (terminal_id) REFERENCES terminals(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS ballots (
 id CHAR(36) PRIMARY KEY, election_id VARCHAR(160) NOT NULL, candidate_id VARCHAR(160) NOT NULL, kind VARCHAR(16) NOT NULL,
 INDEX ballots_results (election_id,candidate_id,kind), FOREIGN KEY (election_id) REFERENCES elections(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS administrators (
 id VARCHAR(160) PRIMARY KEY, name VARCHAR(160) NOT NULL, email VARCHAR(254) NOT NULL UNIQUE,
 role VARCHAR(16) NOT NULL DEFAULT 'admin', active TINYINT NOT NULL DEFAULT 1, owner TINYINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS admin_passwords (
 admin_id VARCHAR(160) PRIMARY KEY, hash VARCHAR(255) NOT NULL, version INT NOT NULL DEFAULT 1, updated_at VARCHAR(24) NOT NULL,
 FOREIGN KEY (admin_id) REFERENCES administrators(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS admin_sessions (
 id CHAR(64) PRIMARY KEY, admin_id VARCHAR(160) NOT NULL, version INT NOT NULL, expires_at VARCHAR(24) NOT NULL, panel_hash CHAR(64) NOT NULL,
 INDEX sessions_expiry (expires_at), FOREIGN KEY (admin_id) REFERENCES administrators(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS admin_invitations (
 id CHAR(36) PRIMARY KEY, admin_id VARCHAR(160) NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE,
 expires_at VARCHAR(24) NOT NULL, used TINYINT NOT NULL DEFAULT 0, delivery VARCHAR(20) NOT NULL, created_at VARCHAR(24) NOT NULL,
 replacement_email VARCHAR(254) NULL, replacement_name VARCHAR(160) NULL,
 INDEX invitations_admin (admin_id,created_at), FOREIGN KEY (admin_id) REFERENCES administrators(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS login_limits (
 id CHAR(64) PRIMARY KEY, attempts INT NOT NULL, window_ends VARCHAR(24) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS mail_configuration (
 id VARCHAR(20) PRIMARY KEY, sender VARCHAR(254) NOT NULL, encrypted_settings TEXT NOT NULL, updated_at VARCHAR(24) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
