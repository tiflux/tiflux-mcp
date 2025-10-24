const https = require('https');

const apiKey = process.env.TIFLUX_API_KEY;

const data = JSON.stringify({
  desk_id: 38963,
  services_catalogs_item_id: 1388284
});

console.log('Payload:', data);
console.log('Payload length:', Buffer.byteLength(data));

const options = {
  hostname: 'api.tiflux.com',
  port: 443,
  path: '/api/v2/tickets/80850',
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = https.request(options, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', JSON.stringify(res.headers, null, 2));

  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    console.log('Response body:', body.substring(0, 500));
    if (res.statusCode >= 400) {
      console.log('ERROR!');
      try {
        const parsed = JSON.parse(body);
        console.log('Error detail:', JSON.stringify(parsed, null, 2));
      } catch (e) {
        // ignore
      }
    } else {
      console.log('SUCCESS!');
    }
  });
});

req.on('error', (error) => {
  console.error('Request error:', error);
});

req.write(data);
req.end();
