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
