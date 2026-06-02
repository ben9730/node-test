import db from '../db/knex';
import { Wallet } from '../types';
import { AppError } from '../middleware/errorHandler';

export async function createWallet(data: { employee_id: string; currency: string; balance?: string }): Promise<Wallet> {
  const [wallet] = await db('wallets')
    .insert({
      employee_id: data.employee_id,
      currency: data.currency,
      balance: data.balance ?? '0',
    })
    .returning('*');
  return wallet;
}

export async function getWalletById(id: number): Promise<Wallet> {
  const wallet = await db('wallets').where({ id }).first();
  if (!wallet) {
    throw new AppError('wallet_not_found', `Wallet ${id} not found`, 404, { wallet_id: id });
  }
  return wallet;
}

export async function listWallets(): Promise<Wallet[]> {
  return db('wallets').orderBy('created_at', 'desc');
}

export async function updateWalletStatus(id: number, status: 'active' | 'inactive'): Promise<Wallet> {
  const wallet = await db('wallets').where({ id }).first();
  if (!wallet) {
    throw new AppError('wallet_not_found', `Wallet ${id} not found`, 404, { wallet_id: id });
  }
  const [updated] = await db('wallets')
    .where({ id })
    .update({ status, updated_at: db.fn.now() })
    .returning('*');
  return updated;
}
