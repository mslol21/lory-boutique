const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, '..', 'data', 'loryboutique.db');

let db = null;
let SQL = null;
let isDirty = false;
let saveDebounceTimer = null;

// Save database buffer to disk
function saveToDiskSync() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
    isDirty = false;
  } catch (err) {
    console.error('Erro ao persistir banco de dados em disco:', err);
  }
}

function scheduleSave() {
  isDirty = true;
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    saveToDiskSync();
  }, 200);
}

// Convert statement results to array of objects
function formatResults(res) {
  if (!res || res.length === 0) return [];
  const columns = res[0].columns;
  const values = res[0].values;
  return values.map(row => {
    const obj = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj;
  });
}

async function initDB() {
  if (db) return db;
  SQL = await initSqlJs();

  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (fs.existsSync(DB_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
      console.log('Banco de dados SQLite carregado do disco com sucesso:', DB_PATH);
    } catch (e) {
      console.warn('Falha ao ler arquivo SQLite existente, criando novo:', e.message);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
    console.log('Novo banco de dados SQLite inicializado em memória.');
  }

  // Handle process termination to always persist
  process.on('SIGINT', () => {
    saveToDiskSync();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    saveToDiskSync();
    process.exit(0);
  });

  return db;
}

function query(sqlStr, params = []) {
  if (!db) throw new Error('Database not initialized');
  try {
    const stmt = db.prepare(sqlStr);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  } catch (err) {
    console.error('SQL Query Error:', sqlStr, params, err);
    throw err;
  }
}

function get(sqlStr, params = []) {
  const rows = query(sqlStr, params);
  return rows.length > 0 ? rows[0] : null;
}

function run(sqlStr, params = []) {
  if (!db) throw new Error('Database not initialized');
  try {
    db.run(sqlStr, params);
    scheduleSave();
    const changesRes = db.exec('SELECT changes() AS changes');
    const changes = (changesRes.length > 0 && changesRes[0].values[0]) ? changesRes[0].values[0][0] : 0;
    return { changes };
  } catch (err) {
    console.error('SQL Run Error:', sqlStr, params, err);
    throw err;
  }
}

function transaction(fn) {
  if (!db) throw new Error('Database not initialized');
  db.run('BEGIN TRANSACTION;');
  try {
    const result = fn();
    db.run('COMMIT;');
    scheduleSave();
    return result;
  } catch (err) {
    db.run('ROLLBACK;');
    throw err;
  }
}

module.exports = {
  initDB,
  query,
  get,
  run,
  transaction,
  saveToDiskSync,
  getRawDB: () => db,
  getDbPath: () => DB_PATH,
};
