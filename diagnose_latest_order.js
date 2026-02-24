const mysql = require('mysql2/promise');

async function diagnose() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'nyaladigitaldb'
    });

    try {
        console.log('--- Diagnosing Latest Order ---');
        const [orders] = await connection.execute('SELECT * FROM orders ORDER BY id DESC LIMIT 1');
        if (orders.length === 0) {
            console.log('No orders found.');
            return;
        }
        const order = orders[0];
        console.log('Latest Order:', order);

        console.log('\n--- Order Assignments ---');
        const [assignments] = await connection.execute('SELECT * FROM order_assignments WHERE order_id = ?', [order.id]);
        console.log(assignments);

        if (assignments.length === 0) {
            console.log('No assignments found for this order.');
        } else {
            console.log(`Found ${assignments.length} assignments.`);
        }

        console.log('\n--- Commission Rules for Package ' + order.package_id + ' ---');
        const [rules] = await connection.execute('SELECT * FROM commission_rules WHERE package_id = ?', [order.package_id]);
        console.log(rules);

        if (rules.length === 0) {
            console.log('WARNING: No commission rules found for this package!');
        }

        console.log('\n--- Simulating Commission Calculation ---');
        const [commissionRows] = await connection.execute(`
            SELECT 
                oa.role as assigned_role, 
                oa.content_type as assigned_type,
                oa.user_id,
                cr.role as rule_role,
                cr.content_type as rule_type,
                cr.amount
            FROM order_assignments oa
            LEFT JOIN commission_rules cr ON 
                cr.package_id = ? AND 
                cr.role = oa.role AND 
                (cr.content_type = oa.content_type OR (cr.content_type = 'general' AND oa.content_type IS NULL))
            WHERE oa.order_id = ?
        `, [order.package_id, order.id]);

        console.log(commissionRows);

        // Check for role mismatch (case sensitivity simulation)
        console.log('\n--- Checking for Role Mismatch (Case Sensitivity) ---');
        for (const a of assignments) {
            const matchingRule = rules.find(r => r.role === a.role); // Strict equality
            const looseMatchingRule = rules.find(r => r.role.toLowerCase() === a.role.toLowerCase());
            
            console.log(`Assignment Role: '${a.role}'`);
            if (matchingRule) {
                console.log(`  Strict Match Found: Rule Role '${matchingRule.role}', Amount: ${matchingRule.amount}`);
            } else if (looseMatchingRule) {
                console.log(`  Loose Match Found (Case Insensitive): Rule Role '${looseMatchingRule.role}', Amount: ${looseMatchingRule.amount}`);
                console.log('  WARNING: Strict join might fail if collation is case-sensitive.');
            } else {
                console.log('  No matching rule found (even case-insensitive).');
            }
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await connection.end();
    }
}

diagnose();
