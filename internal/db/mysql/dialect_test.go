package mysql

import "testing"

func TestGetDialectInfo_NotEmpty(t *testing.T) {
	d := &Driver{}
	info := d.GetDialectInfo()

	if info == nil {
		t.Fatal("GetDialectInfo returned nil")
	}
	if info.ProviderType != "mysql" {
		t.Errorf("ProviderType = %q, want %q", info.ProviderType, "mysql")
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

func TestGetDialectInfo_ContainsMySQLSpecific(t *testing.T) {
	d := &Driver{}
	info := d.GetDialectInfo()

	// Check for MySQL-specific keywords
	mySpecificKw := map[string]bool{"AUTO_INCREMENT": false, "ON DUPLICATE KEY UPDATE": false}
	for _, kw := range info.Keywords {
		mySpecificKw[kw] = true
	}
	for kw, found := range mySpecificKw {
		if !found {
			t.Errorf("expected MySQL-specific keyword %q not found", kw)
		}
	}

	// Check for MySQL-specific functions
	mySpecificFns := map[string]bool{"GROUP_CONCAT": false, "LAST_INSERT_ID": false}
	for _, fn := range info.Functions {
		mySpecificFns[fn.Name] = true
	}
	for fn, found := range mySpecificFns {
		if !found {
			t.Errorf("expected MySQL-specific function %q not found", fn)
		}
	}

	// Check for MySQL-specific data types
	mySpecificTypes := map[string]bool{"TINYINT": false, "MEDIUMINT": false}
	for _, dt := range info.DataTypes {
		mySpecificTypes[dt] = true
	}
	for dt, found := range mySpecificTypes {
		if !found {
			t.Errorf("expected MySQL-specific data type %q not found", dt)
		}
	}
}
