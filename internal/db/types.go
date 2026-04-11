package db

type DatabaseInfo struct {
	Name string `json:"name"`
}

type TableInfo struct {
	Schema string `json:"schema"`
	Name   string `json:"name"`
	Type   string `json:"type"`
}

type ColumnInfo struct {
	Name         string `json:"name"`
	DataType     string `json:"dataType"`
	IsNullable   bool   `json:"isNullable"`
	IsPrimaryKey bool   `json:"isPrimaryKey"`
	// IsGenerated is true for serial/auto-increment columns and expression-generated columns.
	// These columns cannot be edited by the user.
	IsGenerated  bool   `json:"isGenerated"`
	DefaultValue string `json:"defaultValue"`
	Position     int    `json:"position"`
}

type IndexInfo struct {
	Name    string   `json:"name"`
	Columns []string `json:"columns"`
	Unique  bool     `json:"unique"`
}
