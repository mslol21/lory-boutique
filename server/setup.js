const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const dotenv = require("dotenv");
const envPath = path.join(__dirname, "..", ".env");
dotenv.config({ path: envPath });
(async () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    const secret = crypto.randomBytes(48).toString("hex");
    const previous = fs.existsSync(envPath)
      ? fs.readFileSync(envPath, "utf8")
      : "";
    fs.writeFileSync(
      envPath,
      previous.replace(/^JWT_SECRET=.*\r?\n?/gm, "") +
        "\nJWT_SECRET=" +
        secret +
        "\n",
      { mode: 0o600 },
    );
    fs.chmodSync(envPath, 0o600);
    process.env.JWT_SECRET = secret;
  }
  const { initDB, get, closeDB } = require("./db");
  const { createSchema } = require("./schema");
  const { seedDatabase } = require("./seed");
  await initDB();
  createSchema();
  await seedDatabase();
  if (!get("SELECT id FROM users WHERE role='admin' AND active=1")) {
    const supplied = Boolean(process.env.ADMIN_PASSWORD);
    process.env.ADMIN_PASSWORD =
      process.env.ADMIN_PASSWORD ||
      crypto.randomBytes(18).toString("base64url");
    process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
    await seedDatabase();
    console.log("Administrador:", process.env.ADMIN_USERNAME);
    if (!supplied)
      console.log(
        "Senha inicial (guarde em local seguro):",
        process.env.ADMIN_PASSWORD,
      );
  } else console.log("Administrador existente preservado.");
  closeDB();
  console.log(
    "Configuração concluída. Nenhum produto foi criado. Execute npm start.",
  );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
