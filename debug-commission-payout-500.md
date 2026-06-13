[OPEN]

# commission-payout-500

## Symptom
- POST /api/commissions/payout returns 500 (Internal Server Error) from finance.html payout action.

## Expected
- Payout succeeds, returns JSON `{ success: true, ... }`, and ledger rows become `status = 'paid'`.

## Hypotheses
- H1: DB schema mismatch (missing table/column like `payout_batch`, `payout_batch_items`, `transactions.category`, `commission_ledger.ref_txn_id`, etc.) causes SQL error during payout transaction.
- H2: Data issue (invalid `order_id`, `amount`, or ledger rows not matching constraints) causes INSERT/UPDATE failure.
- H3: Endpoint receives unexpected payload (ledger_ids empty/strings) and query building fails or returns unexpected set leading to error.
- H4: Server runtime incompatibility (Node fetch / JSON parsing / transaction handling) throws before DB operations.
- H5: Permission/connection pool issue (DB connection fails / deadlock) causes transaction begin/commit failures.

## Instrumentation Plan
- Add debug server reporting to server.js payout endpoint:
  - Entry payload + traceId
  - Selected ledger items count
  - Each DB step (batch insert, txn insert, ledger update)
  - Catch block includes error code/sqlState/sqlMessage/stack

## Repro Steps
- Open finance.html → Komisi tab → pilih approved rows → click Payout.

## Evidence Log Files
- .dbg/trae-debug-log-commission-payout-500.ndjson

