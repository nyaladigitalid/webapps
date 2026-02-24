const fetch = require('node-fetch');

(async () => {
    try {
        const orderId = 17;
        console.log(`Testing submit for Order ${orderId}...`);
        
        const response = await fetch(`http://localhost:3000/api/orders/${orderId}/content/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                links: [
                    { url: 'https://test-link.com/1', description: 'Test Link 1' },
                    { url: 'https://test-link.com/2', description: 'Test Link 2' }
                ]
            })
        });
        
        const data = await response.json();
        console.log('Response:', data);
        
    } catch (error) {
        console.error('Error:', error);
    }
})();
