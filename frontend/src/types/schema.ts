// Schema types for the SQL suggestion engine.
// These mirror the Go structs in internal/db/schema.go and internal/db/dialect.go
// and are used independently of the auto-generated Wails bindings so that
// completion code can import them without worrying about binding regeneration.

export interface ColumnSchema {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  defaultValue?: string | null;
  comment?: string | null;
}

export interface IndexSchema {
  name: string;
  columns: string[];
  isUnique: boolean;
}

export interface ForeignKey {
  name: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
}

export interface TableSchema {
  name: string;
  /** "TABLE" or "VIEW" */
  type: string;
  columns: ColumnSchema[];
  indexes: IndexSchema[];
  foreignKeys: ForeignKey[];
}

export interface DatabaseSchema {
  name: string;
  tables: TableSchema[];
}

export interface SchemaResult {
  schemas: DatabaseSchema[];
}

export interface FunctionInfo {
  name: string;
  signature: string;
  description: string;
}

export interface DialectInfo {
  providerType: string;
  keywords: string[];
  functions: FunctionInfo[];
  dataTypes: string[];
  operators: string[];
}
