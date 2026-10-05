require("dotenv").config();
const { initDB, getRawDB, getDbPath, closeDB } = require("./db");
const { backup } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");
(async () => {
  if (process.env.DATABASE_URL)
    throw new Error(
      "Para PostgreSQL use pg_dump ou os backups do Supabase, não o backup SQLite.",
    );
  if (!fs.existsSync(getDbPath())) throw new Error("Banco não encontrado.");
  await initDB();
  const dir = path.join(path.dirname(getDbPath()), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(
    dir,
    `lory-${new Date().toISOString().replace(/[:.]/g, "-")}.db`,
  );
  await backup(getRawDB(), target);
  await closeDB();
  console.log("Backup criado:", target);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
