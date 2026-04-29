interface AppQuery {
  query: string;
}

export const appQueries: Record<string, AppQuery> = {
  getIntellisense: {
    query: `
    SELECT 
      database,
      table,
      name AS column_name,
      type AS column_type
    FROM system.columns
    ORDER BY database, table, column_name;
    `,
  },
  getDatabasesTables: {
    query: `
    SELECT
      databases.name AS database_name,
      tables.name AS table_name,
      tables.engine AS table_type,
      tables.total_bytes AS total_bytes
    FROM system.databases AS databases
    LEFT JOIN system.tables AS tables
      ON databases.name = tables.database

    UNION ALL

    SELECT
      database AS database_name,
      name AS table_name,
      'Dictionary' AS table_type,
      bytes_allocated AS total_bytes
    FROM system.dictionaries

    ORDER BY database_name, table_name;
    `,
  },
  getCompletions: {
    query: `SELECT word, context, belongs FROM system.completions`,
  },
};
