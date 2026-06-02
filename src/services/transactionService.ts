import db from '../db/knex';
import { Transaction, LedgerEntry } from '../types';
import { AppError } from '../middleware/errorHandler';

export async function charge(data: {
  wallet_id: number;
  merchant_id: number;
  amount: string;
  currency: string;
  client_request_id?: string;
}): Promise<Transaction> {
  // Idempotency check — before locking
  if (data.client_request_id) {
    const existing = await db('transactions').where({ client_request_id: data.client_request_id }).first();
    if (existing) return existing;
  }

  return db.transaction(async (trx) => {
    // Lock wallet row to prevent concurrent overdraft
    const wallet = await trx('wallets').where({ id: data.wallet_id }).forUpdate().first();
    if (!wallet) {
      throw new AppError('wallet_not_found', `Wallet ${data.wallet_id} not found`, 404, { wallet_id: data.wallet_id });
    }

    const merchant = await trx('merchants').where({ id: data.merchant_id }).first();
    if (!merchant) {
      throw new AppError('merchant_not_found', `Merchant ${data.merchant_id} not found`, 404, { merchant_id: data.merchant_id });
    }

    if (wallet.status === 'inactive') {
      await trx('transactions').insert({
        wallet_id: data.wallet_id,
        merchant_id: data.merchant_id,
        type: 'charge',
        amount: data.amount,
        currency: data.currency,
        status: 'declined',
        decline_reason: 'wallet_inactive',
        client_request_id: data.client_request_id ?? null,
      });
      throw new AppError('wallet_inactive', 'Wallet is inactive and cannot perform transactions', 409, { wallet_id: data.wallet_id });
    }

    if (merchant.status === 'inactive') {
      await trx('transactions').insert({
        wallet_id: data.wallet_id,
        merchant_id: data.merchant_id,
        type: 'charge',
        amount: data.amount,
        currency: data.currency,
        status: 'declined',
        decline_reason: 'merchant_inactive',
        client_request_id: data.client_request_id ?? null,
      });
      throw new AppError('merchant_inactive', 'Merchant is inactive and cannot process transactions', 409, { merchant_id: data.merchant_id });
    }

    const balance = parseFloat(wallet.balance);
    const amount = parseFloat(data.amount);

    if (balance < amount) {
      await trx('transactions').insert({
        wallet_id: data.wallet_id,
        merchant_id: data.merchant_id,
        type: 'charge',
        amount: data.amount,
        currency: data.currency,
        status: 'declined',
        decline_reason: 'insufficient_funds',
        client_request_id: data.client_request_id ?? null,
      });
      throw new AppError('insufficient_funds', 'Wallet does not have enough available balance', 409, {
        wallet_id: data.wallet_id,
        available_balance: wallet.balance,
        requested_amount: data.amount,
      });
    }

    // Deduct balance
    await trx('wallets')
      .where({ id: data.wallet_id })
      .update({
        balance: db.raw('balance - ?', [data.amount]),
        updated_at: db.fn.now(),
      });

    // Insert successful transaction
    const [tx] = await trx('transactions').insert({
      wallet_id: data.wallet_id,
      merchant_id: data.merchant_id,
      type: 'charge',
      amount: data.amount,
      currency: data.currency,
      status: 'success',
      client_request_id: data.client_request_id ?? null,
    }).returning('*');

    // Insert ledger entry
    await trx('ledger_entries').insert({
      wallet_id: data.wallet_id,
      transaction_id: tx.id,
      type: 'charge',
      amount: data.amount,
      currency: data.currency,
    });

    return tx;
  });
}

