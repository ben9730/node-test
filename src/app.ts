import express from 'express';
import merchantRoutes from './routes/merchants';
import walletRoutes from './routes/wallets';
import transactionRoutes from './routes/transactions';
import { walletLedgerRouter, transactionLedgerRouter } from './routes/ledger';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(express.json());

app.use('/api/merchants', merchantRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/wallets', walletLedgerRouter);
app.use('/api/transactions', transactionRoutes);
app.use('/api/transactions', transactionLedgerRouter);

app.use(errorHandler);

export default app;
