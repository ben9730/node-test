# PayPlus Wallet Transaction API

A fintech-style backend REST API for managing wallets, merchants, transactions, and ledger entries.

Built with: **Node.js + TypeScript + Express + PostgreSQL + Knex**

---

## Requirements

- Node.js (v18+)
- PostgreSQL (v14+)

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Create the database
Open psql or pgAdmin and run:
```sql
CREATE DATABASE payplus;
```

### 3. Configure environment
Copy `.env.example` to `.env` and fill in your credentials:
```
DATABASE_URL=postgresql://postgres:postgres123@localhost:5432/payplus
PORT=3000
```

### 4. Run migrations (creates all tables)
```bash
npm run migrate
```

### 5. Start the server
```bash
npm run dev
```

Server runs at: `http://localhost:3000`

---

## API Endpoints

### Merchants
Merchants are the businesses that initiate transactions.

| Method | URL | Description |
|--------|-----|-------------|
| POST | `/api/merchants` | Create a merchant |
| GET | `/api/merchants` | List all merchants |
| GET | `/api/merchants/:id` | Get merchant by ID |
| PATCH | `/api/merchants/:id/status` | Activate or deactivate a merchant |

**Create merchant body:**
```json
{ "name": "Acme Corp" }
```

**Update status body:**
```json
{ "status": "inactive" }
```

---

### Wallets
Wallets represent employee or company funds.

| Method | URL | Description |
|--------|-----|-------------|
| POST | `/api/wallets` | Create a wallet |
| GET | `/api/wallets` | List all wallets |
| GET | `/api/wallets/:id` | Get wallet by ID (includes current balance) |
| PATCH | `/api/wallets/:id/status` | Activate or deactivate a wallet |

**Create wallet body:**
```json
{ "employee_id": "emp-001", "currency": "ILS", "balance": "1000.00" }
```

Supported currencies: `ILS`, `USD`, `EUR`

---

### Transactions
Transactions are payment operations initiated by a merchant on a wallet.

| Method | URL | Description |
|--------|-----|-------------|
| POST | `/api/transactions/charge` | Charge (deduct) money from a wallet |
| POST | `/api/transactions/refund` | Refund a previous charge |
| GET | `/api/transactions` | List all transactions |
| GET | `/api/transactions/:id` | Get transaction by ID |

**Charge body:**
```json
{
  "wallet_id": 1,
  "merchant_id": 1,
  "amount": "100.00",
  "currency": "ILS",
  "client_request_id": "unique-request-id-123"
}
```

**Refund body:**
```json
{
  "original_transaction_id": 5,
  "client_request_id": "unique-refund-id-456"
}
```

> `client_request_id` is used for **idempotency** — if you send the same request twice with the same ID, the second call returns the original result without charging again.

**Transaction status values:**
- `success` — money was moved
- `declined` — request was rejected (see `decline_reason`)

**Decline reasons:**
- `insufficient_funds` — wallet balance too low
- `wallet_inactive` — wallet is deactivated
- `merchant_inactive` — merchant is deactivated

---

### Ledger Entries
The ledger is an immutable audit trail of all money movements. Declined transactions do NOT create ledger entries.

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/wallets/:id/ledger-entries` | All ledger entries for a wallet |
| GET | `/api/transactions/:id/ledger-entries` | Ledger entries for a specific transaction |

---

## Error Format

All errors follow this structure:
```json
{
  "error": {
    "code": "insufficient_funds",
    "message": "Wallet does not have enough available balance",
    "status": 409,
    "details": {
      "wallet_id": 1,
      "available_balance": "50.00",
      "requested_amount": "120.00"
    }
  }
}
```

---

## Concurrency

Concurrent charge requests on the same wallet are handled safely using PostgreSQL row-level locking (`SELECT FOR UPDATE`). If two requests arrive at the same time, only one will succeed — the wallet can never be overdrawn.

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `wallets` | Stores wallet balance, currency, status |
| `merchants` | Stores merchant name and status |
| `transactions` | Records every charge and refund attempt |
| `ledger_entries` | Immutable financial audit trail (successful transactions only) |

---

## Assumptions

- Refunds use the same amount as the original charge (full refund only)
- A declined transaction is still recorded in the database for audit purposes
- `client_request_id` is optional but recommended for idempotency
- Balance is stored as `DECIMAL(19,4)` for financial precision
