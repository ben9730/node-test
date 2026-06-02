# PayPlus Backend Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fintech wallet & transaction REST API with merchants, wallets, transactions, ledger entries, idempotency, and concurrency-safe balance handling.

**Architecture:** Flat service layer — routes call service functions which use Knex to query PostgreSQL directly. No ORM magic, full control over transactions and locking.

**Tech Stack:** Node.js, TypeScript, Express, PostgreSQL, Knex (pg driver), dotenv

---

## File Map

| File | Purpose |
|------|---------|
| `package.json` | dependencies |
| `tsconfig.json` | TypeScript config |
| `knexfile.ts` | Knex migration config |
| `.env.example` | env var template |
| `src/server.ts` | HTTP server entry point |
| `src/app.ts` | Express app, routes, error handler |
| `src/types/index.ts` | TypeScript interfaces |
| `src/db/knex.ts` | Knex singleton |
| `src/db/migrations/001_create_wallets.ts` | wallets table |
| `src/db/migrations/002_create_merchants.ts` | merchants table |
| `src/db/migrations/003_create_transactions.ts` | transactions table |
| `src/db/migrations/004_create_ledger_entries.ts` | ledger_entries table |
| `src/middleware/errorHandler.ts` | AppError class + Express error middleware |
| `src/services/merchantService.ts` | merchant CRUD logic |
| `src/services/walletService.ts` | wallet CRUD logic |
| `src/services/transactionService.ts` | charge, refund, concurrency, idempotency |
| `src/routes/merchants.ts` | /api/merchants routes |
| `src/routes/wallets.ts` | /api/wallets routes |
| `src/routes/transactions.ts` | /api/transactions routes |
| `src/routes/ledger.ts` | ledger-entries routes |

---

### Task 1: Initialize project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `knexfile.ts`

- [ ] **Step 1: Run npm init and install dependencies**

```bash
cd "C:\Users\zeass\Desktop\ben code\node test"
npm init -y
npm install express knex pg dotenv
npm install -D typescript @types/express @types/node ts-node
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*", "knexfile.ts"]
}
```

- [ ] **Step 3: Create .env.example**

```
DATABASE_URL=postgresql://postgres:password@localhost:5432/payplus
PORT=3000
```

- [ ] **Step 4: Create .env (your actual local values)**

Copy `.env.example` to `.env` and fill in your real PostgreSQL credentials.

- [ ] **Step 5: Create knexfile.ts**

```typescript
import type { Knex } from 'knex';
import dotenv from 'dotenv';
dotenv.config();

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: './src/db/migrations',
      extension: 'ts',
    },
  },
};

export default config;
```

- [ ] **Step 6: Add scripts to package.json**

Open `package.json` and replace the `"scripts"` section with:

```json
"scripts": {
  "dev": "ts-node src/server.ts",
  "migrate": "knex migrate:latest --knexfile knexfile.ts",
  "migrate:rollback": "knex migrate:rollback --knexfile knexfile.ts"
}
```

- [ ] **Step 7: Create PostgreSQL database**

```bash
psql -U postgres -c "CREATE DATABASE payplus;"
```

---

### Task 2: Database connection and types

**Files:**
- Create: `src/db/knex.ts`
- Create: `src/types/index.ts`

- [ ] **Step 1: Create src/db/knex.ts**

```typescript
import knex from 'knex';
import dotenv from 'dotenv';
dotenv.config();

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL,
});

export default db;
```

- [ ] **Step 2: Create src/types/index.ts**

```typescript
export interface Wallet {
  id: number;
  employee_id: string;
  currency: string;
  balance: string;
  status: 'active' | 'inactive';
  created_at: Date;
  updated_at: Date;
}

export interface Merchant {
  id: number;
  name: string;
  status: 'active' | 'inactive';
  created_at: Date;
  updated_at: Date;
}

export interface Transaction {
  id: number;
  wallet_id: number;
  merchant_id: number;
  type: 'charge' | 'refund';
  amount: string;
  currency: string;
  status: 'success' | 'declined';
  decline_reason: string | null;
  original_transaction_id: number | null;
  client_request_id: string | null;
  created_at: Date;
}

export interface LedgerEntry {
  id: number;
  wallet_id: number;
  transaction_id: number;
  type: 'charge' | 'refund';
  amount: string;
  currency: string;
  created_at: Date;
}
```

---

### Task 3: Migrations

