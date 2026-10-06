const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { randomUUID, createHmac } = require("node:crypto");
const { get, query, run, transaction } = require("../db");
const {
  authenticate,
  requireRole,
  logAudit,
  JWT_SECRET,
} = require("../middleware/auth");
const { text } = require("../validation");
router.post("/login", async (req, res) => {
  let username, password;
  try {
    username = text(req.body.username, "Usuário", 80).toLowerCase();
    password = text(req.body.password, "Senha", 200);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  try {
    const now = Date.now(),
      ip = req.ip;
    const id = createHmac("sha256", JWT_SECRET)
      .update(ip || "unknown")
      .digest("hex");
    const result = await transaction(async () => {
      await run("DELETE FROM login_attempts WHERE expires_at<?", [now]);
      const attempt = await get("SELECT * FROM login_attempts WHERE id=?", [
        id,
      ]);
      if (attempt && attempt.failures >= 10)
        return {
          status: 429,
          data: { error: "Muitas tentativas. Tente novamente em 15 minutos." },
        };
      const user = await get("SELECT * FROM users WHERE username=?", [
        username,
      ]);
      if (
        !user ||
        !user.active ||
        !bcrypt.compareSync(password, user.password_hash)
      ) {
        await run(
          "INSERT INTO login_attempts(id,failures,expires_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET failures=excluded.failures,expires_at=excluded.expires_at",
          [
            id,
            (attempt?.failures ?? 0) + 1,
            attempt?.expires_at ?? now + 15 * 60 * 1000,
          ],
        );
        return { status: 401, data: { error: "Usuário ou senha incorretos." } };
      }
      await run("DELETE FROM login_attempts WHERE id=?", [id]);
      const token = jwt.sign(
        { id: user.id, version: user.token_version },
        JWT_SECRET,
        { expiresIn: "12h" },
      );
      await logAudit(user.id, "LOGIN", "user", user.id, { ip });
      const { password_hash, ...safe } = user;
      return { status: 200, data: { token, user: safe } };
    });
    return res.status(result.status).json(result.data);
  } catch (error) {
    return res
      .status(503)
      .json({ error: "Acesso temporariamente indisponível. Tente novamente." });
  }
});
router.get("/me", authenticate, (req, res) =>
  res.json({
    user: req.user,
  }),
);
router.get("/users", authenticate, requireRole("admin"), async (req, res) =>
  res.json(
    await query(
      "SELECT id,name,username,role,active,created_at FROM users ORDER BY created_at DESC",
    ),
  ),
);
router.post("/users", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const name = text(req.body.name, "Nome", 100),
      username = text(req.body.username, "Usuário", 80).toLowerCase(),
      password = text(req.body.password, "Senha", 200);
    if (password.length < 12)
      throw new Error("A senha deve ter ao menos 12 caracteres.");
    const role = req.body.role;
    if (!["admin", "attendant"].includes(role))
      throw new Error("Perfil inválido.");
    if (await get("SELECT id FROM users WHERE username=?", [username]))
      return res.status(409).json({
        error: "Usuário já existe.",
      });
    const id = randomUUID();
    await run(
      "INSERT INTO users(id,name,username,password_hash,role,active,created_at) VALUES (?,?,?,?,?,1,?)",
      [
        id,
        name,
        username,
        bcrypt.hashSync(password, 12),
        role,
        new Date().toISOString(),
      ],
    );
    await logAudit(req.user.id, "CREATE_USER", "user", id, {
      name,
      username,
      role,
    });
    return res.status(201).json({
      user: {
        id,
        name,
        username,
        role,
        active: 1,
      },
    });
  } catch (error) {
    return res.status(error.databaseFailure ? 503 : 400).json({
      error: error.databaseFailure
        ? "Conexão interrompida. Tente novamente com a mesma operação."
        : error.message,
    });
  }
});
router.put(
  "/users/:id",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    try {
      const updated = await transaction(async () => {
        const user = await get("SELECT * FROM users WHERE id=?", [req.params.id]);
        if (!user) throw Object.assign(new Error("Usuário não encontrado."), { status: 404 });
        const role = req.body.role ?? user.role, active = req.body.active ?? user.active;
        if (!["admin", "attendant"].includes(role) || ![0, 1].includes(active))
          throw new Error("Perfil ou status inválido.");
        if (user.id === req.user.id && (!active || role !== "admin"))
          throw new Error("Não é possível remover seu próprio acesso de administrador.");
        if (user.role === "admin" && user.active && (!active || role !== "admin")) {
          const others = await get("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND active=1 AND id!=?", [user.id]);
          if (!others.n) throw new Error("Mantenha pelo menos um administrador ativo.");
        }
        const username = req.body.username === undefined ? user.username : text(req.body.username, "Usuário", 80).toLowerCase();
        if (await get("SELECT id FROM users WHERE username=? AND id!=?", [username, user.id]))
          throw Object.assign(new Error("Usuário já existe."), { status: 409 });
        const password = req.body.password === undefined ? undefined : text(req.body.password, "Senha", 200);
        if (password !== undefined && (typeof password !== "string" || password.length < 12 || password.length > 200))
          throw new Error("A senha deve ter entre 12 e 200 caracteres.");
        const name = req.body.name === undefined ? user.name : text(req.body.name, "Nome", 100);
        await run("UPDATE users SET name=?,username=?,role=?,active=?,password_hash=?,token_version=token_version+1 WHERE id=?",
          [name, username, role, active, password ? bcrypt.hashSync(password, 12) : user.password_hash, user.id]);
        await logAudit(req.user.id, "UPDATE_USER", "user", user.id, { name, username, role, active, password_changed: password !== undefined });
        return await get("SELECT id,name,username,role,active FROM users WHERE id=?", [user.id]);
      });
      return res.json(updated);
    } catch (error) {
      return res.status(error.status || (error.databaseFailure ? 503 : 400)).json({
        error: error.databaseFailure
          ? "Conexão interrompida. Tente novamente com a mesma operação."
          : error.message,
      });
    }
  },
);
module.exports = router;
