import { Router, Request, Response, NextFunction } from 'express';
import * as merchantService from '../services/merchantService';

const router = Router();

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: { code: 'validation_error', message: 'name is required', status: 400 } });
    }
    const merchant = await merchantService.createMerchant({ name });
    res.status(201).json(merchant);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const merchants = await merchantService.listMerchants();
    res.json(merchants);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const merchant = await merchantService.getMerchantById(Number(req.params.id));
    res.json(merchant);
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
    const merchant = await merchantService.updateMerchantStatus(Number(req.params.id), status);
    res.json(merchant);
  } catch (err) {
    next(err);
  }
});

export default router;
