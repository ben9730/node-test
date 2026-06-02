# PayPlus Wallet Transaction API

A backend REST API for managing wallets, merchants, and payments.

**Stack:** Node.js · TypeScript · Express · PostgreSQL · Knex

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Create the database
Open pgAdmin or psql and run:
```sql
CREATE DATABASE payplus;
```

### 3. Set your credentials
Edit the `.env` file:
```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/payplus
PORT=3000
```

### 4. Create the tables
```bash
npm run migrate
```

### 5. Start the server
```bash
npm run dev
```

The API is now running at `http://localhost:3000`

---

## How It Works

The system has 4 entities:

- **Merchant** — a business that charges wallets (e.g. a shop)
- **Wallet** — holds money for an employee or company
- **Transaction** — a charge or refund on a wallet
- **Ledger Entry** — an automatic record created for every successful money movement (audit trail)

**Typical flow:**
1. Create a merchant
2. Create a wallet with a balance
3. Charge the wallet → balance decreases, ledger entry created
4. Refund the charge → balance restored, ledger entry created

---

## API Reference

Base URL: `http://localhost:3000`

For POST/PATCH requests: set `Content-Type: application/json` in the headers.

---

### Merchants

**Create**
```
POST /api/merchants
{ "name": "Coffee Shop" }
```

**Get one**
```
GET /api/merchants/1
```

**List all**
```
GET /api/merchants
```

**Activate / Deactivate**
```
PATCH /api/merchants/1/status
{ "status": "inactive" }
```
> Inactive merchants cannot process transactions.

---

### Wallets

**Create**
```
POST /api/wallets
{ "employee_id": "emp-001", "currency": "ILS", "balance": "1000.00" }
```
Supported currencies: `ILS`, `USD`, `EUR`

**Get one** (shows current balance)
```
GET /api/wallets/1
```

**List all**
```
GET /api/wallets
```

**Activate / Deactivate**
```
PATCH /api/wallets/1/status
{ "status": "inactive" }
```
> Inactive wallets cannot be charged or refunded.

---

### Transactions

**Charge** — take money from a wallet
```
POST /api/transactions/charge
{
  "wallet_id": 1,
  "merchant_id": 1,
  "amount": "100.00",
  "currency": "ILS",
  "client_request_id": "order-12345"
}
```
> `client_request_id` prevents duplicate charges — sending the same ID twice returns the original result without charging again.

**Refund** — return money to a wallet
```
POST /api/transactions/refund
{
  "original_transaction_id": 5,
  "client_request_id": "refund-12345"
}
```
> You can only refund a successful charge. Use the `id` from the charge response.

**Get one**
```
GET /api/transactions/5
```

**List all**
```
GET /api/transactions
```

---

### Ledger Entries

The ledger is a read-only history of all money movements. Only successful transactions appear here — declined ones do not.

**All entries for a wallet**
```
GET /api/wallets/1/ledger-entries
```

**All entries for a transaction**
```
GET /api/transactions/5/ledger-entries
```

---

## When a Charge Fails

A charge returns HTTP **409** with an error explaining why:

| Code | Meaning |
|------|---------|
| `insufficient_funds` | Wallet balance is too low |
| `wallet_inactive` | Wallet has been deactivated |
| `merchant_inactive` | Merchant has been deactivated |

Example error response:
```json
{
  "error": {
    "code": "insufficient_funds",
    "message": "Wallet does not have enough available balance",
    "status": 409,
    "details": {
      "available_balance": "50.00",
      "requested_amount": "200.00"
    }
  }
}
```

> Declined transactions are still recorded in the database for audit purposes.

---

## Concurrency

If two charge requests arrive at the same time for the same wallet, only one will succeed. The system uses PostgreSQL row-level locking to guarantee the wallet can never go below zero.

---

## Assumptions

- Refunds always return the full original amount (no partial refunds)
- `client_request_id` is optional but strongly recommended to avoid duplicate charges
- Balance is stored as `DECIMAL(19,4)` for financial precision
