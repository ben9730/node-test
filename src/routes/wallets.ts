import { Router, Request, Response, NextFunction } from 'express';
import * as walletService from '../services/walletService';

const router = Router();

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { employee_id, currency, balance } = req.body;
    if (!employee_id || !currency) {
      return res.status(400).json({ error: { code: 'validation_error', message: 'employee_id and currency are required', status: 400 } });
    }
    const wallet = await walletService.createWallet({ employee_id, currency, balance });
    res.status(201).json(wallet);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wallets = await walletService.listWallets();
    res.json(wallets);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wallet = await walletService.getWalletById(Number(req.params.id));
    res.json(wallet);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;
    if (status !== 'active' && status !== 'inactive') {
      return res.status(400).json({ error: { code: 'validation_error', message: 'status must be active or inactive', status: 400 } });
    }
    const wallet = await walletService.updateWalletStatus(Number(req.params.id), status);
    res.json(wallet);
  } catch (err) {
    next(err);
  }
});

export default router;
