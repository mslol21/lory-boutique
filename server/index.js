const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const { initDB, saveToDiskSync } = require('./db');
const { createSchema } = require('./schema');
const { seedDatabase } = require('./seed');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const saleRoutes = require('./routes/sales');
const cashRoutes = require('./routes/cash');
const returnRoutes = require('./routes/returns');
const reportRoutes = require('./routes/reports');
const publicRoutes = require('./routes/public');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.originalUrl.startsWith('/api')) {
      console.log(`[API] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
    }
  });
  next();
});

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/cash', cashRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/public', publicRoutes);
app.use('/api', publicRoutes); // For /api/settings

// Serve static frontend in production if built
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDistPath));

app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api')) {
    return next();
  }
  const indexPath = path.join(clientDistPath, 'index.html');
  if (require('fs').existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return res.status(404).send('API online. Frontend build not found or in dev mode.');
});

// Central error handler
app.use((err, req, res, next) => {
  console.error('[Error Handler]', err);
  return res.status(500).json({ error: err.message || 'Erro interno do servidor.' });
});

async function startServer() {
  try {
    await initDB();
    createSchema();
    seedDatabase(true);
    saveToDiskSync();

    const server = app.listen(PORT, () => {
      console.log(`===============================================`);
      console.log(`🌸 LORY BOUTIQUE - SERVIDOR OPERACIONAL 🌸`);
      console.log(`Backend rodando em: http://localhost:${PORT}`);
      console.log(`Ambiente: Persistência SQLite ativada.`);
      console.log(`===============================================`);
    });

    return server;
  } catch (err) {
    console.error('Falha crítica ao iniciar o servidor:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