export async function refund(data: {
  original_transaction_id: number;
  client_request_id?: string;
}): Promise<Transaction> {
  // Idempotency check
  if (data.client_request_id) {
    const existing = await db('transactions').where({ client_request_id: data.client_request_id }).first();
    if (existing) return existing;
  }

  // Validate original transaction
  const original = await db('transactions').where({ id: data.original_transaction_id }).first();
  if (!original) {
    throw new AppError('transaction_not_found', `Transaction ${data.original_transaction_id} not found`, 404, { transaction_id: data.original_transaction_id });
  }
  if (original.type !== 'charge') {
    throw new AppError('invalid_refund', 'Can only refund a charge transaction', 422, { transaction_id: data.original_transaction_id, type: original.type });
  }
  if (original.status !== 'success') {
    throw new AppError('invalid_refund', 'Can only refund a successful transaction', 422, { transaction_id: data.original_transaction_id, status: original.status });
  }

  return db.transaction(async (trx) => {
    // Lock wallet row
    const wallet = await trx('wallets').where({ id: original.wallet_id }).forUpdate().first();
    if (!wallet) {
      throw new AppError('wallet_not_found', `Wallet ${original.wallet_id} not found`, 404, { wallet_id: original.wallet_id });
    }

    const merchant = await trx('merchants').where({ id: original.merchant_id }).first();
    if (!merchant) {
      throw new AppError('merchant_not_found', `Merchant ${original.merchant_id} not found`, 404, { merchant_id: original.merchant_id });
    }

    if (wallet.status === 'inactive') {
      await trx('transactions').insert({
        wallet_id: original.wallet_id,
        merchant_id: original.merchant_id,
        type: 'refund',
        amount: original.amount,
        currency: original.currency,
        status: 'declined',
        decline_reason: 'wallet_inactive',
        original_transaction_id: data.original_transaction_id,
        client_request_id: data.client_request_id ?? null,
      });
      throw new AppError('wallet_inactive', 'Wallet is inactive and cannot perform transactions', 409, { wallet_id: original.wallet_id });
    }

    if (merchant.status === 'inactive') {
      await trx('transactions').insert({
        wallet_id: original.wallet_id,
        merchant_id: original.merchant_id,
        type: 'refund',
        amount: original.amount,
        currency: original.currency,
        status: 'declined',
        decline_reason: 'merchant_inactive',
        original_transaction_id: data.original_transaction_id,
        client_request_id: data.client_request_id ?? null,
      });
      throw new AppError('merchant_inactive', 'Merchant is inactive and cannot process transactions', 409, { merchant_id: original.merchant_id });
    }

    // Credit balance
    await trx('wallets')
      .where({ id: original.wallet_id })
      .update({
        balance: db.raw('balance + ?', [original.amount]),
        updated_at: db.fn.now(),
      });

    // Insert refund transaction
    const [tx] = await trx('transactions').insert({
      wallet_id: original.wallet_id,
      merchant_id: original.merchant_id,
      type: 'refund',
      amount: original.amount,
      currency: original.currency,
      status: 'success',
      original_transaction_id: data.original_transaction_id,
      client_request_id: data.client_request_id ?? null,
    }).returning('*');

    // Insert ledger entry
    await trx('ledger_entries').insert({
      wallet_id: original.wallet_id,
      transaction_id: tx.id,
      type: 'refund',
      amount: original.amount,
      currency: original.currency,
    });

    return tx;
  });
}

export async function getTransactionById(id: number): Promise<Transaction> {
  const tx = await db('transactions').where({ id }).first();
  if (!tx) {
    throw new AppError('transaction_not_found', `Transaction ${id} not found`, 404, { transaction_id: id });
  }
  return tx;
}

export async function listTransactions(): Promise<Transaction[]> {
  return db('transactions').orderBy('created_at', 'desc');
}

export async function getLedgerEntriesByWallet(wallet_id: number): Promise<LedgerEntry[]> {
  return db('ledger_entries').where({ wallet_id }).orderBy('created_at', 'desc');
}

export async function getLedgerEntriesByTransaction(transaction_id: number): Promise<LedgerEntry[]> {
  return db('ledger_entries').where({ transaction_id }).orderBy('created_at', 'desc');
}
