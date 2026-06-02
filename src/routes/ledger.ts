import { Router, Request, Response, NextFunction } from 'express';
import * as transactionService from '../services/transactionService';

export const walletLedgerRouter = Router({ mergeParams: true });
walletLedgerRouter.get('/:id/ledger-entries', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entries = await transactionService.getLedgerEntriesByWallet(Number(req.params.id));
    res.json(entries);
  } catch (err) {
    next(err);
  }
});

export const transactionLedgerRouter = Router({ mergeParams: true });
transactionLedgerRouter.get('/:id/ledger-entries', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entries = await transactionService.getLedgerEntriesByTransaction(Number(req.params.id));
    res.json(entries);
  } catch (err) {
    next(err);
  }
});
