import express from 'express';
import morgan from 'morgan';
import merchantRoutes from './routes/merchants';
import walletRoutes from './routes/wallets';
import transactionRoutes from './routes/transactions';
import { walletLedgerRouter, transactionLedgerRouter } from './routes/ledger';
import { errorHandler } from './middleware/errorHandler';
import db from './db/knex';

const app = express();

app.use(express.json());
app.use(morgan('[:date[iso]] :method :url :status :response-time ms'));

// Healthcheck
app.get('/health', async (req, res) => {
  try {
    await db.raw('SELECT 1');
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', database: 'disconnected', timestamp: new Date().toISOString() });
  }
});

app.use('/api/merchants', merchantRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/wallets', walletLedgerRouter);
app.use('/api/transactions', transactionRoutes);
app.use('/api/transactions', transactionLedgerRouter);

app.use(errorHandler);

export default app;
