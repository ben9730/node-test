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
