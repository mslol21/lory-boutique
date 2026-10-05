const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { get, query, run } = require('../db');
const { authenticate, requireRole, logAudit, JWT_SECRET } = require('../middleware/auth');

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Informe usuário e senha.' });
  }

  const user = get('SELECT * FROM users WHERE username = ?', [username.trim().toLowerCase()]);
  if (!user) {
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }

  if (user.active !== 1) {
    return res.status(403).json({ error: 'Usuário desativado. Contate o administrador.' });
  }

  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  logAudit(user.id, 'LOGIN', 'user', user.id, { ip: req.ip });

  return res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role
    }
  });
});

// Current user profile
router.get('/me', authenticate, (req, res) => {
  return res.json({ user: req.user });
});

// Admin: list users
router.get('/users', authenticate, requireRole('admin'), (req, res) => {
  const users = query('SELECT id, name, username, role, active, created_at FROM users ORDER BY created_at DESC');
  return res.json(users);
});

// Admin: create user
router.post('/users', authenticate, requireRole('admin'), (req, res) => {
  const { name, username, password, role } = req.body;
  if (!name || !username || !password || !role) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }

  if (!['admin', 'attendant'].includes(role)) {
    return res.status(400).json({ error: 'Perfil inválido.' });
  }

  const cleanUsername = username.trim().toLowerCase();
  const existing = get('SELECT id FROM users WHERE username = ?', [cleanUsername]);
  if (existing) {
    return res.status(409).json({ error: 'Nome de usuário já está em uso.' });
  }

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();

  run(
    'INSERT INTO users (id, name, username, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
    [id, name.trim(), cleanUsername, passwordHash, role, now]
  );

  logAudit(req.user.id, 'CREATE_USER', 'user', id, { name, username: cleanUsername, role });

  return res.status(201).json({
    message: 'Usuário criado com sucesso.',
    user: { id, name, username: cleanUsername, role, active: 1, created_at: now }
  });
});

// Admin: toggle active status or update password
router.put('/users/:id', authenticate, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const { name, active, password, role } = req.body;

  const targetUser = get('SELECT id, username FROM users WHERE id = ?', [id]);
  if (!targetUser) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  // Prevent admin from deactivating oneself
  if (req.user.id === id && active === 0) {
    return res.status(400).json({ error: 'Você não pode desativar seu próprio usuário.' });
  }

  if (password && password.trim()) {
    const hash = bcrypt.hashSync(password.trim(), 10);
    run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]);
  }

  if (active !== undefined) {
    run('UPDATE users SET active = ? WHERE id = ?', [active ? 1 : 0, id]);
  }

  if (name && name.trim()) {
    run('UPDATE users SET name = ? WHERE id = ?', [name.trim(), id]);
  }

  if (role && ['admin', 'attendant'].includes(role)) {
    run('UPDATE users SET role = ? WHERE id = ?', [role, id]);
  }

  logAudit(req.user.id, 'UPDATE_USER', 'user', id, { active, role, name });

  const updated = get('SELECT id, name, username, role, active, created_at FROM users WHERE id = ?', [id]);
  return res.json(updated);
});

module.exports = router;
