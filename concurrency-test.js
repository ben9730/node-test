const http = require('http');

function charge(amount, requestId) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      wallet_id: 1,
      merchant_id: 1,
      amount: amount,
      currency: 'ILS',
      client_request_id: requestId,
    });

    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/transactions/charge',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });

    req.write(body);
    req.end();
  });
}

async function run() {
  // First set wallet balance to 100
  console.log('=== Concurrency Test ===');
  console.log('Wallet balance: 100 ILS');
  console.log('Firing two charges of 80 ILS at the same time...\n');

  // Fire both at exactly the same time
  const [result1, result2] = await Promise.all([
    charge('80.00', 'concurrent-1'),
    charge('80.00', 'concurrent-2'),
  ]);

  console.log('Request 1:', result1.status === 201 ? 'SUCCESS' : 'DECLINED', '| HTTP', result1.status);
  if (result1.status === 201) console.log('  tx id:', result1.body.id, '| amount:', result1.body.amount);
  else console.log('  reason:', result1.body.error?.code);

  console.log('Request 2:', result2.status === 201 ? 'SUCCESS' : 'DECLINED', '| HTTP', result2.status);
  if (result2.status === 201) console.log('  tx id:', result2.body.id, '| amount:', result2.body.amount);
  else console.log('  reason:', result2.body.error?.code);

  // Check final balance
  const walletRes = await new Promise((resolve) => {
    http.get('http://localhost:3000/api/wallets/1', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
  });

  console.log('\nFinal wallet balance:', walletRes.balance);

  const balance = parseFloat(walletRes.balance);
  if (balance >= 0 && balance === 20) {
    console.log('✅ PASS — Only one charge went through (100 - 80 = 20)');
  } else if (balance >= 0 && balance === 100) {
    console.log('✅ PASS — Both were declined (balance unchanged)');
  } else if (balance < 0) {
    console.log('❌ FAIL — Wallet was overdrawn!', balance);
  } else {
    console.log('ℹ️  Balance is', balance, '— check results above');
  }
}

run();
