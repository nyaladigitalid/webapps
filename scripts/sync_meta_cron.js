/**
 * Cron Job Script for Daily Meta Synchronization
 * This script sends a POST request to the local API endpoint to trigger Meta Ads sync.
 * Run daily at 01:00 AM using system crontab:
 * 0 1 * * * cd /root/webapps && /usr/bin/node scripts/sync_meta_cron.js >> /root/webapps/cron_sync.log 2>&1
 */

const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

const port = process.env.PORT || 3001;
const url = `http://localhost:${port}/api/campaigns/sync-spend`;

const logHeader = `[${new Date().toLocaleString('id-ID')}] [Cron Sync]`;
console.log(`${logHeader} Starting Meta Ads synchronization request to ${url}...`);

fetch(url, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
})
.then(async (res) => {
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return res.json();
})
.then((data) => {
    console.log(`${logHeader} Meta Ads sync completed successfully:`, JSON.stringify(data));
    process.exit(0);
})
.catch((err) => {
    console.error(`${logHeader} Meta Ads sync failed:`, err.message);
    process.exit(1);
});
