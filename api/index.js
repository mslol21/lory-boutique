require("dotenv").config();
const { startupError } = require("../server/startup-error");
module.exports = async function handler(req, res) {
  try {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ausente");
    const { app, initialize } = require("../server/index");
    await initialize();
    // Vercel preserves the incoming path when routing to this function.
    await new Promise((resolve) => {
      res.once("finish", resolve);
      res.once("close", resolve);
      app(req, res);
    });
  } catch (error) {
    console.error("API indisponível:", error.code || error.name);
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: startupError(error),
      }),
    );
  }
};
