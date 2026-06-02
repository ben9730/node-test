# PayPlus Senior Backend Assignment — Design Spec
Date: 2026-06-02

## Overview
Build a fintech-style wallet & transaction processing REST API.
- **Stack:** Node.js + TypeScript, Express, PostgreSQL, Knex (query builder)
- **Pattern:** Flat service layer — `routes → service → db (Knex)`
- **Time limit:** 3 hours

---

## Project Structure

```
src/
  routes/
    merchants.ts          # /api/merchants CRUD + status
    wallets.ts            # /api/wallets CRUD + status
    transactions.ts       # /api/transactions/charge, /refund, /:id, list
    ledger.ts             # /api/wallets/:id/ledger-entries, /api/transactions/:id/ledger-entries
  services/
    merchantService.ts
    walletService.ts
    transactionService.ts
  db/
    knex.ts               # Knex connection (pg driver, reads DATABASE_URL from env)
    migrations/
      001_create_wallets.ts
      002_create_merchants.ts
      003_create_transactions.ts
      004_create_ledger_entries.ts
  types/
    index.ts              # TypeScript interfaces: Wallet, Merchant, Transaction, LedgerEntry
  middleware/
    errorHandler.ts       # formats all errors into required structured format
    validate.ts           # request body validation helper
  app.ts                  # Express app, mounts all routes, attaches errorHandler
  server.ts               # binds to PORT, starts listening
.env.example              # DATABASE_URL, PORT
knexfile.ts               # knex migration config
tsconfig.json
package.json
```

---

## Data Models

### wallets
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL PRIMARY KEY | |
| employee_id | VARCHAR(255) | NOT NULL |
| currency | VARCHAR(3) | NOT NULL, CHECK in ('ILS','USD','EUR') |
| balance | DECIMAL(19,4) | NOT NULL DEFAULT 0, CHECK >= 0 |
| status | VARCHAR(10) | NOT NULL DEFAULT 'active', CHECK in ('active','inactive') |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

### merchants
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL PRIMARY KEY | |
| name | VARCHAR(255) | NOT NULL |
| status | VARCHAR(10) | NOT NULL DEFAULT 'active', CHECK in ('active','inactive') |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

### transactions
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL PRIMARY KEY | |
| wallet_id | INTEGER | NOT NULL, FK → wallets.id |
| merchant_id | INTEGER | NOT NULL, FK → merchants.id |
| type | VARCHAR(10) | NOT NULL, CHECK in ('charge','refund') |
| amount | DECIMAL(19,4) | NOT NULL, CHECK > 0 |
| currency | VARCHAR(3) | NOT NULL |
| status | VARCHAR(10) | NOT NULL, CHECK in ('success','declined') |
| decline_reason | TEXT | NULLABLE |
| original_transaction_id | INTEGER | NULLABLE, FK → transactions.id |
| client_request_id | VARCHAR(255) | UNIQUE, NULLABLE (idempotency key) |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

### ledger_entries
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL PRIMARY KEY | |
| wallet_id | INTEGER | NOT NULL, FK → wallets.id |
| transaction_id | INTEGER | NOT NULL, FK → transactions.id |
| type | VARCHAR(10) | NOT NULL, CHECK in ('charge','refund') |
| amount | DECIMAL(19,4) | NOT NULL, CHECK > 0 |
| currency | VARCHAR(3) | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

**Unique constraint:** `(transaction_id, type)` on ledger_entries — no duplicate ledger entry for same transaction action.

**No updated_at on ledger_entries** — append-only, immutable.

---

## Required APIs

### Merchant APIs
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/merchants | Create merchant |
| GET | /api/merchants/:id | Get merchant by id |
| GET | /api/merchants | List merchants |
| PATCH | /api/merchants/:id/status | Activate/inactivate merchant |

### Wallet APIs
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/wallets | Create wallet |
| GET | /api/wallets/:id | Get wallet by id (include balance) |
| GET | /api/wallets | List wallets |
| PATCH | /api/wallets/:id/status | Activate/inactivate wallet |

### Transaction APIs
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/transactions/charge | Create charge transaction |
| POST | /api/transactions/refund | Create refund transaction |
| GET | /api/transactions/:id | Get transaction by id |
| GET | /api/transactions | List transactions |

### Ledger APIs
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/wallets/:id/ledger-entries | List ledger entries for a wallet |
| GET | /api/transactions/:id/ledger-entries | List ledger entries for a transaction |

---

## Business Rules

### Charge flow
1. Validate request body (wallet_id, merchant_id, amount, currency, client_request_id)
2. Check idempotency: if client_request_id exists, return existing transaction
3. Lock wallet row: `SELECT * FROM wallets WHERE id = ? FOR UPDATE` (inside a Knex transaction)
4. Check wallet status = 'active' → else decline with `wallet_inactive`
5. Check merchant status = 'active' → else decline with `merchant_inactive`
6. Check wallet.balance >= amount → else decline with `insufficient_funds`
7. Deduct balance: `UPDATE wallets SET balance = balance - amount`
8. Insert transaction row with status = 'success'
9. Insert ledger_entry row with type = 'charge'
10. Commit DB transaction, return transaction

