require('dotenv').config();
const knex = require('knex')({ client: 'pg', connection: process.env.DATABASE_URL });

async function run() {
  const tables = ['wallets', 'merchants', 'transactions', 'ledger_entries'];

  for (const table of tables) {
    console.log('\n=== ' + table.toUpperCase() + ' ===');
    const res = await knex.raw(
      "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = ? ORDER BY ordinal_position",
      [table]
    );
    res.rows.forEach(c => {
      console.log('  ' + c.column_name.padEnd(32) + c.data_type.padEnd(20) + (c.is_nullable === 'NO' ? 'NOT NULL' : 'nullable'));
    });
  }

  console.log('\n=== CONSTRAINTS (named ones) ===');
  const cons = await knex.raw(
    "SELECT table_name, constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_schema = 'public' AND constraint_name NOT LIKE '2200%' ORDER BY table_name, constraint_type"
  );
  cons.rows.forEach(c => {
    console.log('  ' + c.table_name.padEnd(20) + c.constraint_type.padEnd(15) + c.constraint_name);
  });

  knex.destroy();
}

run();
