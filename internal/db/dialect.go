package db

// DialectInfo holds provider-specific SQL keywords, built-in functions,
// data types, and operators. All data is static (hardcoded per driver) and
// never requires a live DB round-trip.
type DialectInfo struct {
	ProviderType string         `json:"providerType"`
	Keywords     []string       `json:"keywords"`
	Functions    []FunctionInfo `json:"functions"`
	DataTypes    []string       `json:"dataTypes"`
	Operators    []string       `json:"operators"`
}

// FunctionInfo describes a single built-in SQL function with its call
// signature and a short human-readable description.
type FunctionInfo struct {
	Name        string `json:"name"`
	Signature   string `json:"signature"`
	Description string `json:"description"`
}

// DialectProvider is implemented by drivers that expose static dialect
// metadata (keywords, functions, data types). The method returns a pointer
// to a static value — callers must not modify the returned struct.
type DialectProvider interface {
	GetDialectInfo() *DialectInfo
}
