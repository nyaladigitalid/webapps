const http = require('http');

function get(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'GET',
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.end();
    });
}

async function checkApis() {
    console.log('--- Checking /api/orders ---');
    try {
        const res = await get('/api/orders?limit=5');
        console.log('Status:', res.status);
        if (res.data.data) {
             console.log('Data Count:', res.data.data.length);
             if (res.data.data.length > 0) {
                 console.log('First Order Sample:', JSON.stringify(res.data.data[0], null, 2));
             } else {
                 console.log('No orders returned');
             }
        } else {
            console.log('Unexpected response structure:', Object.keys(res.data));
        }
    } catch (e) {
        console.error('Error fetching orders:', e.message);
    }

    console.log('\n--- Checking /api/campaigns ---');
    try {
        const res = await get('/api/campaigns?limit=5');
        console.log('Status:', res.status);
        if (res.data.data) {
             console.log('Data Count:', res.data.data.length);
             if (res.data.data.length > 0) {
                 console.log('First Campaign Sample:', JSON.stringify(res.data.data[0], null, 2));
             } else {
                 console.log('No campaigns returned (ACTIVE filter might be default?)');
             }
        } else if (Array.isArray(res.data)) {
             console.log('Data Count:', res.data.length);
             if (res.data.length > 0) {
                 console.log('First Campaign Sample:', JSON.stringify(res.data[0], null, 2));
             }
        } else {
            console.log('Unexpected response structure:', Object.keys(res.data));
        }
    } catch (e) {
        console.error('Error fetching campaigns:', e.message);
    }
}

checkApis();
