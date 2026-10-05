const express = require("express");
const cors = require("cors");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const { initDB, saveToDiskSync, getDbPath } = require("./db");
const { createSchema } = require("./schema");
const { seedDatabase } = require("./seed");

const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const saleRoutes = require("./routes/sales");
const cashRoutes = require("./routes/cash");
const returnRoutes = require("./routes/returns");
const reportRoutes = require("./routes/reports");
const publicRoutes = require("./routes/public");

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(cors({ origin: process.env.CORS_ORIGIN || false }));
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (req.originalUrl.startsWith("/api")) {
      console.log(
        `[API] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`,
      );
    }
  });
  next();
});

// Mount API routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/cash", cashRoutes);
app.use("/api/returns", returnRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/public", publicRoutes);
app.use("/api", publicRoutes); // For /api/settings

app.use(
  "/uploads",
  express.static(path.join(path.dirname(getDbPath()), "uploads"), {
    dotfiles: "deny",
    index: false,
  }),
);

// Serve static frontend in production if built
const clientDistPath = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientDistPath));

app.use((req, res, next) => {
  if (req.originalUrl.startsWith("/api")) {
    return next();
  }
  const indexPath = path.join(clientDistPath, "index.html");
  if (require("fs").existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return res
    .status(404)
    .send("API online. Frontend build not found or in dev mode.");
});

// Central error handler
app.use((err, req, res, next) => {
  console.error("[Error Handler]", err);
  return res
    .status(500)
    .json({ error: "Erro interno. A operação não foi concluída." });
});

async function startServer() {
  try {
    await initDB();
    createSchema();
    await seedDatabase();
    saveToDiskSync();

    const server = await new Promise((resolve, reject) => {
      const listener = app.listen(PORT, () => resolve(listener));
      listener.once("error", reject);
    });
    {
      console.log(`===============================================`);
      console.log(`🌸 LORY BOUTIQUE - SERVIDOR OPERACIONAL 🌸`);
      console.log(`Backend rodando em: http://localhost:${PORT}`);
      console.log(`Ambiente: Persistência SQLite ativada.`);
      console.log(`===============================================`);
    }

    return server;
  } catch (err) {
    console.error("Falha crítica ao iniciar o servidor:", err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
