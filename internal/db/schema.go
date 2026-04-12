package db

import (
	"context"
	"database/sql"
)

// SchemaResult is the aggregated schema snapshot returned by IntrospectSchema.
// It normalises the introspection output from all supported drivers into a
// single, provider-agnostic structure that the SQL completion engine reads.
type SchemaResult struct {
	Schemas []DatabaseSchema `json:"schemas"`
}

// DatabaseSchema represents a named schema (PostgreSQL) or the current
// database (MySQL).
type DatabaseSchema struct {
	Name   string        `json:"name"`
	Tables []TableSchema `json:"tables"`
}

// TableSchema holds full metadata for a single table or view.
type TableSchema struct {
	Name        string         `json:"name"`
	Type        string         `json:"type"` // "TABLE" or "VIEW"
	Columns     []ColumnSchema `json:"columns"`
	Indexes     []IndexSchema  `json:"indexes"`
	ForeignKeys []ForeignKey   `json:"foreignKeys"`
}

// ColumnSchema carries column-level metadata used by the SQL completion engine.
type ColumnSchema struct {
	Name         string  `json:"name"`
	DataType     string  `json:"dataType"`
	IsNullable   bool    `json:"isNullable"`
	IsPrimaryKey bool    `json:"isPrimaryKey"`
	DefaultValue *string `json:"defaultValue,omitempty"`
	Comment      *string `json:"comment,omitempty"`
}

// IndexSchema describes a single index on a table.
type IndexSchema struct {
	Name     string   `json:"name"`
	Columns  []string `json:"columns"`
	IsUnique bool     `json:"isUnique"`
}

// ForeignKey describes a foreign-key constraint between two tables.
type ForeignKey struct {
	Name             string `json:"name"`
	Column           string `json:"column"`
	ReferencedTable  string `json:"referencedTable"`
	ReferencedColumn string `json:"referencedColumn"`
}

// SchemaIntrospector is implemented by drivers that support full schema
// introspection in a single aggregated call. The method must be safe for
// concurrent use and must not modify the *sql.DB connection pool settings.
type SchemaIntrospector interface {
	IntrospectSchema(ctx context.Context, db *sql.DB) (*SchemaResult, error)
}
