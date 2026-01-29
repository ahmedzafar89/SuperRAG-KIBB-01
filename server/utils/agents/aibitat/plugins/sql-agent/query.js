const { hasSchema } = require("./schema-cache");

function extractTables(sql) {
  const tables = new Set();

  // 1️⃣ FROM <table> (but NOT "FROM (" subqueries or function FROMs)
  const fromRegex = /\bfrom\s+([a-zA-Z0-9_."-]+)(\s|$)/gi;
  for (const m of sql.matchAll(fromRegex)) {
    const raw = m[1].replace(/"/g, "");
    // ignore subqueries: FROM (
    if (raw === "(") continue;
    tables.add(raw.split(".").pop().toLowerCase());
  }

  // 2️⃣ JOIN <table>
  const joinRegex = /\bjoin\s+([a-zA-Z0-9_."-]+)(\s|$)/gi;
  for (const m of sql.matchAll(joinRegex)) {
    const raw = m[1].replace(/"/g, "");
    tables.add(raw.split(".").pop().toLowerCase());
  }

  return [...tables];
}

module.exports.SqlAgentQuery = {
  name: "sql-query",
  plugin: function () {
    const {
      getDBClient,
      listSQLConnections,
    } = require("./SQLConnectors/index.js");

    return {
      name: "sql-query",
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "Run a read-only SQL query on a `database_id` which will return up rows of data related to the query. The query must only be SELECT statements which do not modify the table data. There should be a reasonable LIMIT on the return quantity to prevent long-running or queries which crash the db.",
          examples: [
            {
              prompt: "How many customers are in dvd-rentals?",
              call: JSON.stringify({
                database_id: "dvd-rentals",
                sql_query: "SELECT * FROM customers",
              }),
            },
            {
              prompt: "Can you tell me the total volume of sales last month?",
              call: JSON.stringify({
                database_id: "sales-db",
                sql_query:
                  "SELECT SUM(sale_amount) AS total_sales FROM sales WHERE sale_date >= DATEADD(month, -1, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)) AND sale_date < DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)",
              }),
            },
            {
              prompt:
                "Do we have anyone in the staff table for our production db named 'sam'? ",
              call: JSON.stringify({
                database_id: "production",
                sql_query:
                  "SElECT * FROM staff WHERE first_name='sam%' OR last_name='sam%'",
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              database_id: {
                type: "string",
                description:
                  "The database identifier for which we will connect to to query the table schema. This is required to run the SQL query.",
              },
              sql_query: {
                type: "string",
                description:
                  "The raw SQL query to run. Should be a query which does not modify the table and will return results.",
              },
            },
            additionalProperties: false,
          },
          required: ["database_id", "sql_query"],
          handler: async function ({ database_id = "", sql_query = "" }) {
            this.super.handlerProps.log(`Using the sql-query tool.`);
            try {
              const databaseConfig = (await listSQLConnections()).find(
                (db) => db.database_id === database_id
              );
              if (!databaseConfig) {
                this.super.handlerProps.log(
                  `sql-query failed to find config!`,
                  database_id
                );
                return `No database connection for ${database_id} was found!`;
              }

              this.super.introspect(
                `${this.caller}: Im going to run a query on the ${database_id} to get an answer.`
              );
              const db = getDBClient(databaseConfig.engine, databaseConfig);

              // HARD ENFORCEMENT: schema must be loaded for all referenced tables
              const KNOWN_TABLES = new Set([
                "flight",
                "airport",
                "aircraft",
                "booking",
                "booking_leg",
                "ticket",
                "passenger",
                "boarding_pass",
              ]);

              const tables = extractTables(sql_query).filter(t => KNOWN_TABLES.has(t));
              const missing = tables.filter(
                (t) =>
                  !hasSchema(
                    { caller: this.caller, super: this.super },
                    database_id,
                    t
                  )
              );

              if (missing.length > 0) {
                return JSON.stringify({
                  error: "Schema not loaded",
                  message:
                    "You must retrieve table schema before running sql-query. Call sql-get-table-schema for the missing tables, then re-run the query using ONLY real column names.",
                  database_id,
                  missing_tables: missing,
                  next_step: missing.map((t) => ({
                    tool: "sql-get-table-schema",
                    arguments: { database_id, table_name: t },
                  })),
                });
              }

              this.super.introspect(`Running SQL: ${sql_query}`);
              const result = await db.runQuery(sql_query);
              if (result.error) {
                this.super.handlerProps.log(
                  `sql-query tool reported error`,
                  result.error
                );
                this.super.introspect(`Error: ${result.error}`);
                return `There was an error running the query: ${result.error}`;
              }

              return JSON.stringify(result);
            } catch (e) {
              console.error(e);
              return e.message;
            }
          },
        });
      },
    };
  },
};
