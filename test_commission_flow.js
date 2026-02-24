const fetch = globalThis.fetch;

// Helper function for fetch requests
async function makeRequest(url, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (body) options.body = JSON.stringify(body);
    
    try {
        const response = await fetch(url, options);
        const data = await response.json();
        return { status: response.status, data };
    } catch (error) {
        console.error(`Request failed: ${error.message}`);
        return null;
    }
}

async function runTest() {
    console.log('--- Starting Commission Flow Test ---');

    // 1. Create Order as Editor (ID 1 acting as Editor)
    console.log('\n--- Creating Order as Editor (ID 1) ---');
    const orderPayload = {
        client: { name: 'Test Client 3', businessName: 'Test Biz 3', whatsapp: '08123456789' },
        userId: 1, // Using ID 1 again
        userRole: 'editor', // Role is EDITOR
        order: {
            packageId: 7, // Package with rules
            serviceType: 'ads',
            status: 'Baru'
        }
    };

    const resOrder = await makeRequest('http://localhost:3000/api/orders', 'POST', orderPayload);
    
    if (!resOrder || !resOrder.data.orderId) {
        console.error('Failed to create order:', resOrder ? resOrder.data : 'No response');
        return;
    }

    const orderId = resOrder.data.orderId;
    console.log(`Order Created! ID: ${orderId}`);

    // 2. Check Assignments (Should be assigned as CS for commission purposes)
    console.log(`\n--- Checking Assignments for Order ${orderId} ---`);
    const resAssignments = await makeRequest(`http://localhost:3000/api/orders/${orderId}/assignments`);
    console.log('Assignments:', JSON.stringify(resAssignments.data, null, 2));

    // 3. Check Commissions (Should get CS commission)
    console.log(`\n--- Checking Commissions for Order ${orderId} ---`);
    const resCommissions = await makeRequest(`http://localhost:3000/api/orders/${orderId}/commissions`);
    console.log('Commissions:', JSON.stringify(resCommissions.data, null, 2));
}

runTest();
