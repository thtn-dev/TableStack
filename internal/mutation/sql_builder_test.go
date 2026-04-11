package mutation

import (
	"strings"
	"testing"
)

// =============================================================================
// PostgresSQLBuilder — BuildUpdate tests
// =============================================================================

func TestBuildUpdate_SingleColumn(t *testing.T) {
	b := &PostgresSQLBuilder{}
	req := UpdateRowRequest{
		Schema: "public",
		Table:  "users",
		PrimaryKeys: map[string]any{
			"id": 42,
		},
		Changes: []CellChange{
			{Column: "name", NewValue: "Alice"},
		},
	}

	query, args, err := b.BuildUpdate(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	wantQuery := `UPDATE "public"."users" SET "name" = $1 WHERE "id" = $2`
	if query != wantQuery {
		t.Errorf("query mismatch\n  got:  %q\n  want: %q", query, wantQuery)
	}
	if len(args) != 2 {
		t.Fatalf("want 2 args, got %d", len(args))
	}
	if args[0] != "Alice" {
		t.Errorf("args[0] = %v, want %q", args[0], "Alice")
	}
	if args[1] != 42 {
		t.Errorf("args[1] = %v, want 42", args[1])
	}
}

func TestBuildUpdate_MultipleColumns(t *testing.T) {
	b := &PostgresSQLBuilder{}
	req := UpdateRowRequest{
		Schema: "public",
		Table:  "users",
		PrimaryKeys: map[string]any{"id": 1},
		// Changes are ordered; builder must preserve order
		Changes: []CellChange{
			{Column: "email", NewValue: "new@example.com"},
			{Column: "age", NewValue: 30},
		},
	}

	query, args, err := b.BuildUpdate(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Both columns appear in SET, PK in WHERE
	if !strings.Contains(query, `"email" = $1`) {
		t.Errorf("expected SET email at $1, got: %q", query)
	}
	if !strings.Contains(query, `"age" = $2`) {
		t.Errorf("expected SET age at $2, got: %q", query)
	}
	if !strings.Contains(query, `"id" = $3`) {
		t.Errorf("expected WHERE id at $3, got: %q", query)
	}
	if len(args) != 3 {
		t.Fatalf("want 3 args, got %d", len(args))
	}
}

func TestBuildUpdate_CompositePK(t *testing.T) {
	b := &PostgresSQLBuilder{}
	req := UpdateRowRequest{
		Schema: "app",
		Table:  "order_items",
		PrimaryKeys: map[string]any{
			"order_id": 10,
			"item_id":  5,
		},
		Changes: []CellChange{
			{Column: "quantity", NewValue: 3},
		},
	}

	query, args, err := b.BuildUpdate(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// PK columns are sorted: item_id, order_id
	if !strings.Contains(query, `"item_id" = $2`) {
		t.Errorf("expected item_id in WHERE, got: %q", query)
	}
	if !strings.Contains(query, `"order_id" = $3`) {
		t.Errorf("expected order_id in WHERE, got: %q", query)
	}
	if len(args) != 3 {
		t.Fatalf("want 3 args, got %d: %v", len(args), args)
	}
}

func TestBuildUpdate_OptimisticLock(t *testing.T) {
	b := &PostgresSQLBuilder{}
	req := UpdateRowRequest{
		Schema:      "public",
		Table:       "products",
		PrimaryKeys: map[string]any{"id": 7},
		Changes: []CellChange{
			{Column: "price", OldValue: 9.99, NewValue: 12.99},
		},
	}

	query, args, err := b.BuildUpdate(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should have: SET price=$1, WHERE id=$2 AND price=$3
	if !strings.Contains(query, `"price" = $1`) {
		t.Errorf("SET clause missing, got: %q", query)
	}
	if !strings.Contains(query, `"id" = $2`) {
		t.Errorf("PK condition missing, got: %q", query)
	}
	if !strings.Contains(query, `"price" = $3`) {
		t.Errorf("optimistic lock condition missing, got: %q", query)
	}
	if len(args) != 3 {
		t.Fatalf("want 3 args (newVal, pk, oldVal), got %d", len(args))
	}
	if args[0] != 12.99 {
		t.Errorf("args[0] = %v, want 12.99 (new value)", args[0])
	}
	if args[2] != 9.99 {
		t.Errorf("args[2] = %v, want 9.99 (old value for optimistic lock)", args[2])
	}
}

func TestBuildUpdate_EmptyChanges(t *testing.T) {
	b := &PostgresSQLBuilder{}
	req := UpdateRowRequest{
		Table:       "users",
		PrimaryKeys: map[string]any{"id": 1},
		Changes:     []CellChange{},
	}

	_, _, err := b.BuildUpdate(req)
	if err == nil {
		t.Error("expected error for empty changes, got nil")
	}
}

func TestBuildUpdate_EmptyPK(t *testing.T) {
	b := &PostgresSQLBuilder{}
	req := UpdateRowRequest{
		Table:       "users",
		PrimaryKeys: map[string]any{},
		Changes:     []CellChange{{Column: "name", NewValue: "x"}},
	}

	_, _, err := b.BuildUpdate(req)
	if err == nil {
		t.Error("expected error for empty PrimaryKeys, got nil")
	}
}

func TestBuildUpdate_SQLInjectionColumnName(t *testing.T) {
	b := &PostgresSQLBuilder{}
	req := UpdateRowRequest{
		Table:       "users",
		PrimaryKeys: map[string]any{"id": 1},
		Changes: []CellChange{
			{Column: `name"; DROP TABLE users; --`, NewValue: "x"},
		},
	}

	_, _, err := b.BuildUpdate(req)
	if err == nil {
		t.Error("expected error for malicious column name, got nil")
	}
}

// =============================================================================
// PostgresSQLBuilder — BuildDelete tests
// =============================================================================

func TestBuildDelete_SingleRow(t *testing.T) {
	b := &PostgresSQLBuilder{}
	req := DeleteRowsRequest{
		Schema:      "public",
		Table:       "users",
		PrimaryKeys: []map[string]any{{"id": 42}},
	}

	query, args, err := b.BuildDelete(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	wantQuery := `DELETE FROM "public"."users" WHERE ("id") IN (($1))`
	if query != wantQuery {
		t.Errorf("query mismatch\n  got:  %q\n  want: %q", query, wantQuery)
	}
	if len(args) != 1 || args[0] != 42 {
		t.Errorf("args = %v, want [42]", args)
	}
}

func TestBuildDelete_MultipleRows(t *testing.T) {
	b := &PostgresSQLBuilder{}
	req := DeleteRowsRequest{
		Schema: "public",
		Table:  "users",
		PrimaryKeys: []map[string]any{
			{"id": 1},
			{"id": 2},
			{"id": 3},
		},
	}

	query, args, err := b.BuildDelete(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	wantQuery := `DELETE FROM "public"."users" WHERE ("id") IN (($1), ($2), ($3))`
	if query != wantQuery {
		t.Errorf("query mismatch\n  got:  %q\n  want: %q", query, wantQuery)
	}
	if len(args) != 3 {
		t.Fatalf("want 3 args, got %d", len(args))
	}
}

func TestBuildDelete_CompositePK(t *testing.T) {
	b := &PostgresSQLBuilder{}
	req := DeleteRowsRequest{
		Schema: "app",
		Table:  "order_items",
		PrimaryKeys: []map[string]any{
			{"order_id": 1, "item_id": 5},
			{"order_id": 2, "item_id": 6},
		},
	}

	query, args, err := b.BuildDelete(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// PK columns sorted: item_id, order_id
	wantQuery := `DELETE FROM "app"."order_items" WHERE ("item_id", "order_id") IN (($1, $2), ($3, $4))`
	if query != wantQuery {
		t.Errorf("query mismatch\n  got:  %q\n  want: %q", query, wantQuery)
	}
	if len(args) != 4 {
		t.Fatalf("want 4 args, got %d", len(args))
	}
}

func TestBuildDelete_EmptyPK(t *testing.T) {
	b := &PostgresSQLBuilder{}
	req := DeleteRowsRequest{
		Table:       "users",
		PrimaryKeys: []map[string]any{},
	}

	_, _, err := b.BuildDelete(req)
	if err == nil {
		t.Error("expected error for empty PrimaryKeys, got nil")
	}
}

func TestBuildDelete_SQLInjectionTableName(t *testing.T) {
	b := &PostgresSQLBuilder{}
	req := DeleteRowsRequest{
		Table:       `users; DROP TABLE users; --`,
		PrimaryKeys: []map[string]any{{"id": 1}},
	}

	_, _, err := b.BuildDelete(req)
	if err == nil {
		t.Error("expected error for malicious table name, got nil")
	}
}

// =============================================================================
// MySQLSQLBuilder — basic smoke tests for ? placeholders and backtick quoting
// =============================================================================

func TestMySQLBuildUpdate_UsesQuestionMarkPlaceholders(t *testing.T) {
	b := &MySQLSQLBuilder{}
	req := UpdateRowRequest{
		Table:       "users",
		PrimaryKeys: map[string]any{"id": 1},
		Changes:     []CellChange{{Column: "name", NewValue: "Bob"}},
	}

	query, _, err := b.BuildUpdate(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if strings.Contains(query, "$1") {
		t.Errorf("MySQL builder should not use $N placeholders, got: %q", query)
	}
	if !strings.Contains(query, "?") {
		t.Errorf("MySQL builder should use ? placeholders, got: %q", query)
	}
	if !strings.Contains(query, "`name`") {
		t.Errorf("MySQL builder should use backtick quoting, got: %q", query)
	}
}

func TestMySQLBuildDelete_UsesQuestionMarkPlaceholders(t *testing.T) {
	b := &MySQLSQLBuilder{}
	req := DeleteRowsRequest{
		Table:       "orders",
		PrimaryKeys: []map[string]any{{"id": 1}, {"id": 2}},
	}

	query, args, err := b.BuildDelete(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(query, "?") {
		t.Errorf("MySQL builder should use ? placeholders, got: %q", query)
	}
	if len(args) != 2 {
		t.Errorf("want 2 args, got %d", len(args))
	}
}
