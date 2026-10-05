const fs = require("node:fs");
const path = require("node:path");
const { AsyncLocalStorage } = require("node:async_hooks");
const context = new AsyncLocalStorage();
const isPostgres = Boolean(process.env.DATABASE_URL);
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, "..", "data", "loryboutique.db");
let db,
  pool,
  ready,
  queue = Promise.resolve();
async function exclusive(fn) {
  const previous = queue;
  let release;
  queue = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}
async function initDB() {
  if (ready) return ready;
  ready = (async () => {
    if (isPostgres) {
      const { Pool, types } = require("pg");
      types.setTypeParser(20, (value) => {
        const number = Number(value);
        if (!Number.isSafeInteger(number))
          throw new Error("Resultado numérico fora do limite seguro.");
        return number;
      });
      // Supabase pooler connections use TLS; local PostgreSQL remains usable for tests.
      const url = new URL(process.env.DATABASE_URL);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (!local && url.searchParams.get("sslmode") === "disable")
        throw new Error("A conexão remota exige TLS.");
      const ssl = local
        ? false
        : {
            rejectUnauthorized: true,
            ...(process.env.DATABASE_CA_CERT
              ? { ca: process.env.DATABASE_CA_CERT.replace(/\\n/g, "\n") }
              : {}),
          };
      url.searchParams.delete("sslmode");
      pool = new Pool({
        connectionString: url.toString(),
        ssl,
        max: 3,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 10000,
        allowExitOnIdle: true,
        statement_timeout: 15000,
      });
      pool.on("error", () =>
        console.error("Uma conexão PostgreSQL foi interrompida."),
      );
      await pool.query("SELECT 1");
      return pool;
    }
    if (process.env.VERCEL)
      throw new Error(
        "Configure DATABASE_URL: SQLite local não é persistente na Vercel.",
      );
    const { DatabaseSync } = require("node:sqlite");
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new DatabaseSync(DB_PATH, { timeout: 5000 });
    if (Object.values(db.prepare("PRAGMA quick_check").get())[0] !== "ok")
      throw new Error(
        "Banco inválido. Preserve o arquivo e restaure um backup.",
      );
    db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;",
    );
    return db;
  })().catch(async (error) => {
    error.databaseFailure = true;
    if (pool) {
      await pool.end();
      pool = null;
    }
    if (db) {
      db.close();
      db = null;
    }
    ready = null;
    throw error;
  });
  return ready;
}
// Parameter conversion only affects SQL syntax, never the values passed separately.
function postgresSQL(sql) {
  let index = 0;
  sql = sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?|\bLIKE\b/gi, (token) =>
    token === "?" ? "$" + ++index : /^like$/i.test(token) ? "ILIKE" : token,
  );
  if (/INSERT OR IGNORE/i.test(sql))
    sql = sql
      .replace(/INSERT OR IGNORE/i, "INSERT")
      .replace(/;?\s*$/, " ON CONFLICT DO NOTHING");
  return sql;
}
const bindings = (params) =>
  params.map((value) => (value === undefined ? null : value));
async function execute(sql, params, kind) {
  await initDB();
  if (isPostgres) {
    const client = context.getStore()?.client ?? pool;
    const result = await client
      .query(postgresSQL(sql), bindings(params))
      .catch((error) => {
        error.databaseFailure = true;
        throw error;
      });
    return kind === "run"
      ? { changes: result.rowCount }
      : kind === "get"
        ? (result.rows[0] ?? null)
        : result.rows;
  }
  const fn = () => {
    const statement = db.prepare(sql),
      args = bindings(params);
    return kind === "run"
      ? statement.run(...args)
      : kind === "get"
        ? (statement.get(...args) ?? null)
        : statement.all(...args);
  };
  return context.getStore()?.sqlite ? fn() : exclusive(fn);
}
const query = (sql, params = []) => execute(sql, params, "query");
const get = (sql, params = []) => execute(sql, params, "get");
const run = (sql, params = []) => execute(sql, params, "run");
async function transaction(fn) {
  await initDB();
  if (context.getStore()) return fn();
  if (isPostgres) {
    const client = await pool.connect().catch((error) => {
      error.databaseFailure = true;
      throw error;
    });
    let domainFailure = false;
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout='10s'");
      // One shop: serialize writes across instances so last-unit sales and cash cannot race.
      await client.query("SELECT pg_advisory_xact_lock(76201945)");
      const result = await context.run({ client }, fn).catch((error) => {
        domainFailure = true;
        throw error;
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      if (!domainFailure) error.databaseFailure = true;
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  return exclusive(() =>
    context.run({ sqlite: true }, async () => {
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = await fn();
        db.exec("COMMIT");
        return result;
      } catch (error) {
        if (db.isTransaction) db.exec("ROLLBACK");
        throw error;
      }
    }),
  );
}
function saveToDiskSync() {
  if (db && !db.isTransaction) db.exec("PRAGMA wal_checkpoint(PASSIVE)");
}
async function closeDB() {
  await queue;
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (db) {
    db.close();
    db = null;
  }
  ready = null;
}
module.exports = {
  initDB,
  query,
  get,
  run,
  transaction,
  saveToDiskSync,
  closeDB,
  isPostgres,
  postgresSQL,
  getRawDB: () => db,
  getDbPath: () => DB_PATH,
};
