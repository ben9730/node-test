import db from '../db/knex';
import { Merchant } from '../types';
import { AppError } from '../middleware/errorHandler';

export async function createMerchant(data: { name: string }): Promise<Merchant> {
  const [merchant] = await db('merchants').insert({ name: data.name }).returning('*');
  return merchant;
}

export async function getMerchantById(id: number): Promise<Merchant> {
  const merchant = await db('merchants').where({ id }).first();
  if (!merchant) {
    throw new AppError('merchant_not_found', `Merchant ${id} not found`, 404, { merchant_id: id });
  }
  return merchant;
}

export async function listMerchants(): Promise<Merchant[]> {
  return db('merchants').orderBy('created_at', 'desc');
}

export async function updateMerchantStatus(id: number, status: 'active' | 'inactive'): Promise<Merchant> {
  const merchant = await db('merchants').where({ id }).first();
  if (!merchant) {
    throw new AppError('merchant_not_found', `Merchant ${id} not found`, 404, { merchant_id: id });
  }
  const [updated] = await db('merchants')
    .where({ id })
    .update({ status, updated_at: db.fn.now() })
    .returning('*');
  return updated;
}