**Files:**
- Create: `src/db/migrations/001_create_wallets.ts`
- Create: `src/db/migrations/002_create_merchants.ts`
- Create: `src/db/migrations/003_create_transactions.ts`
- Create: `src/db/migrations/004_create_ledger_entries.ts`

- [ ] **Step 1: Create 001_create_wallets.ts**

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('wallets', (table) => {
    table.increments('id').primary();
    table.string('employee_id', 255).notNullable();
    table.string('currency', 3).notNullable();
    table.decimal('balance', 19, 4).notNullable().defaultTo(0);
    table.string('status', 10).notNullable().defaultTo('active');
    table.timestamps(true, true);
  });

  await knex.raw(`ALTER TABLE wallets ADD CONSTRAINT wallets_currency_check CHECK (currency IN ('ILS', 'USD', 'EUR'))`);
  await knex.raw(`ALTER TABLE wallets ADD CONSTRAINT wallets_balance_check CHECK (balance >= 0)`);
  await knex.raw(`ALTER TABLE wallets ADD CONSTRAINT wallets_status_check CHECK (status IN ('active', 'inactive'))`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('wallets');
}
```

- [ ] **Step 2: Create 002_create_merchants.ts**

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('merchants', (table) => {
    table.increments('id').primary();
    table.string('name', 255).notNullable();
    table.string('status', 10).notNullable().defaultTo('active');
    table.timestamps(true, true);
  });

  await knex.raw(`ALTER TABLE merchants ADD CONSTRAINT merchants_status_check CHECK (status IN ('active', 'inactive'))`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('merchants');
}
```

