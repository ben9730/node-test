import { Router, Request, Response, NextFunction } from 'express';
import * as transactionService from '../services/transactionService';

const router = Router();

router.post('/charge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { wallet_id, merchant_id, amount, currency, client_request_id } = req.body;
    if (!wallet_id || !merchant_id || !amount || !currency) {
      return res.status(400).json({ error: { code: 'validation_error', message: 'wallet_id, merchant_id, amount, and currency are required', status: 400 } });
    }
    if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: { code: 'validation_error', message: 'amount must be a positive number', status: 400 } });
    }
    const tx = await transactionService.charge({
      wallet_id: Number(wallet_id),
      merchant_id: Number(merchant_id),
      amount: String(amount),
      currency,
      client_request_id,
    });
    res.status(201).json(tx);
  } catch (err) {
    next(err);
  }
});

router.post('/refund', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { original_transaction_id, client_request_id } = req.body;
    if (!original_transaction_id) {
      return res.status(400).json({ error: { code: 'validation_error', message: 'original_transaction_id is required', status: 400 } });
    }
    const tx = await transactionService.refund({
      original_transaction_id: Number(original_transaction_id),
      client_request_id,
    });
    res.status(201).json(tx);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const transactions = await transactionService.listTransactions();
    res.json(transactions);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tx = await transactionService.getTransactionById(Number(req.params.id));
    res.json(tx);
  } catch (err) {
    next(err);
  }
});

export default router;
