ALTER TABLE v2_elections
 ADD COLUMN public_token CHAR(64) NULL,
 ADD COLUMN deleted_at VARCHAR(24) NULL,
 ADD COLUMN deleted_by VARCHAR(160) NULL,
 ADD UNIQUE KEY v2_public_tally_token (public_token);
