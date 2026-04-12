package db

import "testing"

func TestIsDDLStatement(t *testing.T) {
	cases := []struct {
		sql  string
		want bool
	}{
		// True cases
		{"CREATE TABLE users (id INT)", true},
		{"create table users (id INT)", true},
		{"  CREATE TABLE  users (id INT)", true},
		{"CREATE VIEW active_users AS SELECT * FROM users", true},
		{"CREATE INDEX idx_users_email ON users(email)", true},
		{"CREATE UNIQUE INDEX idx_users_email ON users(email)", true},
		{"CREATE MATERIALIZED VIEW mv_stats AS SELECT 1", true},
		{"ALTER TABLE users ADD COLUMN age INT", true},
		{"alter table users drop column age", true},
		{"ALTER VIEW active_users AS SELECT * FROM users WHERE active=1", true},
		{"DROP TABLE users", true},
		{"DROP VIEW active_users", true},
		{"DROP INDEX idx_users_email", true},
		{"RENAME TABLE old_name TO new_name", true},
		{"TRUNCATE TABLE users", true},
		{"TRUNCATE users", true},
		// Leading comment stripped
		{"-- drop the table\nDROP TABLE users", true},
		{"-- comment\n-- another\nCREATE TABLE t (id INT)", true},
		// False cases
		{"SELECT * FROM users", false},
		{"INSERT INTO users VALUES (1, 'Alice')", false},
		{"UPDATE users SET name='Bob' WHERE id=1", false},
		{"DELETE FROM users WHERE id=1", false},
		{"", false},
		{"-- only a comment", false},
	}

	for _, tc := range cases {
		got := isDDLStatement(tc.sql)
		if got != tc.want {
			t.Errorf("isDDLStatement(%q) = %v, want %v", tc.sql, got, tc.want)
		}
	}
}
