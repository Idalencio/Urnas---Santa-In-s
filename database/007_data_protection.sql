CREATE TABLE IF NOT EXISTS image_access (
 image_id CHAR(36) PRIMARY KEY,
 admin_id VARCHAR(160) NOT NULL,
 FOREIGN KEY (admin_id) REFERENCES administrators(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS admin_mfa (admin_id VARCHAR(160) PRIMARY KEY, enabled TINYINT NOT NULL DEFAULT 0) ENGINE=InnoDB;
INSERT INTO admin_audit (id,occurred_at,actor_id,actor_name,action,target_type,target_id,election_id,details)
 SELECT UUID(),DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-%dT%H:%i:%s.000Z'),'system','Atualização do sistema','securityUpdated','account',admin_id,'','{}' FROM admin_mfa WHERE enabled=1;
UPDATE admin_passwords SET version=version+1 WHERE admin_id IN (SELECT admin_id FROM admin_mfa WHERE enabled=1);
DELETE FROM admin_sessions WHERE admin_id IN (SELECT admin_id FROM admin_mfa WHERE enabled=1);
DROP TABLE IF EXISTS admin_mfa;
