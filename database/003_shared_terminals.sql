CREATE TABLE IF NOT EXISTS v2_election_terminals (
 election_id CHAR(36) NOT NULL,
 terminal_id VARCHAR(160) NOT NULL,
 PRIMARY KEY (election_id,terminal_id),
 INDEX v2_terminal_elections (terminal_id,election_id),
 FOREIGN KEY (election_id) REFERENCES v2_elections(id),
 FOREIGN KEY (terminal_id) REFERENCES v2_terminals(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