- [ ] **Step 3: Create 003_create_transactions.ts**

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('transactions', (table) => {
    table.increments('id').primary();
    table.integer('wallet_id').notNullable().references('id').inTable('wallets');
    table.integer('merchant_id').notNullable().references('id').inTable('merchants');
    table.string('type', 10).notNullable();
    table.decimal('amount', 19, 4).notNullable();
    table.string('currency', 3).notNullable();
    table.string('status', 10).notNullable();
    table.text('decline_reason').nullable();
    table.integer('original_transaction_id').nullable().references('id').inTable('transactions');
    table.string('client_request_id', 255).nullable().unique();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`ALTER TABLE transactions ADD CONSTRAINT transactions_type_check CHECK (type IN ('charge', 'refund'))`);
  await knex.raw(`ALTER TABLE transactions ADD CONSTRAINT transactions_status_check CHECK (status IN ('success', 'declined'))`);
  await knex.raw(`ALTER TABLE transactions ADD CONSTRAINT transactions_amount_check CHECK (amount > 0)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('transactions');
}
```

- [ ] **Step 4: Create 004_create_ledger_entries.ts**

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('ledger_entries', (table) => {
    table.increments('id').primary();
    table.integer('wallet_id').notNullable().references('id').inTable('wallets');
    table.integer('transaction_id').notNullable().references('id').inTable('transactions');
    table.string('type', 10).notNullable();
    table.decimal('amount', 19, 4).notNullable();
    table.string('currency', 3).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['transaction_id', 'type']);
  });

  await knex.raw(`ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_type_check CHECK (type IN ('charge', 'refund'))`);
  await knex.raw(`ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_amount_check CHECK (amount > 0)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('ledger_entries');
}
```

- [ ] **Step 5: Run migrations**

```bash
npm run migrate
```

Expected output:
```
Batch 1 run: 4 migrations
```

---

### Task 4: Error handler middleware

**Files:**
- Create: `src/middleware/errorHandler.ts`

- [ ] **Step 1: Create src/middleware/errorHandler.ts**

```typescript
import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public status: number,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        status: err.status,
        ...(err.details && { details: err.details }),
      },
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'An unexpected error occurred',
      status: 500,
    },
  });
}
```

---

### Task 5: Merchant service and routes

**Files:**
- Create: `src/services/merchantService.ts`
- Create: `src/routes/merchants.ts`

- [ ] **Step 1: Create src/services/merchantService.ts**

```typescript
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
```

- [ ] **Step 2: Create src/routes/merchants.ts**

```typescript
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
```

---

### Task 6: Wallet service and routes

**Files:**
- Create: `src/services/walletService.ts`
- Create: `src/routes/wallets.ts`

- [ ] **Step 1: Create src/services/walletService.ts**

```typescript
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
```

- [ ] **Step 2: Create src/routes/wallets.ts**

```typescript
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
```

---

### Task 7: Transaction service (charge + refund with concurrency)

**Files:**
- Create: `src/services/transactionService.ts`

- [ ] **Step 1: Create src/services/transactionService.ts**

```typescript
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

    // Business rule checks — decline if violated
    if (wallet.status === 'inactive') {
      const [tx] = await trx('transactions').insert({
        wallet_id: data.wallet_id,
        merchant_id: data.merchant_id,
        type: 'charge',
        amount: data.amount,
        currency: data.currency,
        status: 'declined',
        decline_reason: 'wallet_inactive',
        client_request_id: data.client_request_id ?? null,
      }).returning('*');
      return tx;
    }

    if (merchant.status === 'inactive') {
      const [tx] = await trx('transactions').insert({
        wallet_id: data.wallet_id,
        merchant_id: data.merchant_id,
        type: 'charge',
        amount: data.amount,
        currency: data.currency,
        status: 'declined',
        decline_reason: 'merchant_inactive',
        client_request_id: data.client_request_id ?? null,
      }).returning('*');
      return tx;
    }

    const balance = parseFloat(wallet.balance);
    const amount = parseFloat(data.amount);

    if (balance < amount) {
      const [tx] = await trx('transactions').insert({
        wallet_id: data.wallet_id,
        merchant_id: data.merchant_id,
        type: 'charge',
        amount: data.amount,
        currency: data.currency,
        status: 'declined',
        decline_reason: 'insufficient_funds',
        client_request_id: data.client_request_id ?? null,
      }).returning('*');
      return tx;
    }

    // Deduct balance
    await trx('wallets')
      .where({ id: data.wallet_id })
      .update({ balance: db.raw('balance - ?', [data.amount]), updated_at: db.fn.now() });

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
      const [tx] = await trx('transactions').insert({
        wallet_id: original.wallet_id,
        merchant_id: original.merchant_id,
        type: 'refund',
        amount: original.amount,
        currency: original.currency,
        status: 'declined',
        decline_reason: 'wallet_inactive',
        original_transaction_id: data.original_transaction_id,
        client_request_id: data.client_request_id ?? null,
      }).returning('*');
      return tx;
    }

    if (merchant.status === 'inactive') {
      const [tx] = await trx('transactions').insert({
        wallet_id: original.wallet_id,
        merchant_id: original.merchant_id,
        type: 'refund',
        amount: original.amount,
        currency: original.currency,
        status: 'declined',
        decline_reason: 'merchant_inactive',
        original_transaction_id: data.original_transaction_id,
        client_request_id: data.client_request_id ?? null,
      }).returning('*');
      return tx;
    }

    // Credit balance
    await trx('wallets')
      .where({ id: original.wallet_id })
      .update({ balance: db.raw('balance + ?', [original.amount]), updated_at: db.fn.now() });

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
```

---

### Task 8: Transaction routes and ledger routes

**Files:**
- Create: `src/routes/transactions.ts`
- Create: `src/routes/ledger.ts`

- [ ] **Step 1: Create src/routes/transactions.ts**

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import * as transactionService from '../services/transactionService';

const router = Router();

router.post('/charge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { wallet_id, merchant_id, amount, currency, client_request_id } = req.body;
    if (!wallet_id || !merchant_id || !amount || !currency) {
      return res.status(400).json({ error: { code: 'validation_error', message: 'wallet_id, merchant_id, amount, and currency are required', status: 400 } });
    }
    const tx = await transactionService.charge({ wallet_id: Number(wallet_id), merchant_id: Number(merchant_id), amount: String(amount), currency, client_request_id });
    const statusCode = tx.status === 'success' ? 201 : 422;
    res.status(statusCode).json(tx);
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
    const tx = await transactionService.refund({ original_transaction_id: Number(original_transaction_id), client_request_id });
    const statusCode = tx.status === 'success' ? 201 : 422;
    res.status(statusCode).json(tx);
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
```

- [ ] **Step 2: Create src/routes/ledger.ts**

```typescript
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
```

---

### Task 9: App and server wiring

**Files:**
- Create: `src/app.ts`
- Create: `src/server.ts`

- [ ] **Step 1: Create src/app.ts**

```typescript
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
```

- [ ] **Step 2: Create src/server.ts**

```typescript
import dotenv from 'dotenv';
dotenv.config();

import app from './app';

const PORT = process.env.PORT ?? 3000;

app.listen(PORT, () => {
  console.log(`PayPlus API running on http://localhost:${PORT}`);
});
```

- [ ] **Step 3: Start the server**

```bash
npm run dev
```

Expected output:
```
PayPlus API running on http://localhost:3000
```

---

### Task 10: Manual smoke test all endpoints

- [ ] **Step 1: Create a merchant**

```bash
curl -s -X POST http://localhost:3000/api/merchants \
  -H "Content-Type: application/json" \
  -d '{"name": "Acme Corp"}' | jq .
```

Expected: `{ "id": 1, "name": "Acme Corp", "status": "active", ... }`

- [ ] **Step 2: Create a wallet**

```bash
curl -s -X POST http://localhost:3000/api/wallets \
  -H "Content-Type: application/json" \
  -d '{"employee_id": "emp-001", "currency": "ILS", "balance": "500.00"}' | jq .
```

Expected: `{ "id": 1, "employee_id": "emp-001", "currency": "ILS", "balance": "500.0000", "status": "active", ... }`

- [ ] **Step 3: Charge the wallet**

```bash
curl -s -X POST http://localhost:3000/api/transactions/charge \
  -H "Content-Type: application/json" \
  -d '{"wallet_id": 1, "merchant_id": 1, "amount": "80.00", "currency": "ILS", "client_request_id": "req-001"}' | jq .
```

Expected: `{ "id": 1, "type": "charge", "status": "success", "amount": "80.0000", ... }`

- [ ] **Step 4: Test insufficient funds (concurrency scenario)**

```bash
curl -s -X POST http://localhost:3000/api/transactions/charge \
  -H "Content-Type: application/json" \
  -d '{"wallet_id": 1, "merchant_id": 1, "amount": "450.00", "currency": "ILS", "client_request_id": "req-002"}' | jq .
```

Expected: `{ "status": "declined", "decline_reason": "insufficient_funds", ... }` (balance is 420 after first charge)

- [ ] **Step 5: Test idempotency — repeat req-001**

```bash
curl -s -X POST http://localhost:3000/api/transactions/charge \
  -H "Content-Type: application/json" \
  -d '{"wallet_id": 1, "merchant_id": 1, "amount": "80.00", "currency": "ILS", "client_request_id": "req-001"}' | jq .
```

Expected: same transaction as Step 3 returned, no second deduction

- [ ] **Step 6: Refund the charge**

```bash
curl -s -X POST http://localhost:3000/api/transactions/refund \
  -H "Content-Type: application/json" \
  -d '{"original_transaction_id": 1, "client_request_id": "refund-001"}' | jq .
```

Expected: `{ "type": "refund", "status": "success", ... }`

- [ ] **Step 7: Check wallet balance is restored**

```bash
curl -s http://localhost:3000/api/wallets/1 | jq .balance
```

Expected: `"500.0000"`

- [ ] **Step 8: Check ledger entries**

```bash
curl -s http://localhost:3000/api/wallets/1/ledger-entries | jq .
```

Expected: 2 entries — one charge, one refund

- [ ] **Step 9: Test inactive wallet is declined**

```bash
curl -s -X PATCH http://localhost:3000/api/wallets/1/status \
  -H "Content-Type: application/json" \
  -d '{"status": "inactive"}'

curl -s -X POST http://localhost:3000/api/transactions/charge \
  -H "Content-Type: application/json" \
  -d '{"wallet_id": 1, "merchant_id": 1, "amount": "10.00", "currency": "ILS", "client_request_id": "req-003"}' | jq .status
```

Expected: `"declined"`

- [ ] **Step 10: Test 404 error format**

```bash
curl -s http://localhost:3000/api/wallets/9999 | jq .
```

Expected:
```json
{ "error": { "code": "wallet_not_found", "message": "Wallet 9999 not found", "status": 404, "details": { "wallet_id": 9999 } } }
```

---

## Resume Instructions (if tokens run out)

If you need to continue in a new session, share this information with the AI:

**Project:** PayPlus Senior Backend Assignment  
**Stack:** Node.js + TypeScript + Express + PostgreSQL + Knex  
**Working directory:** `C:\Users\zeass\Desktop\ben code\node test`  
**Design spec:** `docs/superpowers/specs/2026-06-02-payplus-design.md`  
**This plan:** `docs/superpowers/plans/2026-06-02-payplus-implementation.md`  

Check off completed tasks above, then tell the AI: "Continue from Task N" and paste the task content.
