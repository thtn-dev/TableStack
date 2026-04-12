package postgres

import "testing"

func TestGetDialectInfo_NotEmpty(t *testing.T) {
	d := &Driver{}
	info := d.GetDialectInfo()

	if info == nil {
		t.Fatal("GetDialectInfo returned nil")
	}
	if info.ProviderType != "postgres" {
		t.Errorf("ProviderType = %q, want %q", info.ProviderType, "postgres")
	}
	if len(info.Keywords) == 0 {
		t.Error("Keywords is empty")
	}
	if len(info.Functions) == 0 {
		t.Error("Functions is empty")
	}
	if len(info.DataTypes) == 0 {
		t.Error("DataTypes is empty")
	}
	if len(info.Operators) == 0 {
		t.Error("Operators is empty")
	}
}

func TestGetDialectInfo_FunctionFields(t *testing.T) {
	d := &Driver{}
	info := d.GetDialectInfo()

	for _, fn := range info.Functions {
		if fn.Name == "" {
			t.Error("function with empty Name found")
		}
		if fn.Signature == "" {
			t.Errorf("function %q has empty Signature", fn.Name)
		}
		if fn.Description == "" {
			t.Errorf("function %q has empty Description", fn.Name)
		}
	}
}

func TestGetDialectInfo_ContainsPostgresSpecific(t *testing.T) {
	d := &Driver{}
	info := d.GetDialectInfo()

	// Check for PostgreSQL-specific keywords
	pgSpecificKw := map[string]bool{"ILIKE": false, "RETURNING": false, "WITH RECURSIVE": false}
	for _, kw := range info.Keywords {
		pgSpecificKw[kw] = true
	}
	for kw, found := range pgSpecificKw {
		if !found {
			t.Errorf("expected PostgreSQL-specific keyword %q not found", kw)
		}
	}

	// Check for PostgreSQL-specific data types
	pgSpecificTypes := map[string]bool{"JSONB": false, "UUID": false, "TSVECTOR": false}
	for _, dt := range info.DataTypes {
		pgSpecificTypes[dt] = true
	}
	for dt, found := range pgSpecificTypes {
		if !found {
			t.Errorf("expected PostgreSQL-specific data type %q not found", dt)
		}
	}
}
