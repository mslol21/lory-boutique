const bcrypt = require("bcryptjs");
const { randomUUID } = require("node:crypto");
const { get, query, run, transaction, getDbPath, isPostgres } = require("./db");
const fs = require("node:fs");
const path = require("node:path");
const { getRawDB } = require("./db");

// Only store configuration is initialized. No products, sales, stock or demo accounts.
async function seedDatabase() {
  const demo =
    (await get("SELECT value FROM store_settings WHERE key='demo_mode'"))
      ?.value === "1";
  if (demo && isPostgres)
    throw new Error(
      "Banco remoto marcado como demonstração. Revise os dados antes de continuar.",
    );
  if (demo) {
    // One-time conversion of the old, explicitly marked demonstration database.
    const backupPath = path.join(
      path.dirname(getDbPath()),
      "backups",
      `demo-before-cleanup-${Date.now()}.db`,
    );
    fs.mkdirSync(path.dirname(backupPath), {
      recursive: true,
    });
    await require("node:sqlite").backup(getRawDB(), backupPath);
  }
  await transaction(async () => {
    if (demo) {
      for (const table of [
        "financial_entries",
        "return_items",
        "returns",
        "sale_payments",
        "sale_items",
        "stock_movements",
        "sales",
        "cash_movements",
        "cash_registers",
        "product_variations",
        "products",
      ])
        await run(`DELETE FROM ${table}`);
      await run("DELETE FROM audit_logs");
    }
    const settings = {
      store_name: "Lory Boutique",
      segment: "Roupas Femininas",
      address: "Rua Hipólito de Camargo, 45 — Guaianases, São Paulo/SP",
      whatsapp: "(11) 94961-1902",
      whatsapp_raw: "5511949611902",
      instagram: "https://www.instagram.com/loryboutiquel/",
      instagram_handle: "@loryboutiquel",
      operation_model: "Retirada na loja física (sem entregas no momento)",
      cnpj: "",
      cep: "",
      business_hours: "",
      attendant_discount_percent: "0",
    };
    for (const [key, value] of Object.entries(settings))
      await run(
        "INSERT OR IGNORE INTO store_settings (key,value) VALUES (?,?)",
        [key, value],
      );
    await run(
      "INSERT INTO store_settings(key,value) VALUES ('demo_mode','0') ON CONFLICT(key) DO UPDATE SET value='0'",
    );
    for (const user of await query("SELECT * FROM users")) {
      const known =
        user.username === "admin"
          ? "admin123"
          : user.username === "atendente"
            ? "atendente123"
            : null;
      if (known && bcrypt.compareSync(known, user.password_hash))
        await run("UPDATE users SET active=0 WHERE id=?", [user.id]);
    }
    if (process.env.ADMIN_PASSWORD) {
      if (process.env.ADMIN_PASSWORD.length < 12)
        throw new Error("ADMIN_PASSWORD deve ter ao menos 12 caracteres.");
      const username = (process.env.ADMIN_USERNAME || "admin")
        .trim()
        .toLowerCase();
      const user = await get("SELECT * FROM users WHERE username=?", [
        username,
      ]);
      if (!user)
        await run(
          "INSERT INTO users(id,name,username,password_hash,role,active,created_at) VALUES (?,?,?,?,?,1,?)",
          [
            randomUUID(),
            process.env.ADMIN_NAME || "Administrador Lory",
            username,
            bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12),
            "admin",
            new Date().toISOString(),
          ],
        );
      else if (
        !user.active &&
        user.username === "admin" &&
        bcrypt.compareSync("admin123", user.password_hash)
      )
        await run(
          "UPDATE users SET password_hash=?,active=1,role='admin' WHERE id=?",
          [bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12), user.id],
        );
    }
  });
}
module.exports = {
  seedDatabase,
};
