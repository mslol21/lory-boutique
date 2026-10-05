const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, "..", "data", "loryboutique.db");
let db;
async function initDB() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  // Never replace a damaged database with an empty one.
  db = new DatabaseSync(DB_PATH, { timeout: 5000 });
  const check = db.prepare("PRAGMA quick_check").get();
  if (Object.values(check)[0] !== "ok") {
    db.close();
    db = null;
    throw new Error("Banco inválido. Preserve o arquivo e restaure um backup.");
  }
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;",
  );
  return db;
}
const bindings = (params) => params.map((v) => (v === undefined ? null : v));
function query(sql, params = []) {
  return db.prepare(sql).all(...bindings(params));
}
function get(sql, params = []) {
  return db.prepare(sql).get(...bindings(params)) || null;
}
function run(sql, params = []) {
  return db.prepare(sql).run(...bindings(params));
}
function transaction(fn) {
  if (db.isTransaction) return fn();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    if (result?.then) throw new Error("Transação deve ser síncrona.");
    db.exec("COMMIT");
    return result;
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}
function saveToDiskSync() {
  if (db && !db.isTransaction) db.exec("PRAGMA wal_checkpoint(PASSIVE)");
}
function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
}
module.exports = {
  initDB,
  query,
  get,
  run,
  transaction,
  saveToDiskSync,
  closeDB,
  getRawDB: () => db,
  getDbPath: () => DB_PATH,
};
