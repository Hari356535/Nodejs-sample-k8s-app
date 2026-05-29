'use strict';

const http = require('http');

// Simple smoke test – starts the app and hits /health
process.env.PORT = '3099';

const app = require('./index');

const req = http.get('http://localhost:3099/health', (res) => {
  let body = '';
  res.on('data', (chunk) => (body += chunk));
  res.on('end', () => {
    const parsed = JSON.parse(body);
    if (parsed.status !== 'healthy') {
      console.error('FAIL: /health did not return healthy');
      process.exit(1);
    }
    console.log('PASS: /health returned healthy');
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('FAIL: test timed out');
  process.exit(1);
}, 5000);
