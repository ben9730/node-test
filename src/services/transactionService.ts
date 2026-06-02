import db from '../db/knex';
import { Transaction, LedgerEntry } from '../types';
import { AppError } from '../middleware/errorHandler';

type DeclineReason = 'wallet_inactive' | 'merchant_inactive' | 'insufficient_funds';

function throwDeclineError(reason: DeclineReason, details: Record<string, unknown>): never {
  const messages: Record<DeclineReason, string> = {
    wallet_inactive: 'Wallet is inactive and cannot perform transactions',
    merchant_inactive: 'Merchant is inactive and cannot process transactions',
    insufficient_funds: 'Wallet does not have enough available balance',
  };
  throw new AppError(reason, messages[reason], 409, details);
}

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
    if (existing) {
      if (existing.status === 'declined') {
        throwDeclineError(existing.decline_reason, { transaction_id: existing.id, decline_reason: existing.decline_reason });
      }
      return existing;
    }
  }

  // Run inside a transaction with FOR UPDATE lock to prevent concurrent overdraft.
  // We return a decline reason instead of throwing inside the transaction,
  // so the declined record can be saved AFTER the transaction commits (throwing inside
  // would roll back the insert).
  const result = await db.transaction(async (trx) => {
    const wallet = await trx('wallets').where({ id: data.wallet_id }).forUpdate().first();
    if (!wallet) {
      throw new AppError('wallet_not_found', `Wallet ${data.wallet_id} not found`, 404, { wallet_id: data.wallet_id });
    }

    const merchant = await trx('merchants').where({ id: data.merchant_id }).first();
    if (!merchant) {
      throw new AppError('merchant_not_found', `Merchant ${data.merchant_id} not found`, 404, { merchant_id: data.merchant_id });
    }

    if (wallet.status === 'inactive') {
      return { declined: 'wallet_inactive' as DeclineReason, wallet, merchant };
    }

    if (merchant.status === 'inactive') {
      return { declined: 'merchant_inactive' as DeclineReason, wallet, merchant };
    }

    if (parseFloat(wallet.balance) < parseFloat(data.amount)) {
      return { declined: 'insufficient_funds' as DeclineReason, wallet, merchant };
    }

    // Deduct balance
    await trx('wallets').where({ id: data.wallet_id }).update({
      balance: db.raw('balance - ?', [data.amount]),
      updated_at: db.fn.now(),
    });

    const [tx] = await trx('transactions').insert({
      wallet_id: data.wallet_id,
      merchant_id: data.merchant_id,
      type: 'charge',
      amount: data.amount,
      currency: data.currency,
      status: 'success',
      client_request_id: data.client_request_id ?? null,
    }).returning('*');

    await trx('ledger_entries').insert({
      wallet_id: data.wallet_id,
      transaction_id: tx.id,
      type: 'charge',
      amount: data.amount,
      currency: data.currency,
    });

    return { declined: null, tx };
  });

  // Save declined record AFTER transaction commits so it persists
  if (result.declined) {
    await db('transactions').insert({
      wallet_id: data.wallet_id,
      merchant_id: data.merchant_id,
      type: 'charge',
      amount: data.amount,
      currency: data.currency,
      status: 'declined',
      decline_reason: result.declined,
      client_request_id: data.client_request_id ?? null,
    });

    const details: Record<string, unknown> = { wallet_id: data.wallet_id };
    if (result.declined === 'insufficient_funds') {
      details.available_balance = result.wallet.balance;
      details.requested_amount = data.amount;
    }
    if (result.declined === 'merchant_inactive') {
      details.merchant_id = data.merchant_id;
    }

    throwDeclineError(result.declined, details);
  }

  return result.tx!;
}

export async function refund(data: {
  original_transaction_id: number;
  client_request_id?: string;
}): Promise<Transaction> {
  // Idempotency check
  if (data.client_request_id) {
    const existing = await db('transactions').where({ client_request_id: data.client_request_id }).first();
    if (existing) {
      if (existing.status === 'declined') {
        throwDeclineError(existing.decline_reason, { transaction_id: existing.id, decline_reason: existing.decline_reason });
      }
      return existing;
    }
  }

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

  const result = await db.transaction(async (trx) => {
    const wallet = await trx('wallets').where({ id: original.wallet_id }).forUpdate().first();
    if (!wallet) {
      throw new AppError('wallet_not_found', `Wallet ${original.wallet_id} not found`, 404, { wallet_id: original.wallet_id });
    }

    const merchant = await trx('merchants').where({ id: original.merchant_id }).first();
    if (!merchant) {
      throw new AppError('merchant_not_found', `Merchant ${original.merchant_id} not found`, 404, { merchant_id: original.merchant_id });
    }

    if (wallet.status === 'inactive') {
      return { declined: 'wallet_inactive' as DeclineReason, wallet };
    }

    if (merchant.status === 'inactive') {
      return { declined: 'merchant_inactive' as DeclineReason, wallet };
    }

    await trx('wallets').where({ id: original.wallet_id }).update({
      balance: db.raw('balance + ?', [original.amount]),
      updated_at: db.fn.now(),
    });

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

    await trx('ledger_entries').insert({
      wallet_id: original.wallet_id,
      transaction_id: tx.id,
      type: 'refund',
      amount: original.amount,
      currency: original.currency,
    });

    return { declined: null, tx };
  });

  if (result.declined) {
    await db('transactions').insert({
      wallet_id: original.wallet_id,
      merchant_id: original.merchant_id,
      type: 'refund',
      amount: original.amount,
      currency: original.currency,
      status: 'declined',
      decline_reason: result.declined,
      original_transaction_id: data.original_transaction_id,
      client_request_id: data.client_request_id ?? null,
    });

    throwDeclineError(result.declined, { wallet_id: original.wallet_id });
  }

  return result.tx!;
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
