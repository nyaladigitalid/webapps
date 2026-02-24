const http = require('http');

const data = JSON.stringify({
    links: [
        { url: 'https://test-link.com/1', description: 'Test Link 1' },
        { url: 'https://test-link.com/2', description: 'Test Link 2' }
    ]
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/orders/17/content/submit',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
        console.log(`BODY: ${chunk}`);
    });
    res.on('end', () => {
        console.log('No more data in response.');
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

// write data to request body
req.write(data);
req.end();
