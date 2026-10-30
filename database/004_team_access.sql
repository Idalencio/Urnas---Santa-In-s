CREATE TABLE IF NOT EXISTS v2_accounts (
 admin_id VARCHAR(160) PRIMARY KEY, username VARCHAR(80) NOT NULL UNIQUE,
 permissions LONGTEXT NOT NULL, class_scope LONGTEXT NOT NULL, election_ids LONGTEXT NOT NULL,
 FOREIGN KEY (admin_id) REFERENCES administrators(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS v2_election_owners (
 election_id CHAR(36) PRIMARY KEY, admin_id VARCHAR(160) NOT NULL,
 FOREIGN KEY (election_id) REFERENCES v2_elections(id),
 FOREIGN KEY (admin_id) REFERENCES administrators(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