### Refund flow
1. Validate request body (original_transaction_id, client_request_id)
2. Check idempotency
3. Fetch original transaction — must exist, must be type 'charge', must be status 'success'
4. Lock wallet row FOR UPDATE (inside Knex transaction)
5. Check wallet status = 'active'
6. Check merchant status = 'active'
7. Credit balance: `UPDATE wallets SET balance = balance + amount`
8. Insert transaction row with type = 'refund', status = 'success', original_transaction_id set
9. Insert ledger_entry row with type = 'refund'
10. Commit, return transaction

### Decline behavior
- Declined transactions are inserted with status = 'declined', decline_reason set
- No ledger entry is created for declined transactions
- No balance change for declined transactions

---

## Concurrency Handling (Critical)
Use PostgreSQL row-level locking via `SELECT ... FOR UPDATE` on the wallet row inside a database transaction. This serializes concurrent charge/refund requests on the same wallet — only one runs at a time, preventing overdraft.

```typescript
await knex.transaction(async (trx) => {
  const wallet = await trx('wallets').where({ id: wallet_id }).forUpdate().first();
  // all checks and updates happen inside trx
});
```

---

## Required Structured Error Format
All errors must use this format:
```json
{
  "error": {
    "code": "insufficient_funds",
    "message": "Wallet does not have enough available balance",
    "status": 409,
    "details": {
      "wallet_id": 1,
      "available_balance": "50.00",
      "requested_amount": "120.50"
    }
  }
}
```

A custom `AppError` class carries `code`, `message`, `status`, `details`.
The `errorHandler` middleware catches all errors and formats them.

---

## TypeScript Interfaces (types/index.ts)
```typescript
interface Wallet {
  id: number;
  employee_id: string;
  currency: string;
  balance: string; // DECIMAL comes back as string from pg
  status: 'active' | 'inactive';
  created_at: Date;
  updated_at: Date;
}

interface Merchant {
  id: number;
  name: string;
  status: 'active' | 'inactive';
  created_at: Date;
  updated_at: Date;
}

interface Transaction {
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

interface LedgerEntry {
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

## Environment Variables
```
DATABASE_URL=postgresql://user:pass@localhost:5432/payplus
PORT=3000
```

---

## Implementation Steps (for resuming with any tool)

### Step 1 — Init project
```bash
npm init -y
npm install express knex pg dotenv
npm install -D typescript @types/express @types/node ts-node knex
npx tsc --init
```
Set `tsconfig.json`: `"target": "ES2020"`, `"module": "commonjs"`, `"outDir": "./dist"`, `"rootDir": "./src"`, `"strict": true`

### Step 2 — Create src/db/knex.ts
Knex instance using `DATABASE_URL` env var, client: 'pg'.

### Step 3 — Create knexfile.ts
Point to `src/db/migrations/`, use same DATABASE_URL.

### Step 4 — Write migrations (run in order)
- `001_create_wallets.ts` — wallets table with all constraints
- `002_create_merchants.ts` — merchants table
- `003_create_transactions.ts` — transactions table with FK, unique client_request_id
- `004_create_ledger_entries.ts` — ledger_entries with unique (transaction_id, type)

### Step 5 — Create src/types/index.ts
All TypeScript interfaces as listed above.

### Step 6 — Create src/middleware/errorHandler.ts
Custom AppError class + Express error middleware that formats to required JSON.

### Step 7 — Create src/services/merchantService.ts
Functions: createMerchant, getMerchantById, listMerchants, updateMerchantStatus

### Step 8 — Create src/routes/merchants.ts
Mount all 4 merchant routes, call service functions.

### Step 9 — Create src/services/walletService.ts
Functions: createWallet, getWalletById, listWallets, updateWalletStatus

### Step 10 — Create src/routes/wallets.ts
Mount all 4 wallet routes.

### Step 11 — Create src/services/transactionService.ts
Functions: charge, refund, getTransactionById, listTransactions
- charge and refund use knex.transaction() + forUpdate() for concurrency
- Idempotency check first in both
- Decline logic inserts declined transaction without ledger entry

### Step 12 — Create src/routes/transactions.ts
Mount all 4 transaction routes.

### Step 13 — Create src/routes/ledger.ts
GET /api/wallets/:id/ledger-entries
GET /api/transactions/:id/ledger-entries

### Step 14 — Create src/app.ts
Express app, mount all routers, attach errorHandler last.

### Step 15 — Create src/server.ts
Listen on PORT from env.

### Step 16 — Run migrations and test
```bash
npx knex migrate:latest --knexfile knexfile.ts
npx ts-node src/server.ts
```
Test all endpoints with curl or Postman.

---

## Key Implementation Notes
- Always use `knex.transaction()` with `.forUpdate()` for charge and refund — this is the concurrency fix
- DECIMAL columns come back as strings from `pg` driver — keep them as strings, don't parseFloat
- Declined transactions still get inserted to DB (with status='declined'), just no ledger entry and no balance change
- Idempotency: check client_request_id at the start of charge/refund before any locking
- Error codes to implement: `insufficient_funds`, `wallet_inactive`, `merchant_inactive`, `wallet_not_found`, `merchant_not_found`, `transaction_not_found`, `invalid_refund` (refunding non-charge or non-success tx), `idempotency_conflict`
