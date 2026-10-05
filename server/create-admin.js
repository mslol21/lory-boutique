require("dotenv").config();
const { initDB, closeDB } = require("./db");
const { createSchema } = require("./schema");
const { seedDatabase } = require("./seed");
(async () => {
  if (!process.env.ADMIN_PASSWORD)
    throw new Error(
      "Defina ADMIN_USERNAME, ADMIN_NAME e ADMIN_PASSWORD (mínimo 12 caracteres) no ambiente.",
    );
  await initDB();
  createSchema();
  await seedDatabase();
  closeDB();
  console.log(
    "Administrador configurado. Produtos e estoque permanecem vazios.",
  );
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
