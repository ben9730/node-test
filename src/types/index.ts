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
