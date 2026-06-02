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
