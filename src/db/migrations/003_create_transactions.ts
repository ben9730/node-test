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
