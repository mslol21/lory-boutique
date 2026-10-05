const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("node:crypto");
const { get, query, run, transaction } = require("../db");
const {
  authenticate,
  requireRole,
  logAudit,
  JWT_SECRET,
} = require("../middleware/auth");
const { text } = require("../validation");
const attempts = new Map();
router.post("/login", (req, res) => {
  const ip = req.ip;
  const now = Date.now();
  for (const [key, value] of attempts)
    if (value.until < now) attempts.delete(key);
  const rate = attempts.get(ip) || { count: 0, until: now + 15 * 60 * 1000 };
  if (rate.count >= 10)
    return res
      .status(429)
      .json({ error: "Muitas tentativas. Tente novamente em 15 minutos." });
  try {
    const username = text(req.body.username, "Usuário", 80).toLowerCase();
    const password = text(req.body.password, "Senha", 200);
    const user = get("SELECT * FROM users WHERE username=?", [username]);
    if (
      !user ||
      !user.active ||
      !bcrypt.compareSync(password, user.password_hash)
    ) {
      rate.count++;
      attempts.set(ip, rate);
      return res.status(401).json({ error: "Usuário ou senha incorretos." });
    }
    attempts.delete(ip);
    const token = jwt.sign(
      { id: user.id, version: user.token_version },
      JWT_SECRET,
      { expiresIn: "12h" },
    );
    logAudit(user.id, "LOGIN", "user", user.id, { ip });
    const { password_hash, ...safe } = user;
    return res.json({ token, user: safe });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.get("/me", authenticate, (req, res) => res.json({ user: req.user }));
router.get("/users", authenticate, requireRole("admin"), (req, res) =>
  res.json(
    query(
      "SELECT id,name,username,role,active,created_at FROM users ORDER BY created_at DESC",
    ),
  ),
);
router.post("/users", authenticate, requireRole("admin"), (req, res) => {
  try {
    const name = text(req.body.name, "Nome", 100),
      username = text(req.body.username, "Usuário", 80).toLowerCase(),
      password = text(req.body.password, "Senha", 200);
    if (password.length < 12)
      throw new Error("A senha deve ter ao menos 12 caracteres.");
    const role = req.body.role;
    if (!["admin", "attendant"].includes(role))
      throw new Error("Perfil inválido.");
    if (get("SELECT id FROM users WHERE username=?", [username]))
      return res.status(409).json({ error: "Usuário já existe." });
    const id = randomUUID();
    run(
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
    logAudit(req.user.id, "CREATE_USER", "user", id, { name, username, role });
    return res
      .status(201)
      .json({ user: { id, name, username, role, active: 1 } });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.put("/users/:id", authenticate, requireRole("admin"), (req, res) => {
  try {
    const user = get("SELECT * FROM users WHERE id=?", [req.params.id]);
    if (!user)
      return res.status(404).json({ error: "Usuário não encontrado." });
    const role = req.body.role ?? user.role,
      active = req.body.active ?? user.active;
    if (!["admin", "attendant"].includes(role) || ![0, 1].includes(active))
      throw new Error("Perfil ou status inválido.");
    if (user.id === req.user.id && (!active || role !== "admin"))
      throw new Error(
        "Não é possível remover seu próprio acesso de administrador.",
      );
    const password = req.body.password;
    if (
      password !== undefined &&
      (typeof password !== "string" || password.length < 12)
    )
      throw new Error("A senha deve ter ao menos 12 caracteres.");
    transaction(() =>
      run(
        "UPDATE users SET name=?,role=?,active=?,password_hash=?,token_version=token_version+1 WHERE id=?",
        [
          req.body.name ? text(req.body.name, "Nome", 100) : user.name,
          role,
          active,
          password ? bcrypt.hashSync(password, 12) : user.password_hash,
          user.id,
        ],
      ),
    );
    logAudit(req.user.id, "UPDATE_USER", "user", user.id, { role, active });
    return res.json(
      get("SELECT id,name,username,role,active FROM users WHERE id=?", [
        user.id,
      ]),
    );
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
module.exports = router;
