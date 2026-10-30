CREATE TABLE IF NOT EXISTS v2_elections (
 id CHAR(36) PRIMARY KEY, name VARCHAR(160) NOT NULL, digits TINYINT NOT NULL DEFAULT 5,
 has_vice TINYINT NOT NULL DEFAULT 0, require_matricula TINYINT NOT NULL DEFAULT 1,
 published TINYINT NOT NULL DEFAULT 0, closed TINYINT NOT NULL DEFAULT 0,
 starts_at VARCHAR(24) NULL, ends_at VARCHAR(24) NULL, candidate_snapshot LONGTEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS v2_candidates (
 id CHAR(36) PRIMARY KEY, election_id CHAR(36) NOT NULL, name VARCHAR(160) NOT NULL,
 code VARCHAR(5) NOT NULL, image VARCHAR(250) NOT NULL DEFAULT '',
 vice_name VARCHAR(160) NOT NULL DEFAULT '', vice_image VARCHAR(250) NOT NULL DEFAULT '',
 active TINYINT NOT NULL DEFAULT 1,
 UNIQUE KEY v2_candidate_election_number (election_id,code),
 FOREIGN KEY (election_id) REFERENCES v2_elections(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS v2_students (
 matricula VARCHAR(80) PRIMARY KEY, name VARCHAR(160) NOT NULL, class_name VARCHAR(80) NOT NULL,
 active TINYINT NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS v2_terminals (
 id VARCHAR(160) PRIMARY KEY, name VARCHAR(160) NOT NULL, location VARCHAR(160) NOT NULL DEFAULT '',
 model VARCHAR(16) NOT NULL, election_id CHAR(36) NULL,
 FOREIGN KEY (election_id) REFERENCES v2_elections(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS v2_electors (
 election_id CHAR(36) NOT NULL, matricula VARCHAR(80) NOT NULL,
 name VARCHAR(160) NOT NULL, class_name VARCHAR(80) NOT NULL,
 voted TINYINT NOT NULL DEFAULT 0, gate_hash CHAR(64) NULL, gate_expires BIGINT NULL,
 terminal_id VARCHAR(160) NULL,
 PRIMARY KEY (election_id,matricula), UNIQUE KEY v2_gate_unique (gate_hash),
 FOREIGN KEY (election_id) REFERENCES v2_elections(id),
 FOREIGN KEY (matricula) REFERENCES v2_students(matricula)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS v2_ballots (
 id CHAR(36) PRIMARY KEY, election_id CHAR(36) NOT NULL, candidate_id CHAR(36) NOT NULL,
 kind VARCHAR(16) NOT NULL DEFAULT 'valid',
 INDEX v2_results (election_id,candidate_id),
 FOREIGN KEY (election_id) REFERENCES v2_elections(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
