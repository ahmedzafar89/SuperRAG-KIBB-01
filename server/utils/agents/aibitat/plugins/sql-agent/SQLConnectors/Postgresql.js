// Postgresql.js
const pgSql = require("pg");
const { Pool } = pgSql;

class PostgresSQLConnector {
  constructor(
    config = {
      connectionString: null,
      schema: null,
      poolMax: 10,
      statementTimeoutMs: 60_000,
    }
  ) {
    this.className = "PostgresSQLConnector";

    if (!config.connectionString) {
      throw new Error("PostgresSQLConnector: connectionString is required");
    }

    this.connectionString = config.connectionString;
    this.schema = config.schema || "public";

    this.poolMax = Number(config.poolMax ?? 10);
    this.statementTimeoutMs = Number(config.statementTimeoutMs ?? 60_000);

    // ✅ Don't log secrets
    console.log(this.className, "Initialized", {
      schema: this.schema,
      statementTimeoutMs: this.statementTimeoutMs,
      poolMax: this.poolMax,
    });

    this.pool = new Pool({
      connectionString: this.connectionString,
      max: this.poolMax,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
    });
  }

  #validateSchema() {
    // safe for identifiers like postgres_air
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(this.schema)) {
      throw new Error(`Invalid schema name: ${this.schema}`);
    }
  }

  #sanitizeIdentifier(name) {
    // keep only safe chars for table names etc.
    return String(name || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
  }

  async runQuery(queryString = "") {
    const result = { rows: [], count: 0, error: null };

    const sql = String(queryString || "").trim();
    if (!sql) {
      result.error = "Empty query";
      return result;
    }

    // Optional: block multi-statement SQL for predictability
    const stmts = sql.split(";").map(s => s.trim()).filter(Boolean);
    if (stmts.length > 1) {
      result.error = "Multi-statement SQL is not allowed";
      return result;
    }

    let client;
    try {
      this.#validateSchema();
      client = await this.pool.connect();

      const timeout = Number.isFinite(this.statementTimeoutMs) ? this.statementTimeoutMs : 60_000;

      // Use transaction + SET LOCAL to avoid leaking state across pooled sessions
      await client.query("BEGIN");
      await client.query(`SET LOCAL statement_timeout = ${timeout}`);
      await client.query(`SET LOCAL search_path TO "${this.schema}", public`);

      const query = await client.query(sql);

      await client.query("COMMIT");

      result.rows = query.rows;
      result.count =
        typeof query.rowCount === "number"
          ? query.rowCount
          : Array.isArray(query.rows)
            ? query.rows.length
            : 0;
    } catch (err) {
      try {
        if (client) await client.query("ROLLBACK");
      } catch {}
      console.error(this.className, "error:", err);
      result.error = err?.message || String(err);
    } finally {
      if (client) client.release();
    }

    return result;
  }

  async validateConnection() {
    const result = await this.runQuery("SELECT 1");
    return { success: !result.error, error: result.error };
  }

  // --- Compatibility methods expected by sql-agent plugins ---

  getTablesSql() {
    // Stable order helps the model
    return `
      SELECT tablename
      FROM pg_catalog.pg_tables
      WHERE schemaname = '${this.schema}'
      ORDER BY tablename
    `;
  }

  getTableSchemaSql(table_name) {
    const t = this.#sanitizeIdentifier(table_name);

    return `
      SELECT
        c.column_name,
        c.data_type,
        c.character_maximum_length,
        c.column_default,
        c.is_nullable,
        pgd.description AS column_description
      FROM information_schema.columns c
      LEFT JOIN pg_catalog.pg_statio_all_tables st
        ON st.schemaname = c.table_schema AND st.relname = c.table_name
      LEFT JOIN pg_catalog.pg_description pgd
        ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
      WHERE c.table_schema = '${this.schema}'
        AND c.table_name = '${t}'
      ORDER BY c.ordinal_position;
    `;
  }

  // New: PK discovery for join correctness
  getPrimaryKeySql(table_name) {
    const t = this.#sanitizeIdentifier(table_name);

    return `
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = '${this.schema}'
        AND tc.table_name = '${t}'
      ORDER BY kcu.ordinal_position;
    `;
  }

  // Existing: FK discovery (all)
  getForeignKeysSql() {
    return `
      SELECT
        kcu.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM
        information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
      WHERE
        tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = '${this.schema}'
      ORDER BY
        kcu.table_name, kcu.column_name;
    `;
  }

  // New: FK discovery for a single table (faster + less tokens)
  getForeignKeysForTableSql(table_name) {
    const t = this.#sanitizeIdentifier(table_name);

    return `
      SELECT
        kcu.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM
        information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
      WHERE
        tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = '${this.schema}'
        AND kcu.table_name = '${t}'
      ORDER BY
        kcu.column_name;
    `;
  }

  async close() {
    await this.pool.end();
  }
}

module.exports.PostgresSQLConnector = PostgresSQLConnector;
