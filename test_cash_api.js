const http = require('http');

const req = http.get('http://localhost:3001/api/cash/transactions', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('✓ Cash Transactions API Response:');
      console.log('\n--- SUMMARY ---');
      console.log(JSON.stringify(json.summary, null, 2));
      console.log('\n--- TRANSACTION COUNT ---');
      console.log('Total transactions:', json.transactions?.length || 0);
      if (json.transactions?.length > 0) {
        console.log('First transaction:', JSON.stringify(json.transactions[0], null, 2));
      }
    } catch (e) {
      console.error('JSON parse error:', e.message);
      console.log('Raw response:', data.substring(0, 500));
    }
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.error('Request error:', err.message);
  process.exit(1);
});

req.setTimeout(10000, () => {
  req.abort();
  console.error('Request timeout');
  process.exit(1);
});
