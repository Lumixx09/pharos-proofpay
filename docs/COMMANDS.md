# Invoice Operations Reference

Full command templates for every operation on Pharos.

---

## Deploy the InvoiceLogger Contract {#deploy}

Run once per network. Save the deployed address — you need it for all write operations.

```bash
RPC_URL=$(jq -r '.networks[] | select(.name=="atlantic-testnet") | .rpcUrl' assets/networks.json)
CHAIN_ID=$(jq -r '.networks[] | select(.name=="atlantic-testnet") | .chainId' assets/networks.json)

forge script contracts/script/Deploy.s.sol:DeployInvoiceLogger \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --chain-id $CHAIN_ID

export CONTRACT=<address from output>
```

---

## Generate an Invoice {#generate}

### Argument mode

```bash
node scripts/generate-invoice.js \
  --client "Acme Corp" \
  --work "Built e-commerce dashboard" \
  --amount 1200 \
  --days 14 \
  --id "INV-2026-001"
```

### Multi-item mode

Multiple line items are supported. The total is summed automatically.

```bash
node scripts/generate-invoice.js \
  --client "Acme Corp" \
  --item "UI Design:500" \
  --item "Backend Development:800" \
  --item "Deployment & Setup:200" \
  --days 14
```

### Natural language mode

```bash
echo "Invoice Acme Corp for React dashboard work, $1200, due in 14 days" | \
  node scripts/generate-invoice.js --parse
```

### Auto-log mode

Generates the invoice and immediately logs it onchain in one command.
Requires `CONTRACT` and `PRIVATE_KEY` in the environment.

```bash
node scripts/generate-invoice.js \
  --client "Acme Corp" \
  --work "API integration" \
  --amount 800 \
  --days 7 \
  --autolog
```

All modes output:
- Structured invoice JSON saved to `invoices/<ID>.json`
- The keccak256 data hash
- The ready-to-run `cast send` command (or auto-runs it with `--autolog`)

---

## Log Invoice Onchain {#log}

Copy the `cast send` command from generator output, or build it manually:

```bash
cast send $CONTRACT \
  "logInvoice(string,bytes32,uint256,uint256,string)" \
  "INV-2026-001" \
  "0xYOUR_HASH_HERE" \
  120000 \
  1751500799 \
  "Acme Corp" \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC_URL
```

**Parameter format:**
| Parameter | Type | Example | Notes |
|---|---|---|---|
| invoiceId | string | `"INV-2026-001"` | Must be unique |
| dataHash | bytes32 | `"0xabc123..."` | keccak256 of invoice JSON |
| amountUSD | uint256 | `120000` | USD cents ($1,200.00) |
| dueTimestamp | uint256 | `1751500799` | Unix timestamp of due date |
| clientName | string | `"Acme Corp"` | Client display name |

---

## Verify an Invoice {#verify}

### One-command (recommended)

Reads the saved JSON, recomputes the hash, and queries Pharos automatically:

```bash
node scripts/verify-invoice.js --id INV-2026-001
node scripts/verify-invoice.js --file invoices/INV-2026-001.json
```

### Manual via cast

```bash
cast call $CONTRACT \
  "verifyInvoice(string,bytes32)" \
  "INV-2026-001" "0xYOUR_HASH_HERE" \
  --rpc-url $RPC_URL
```

Returns `0x01` (true) = invoice is untampered.
Returns `0x00` (false) = hash mismatch, invoice may have been altered.

---

## Mark an Invoice as Paid {#paid}

Only the original issuer wallet can call this.

```bash
cast send $CONTRACT \
  "markPaid(string)" \
  "INV-2026-001" \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC_URL
```

Emits `InvoicePaid` event. Status changes from `UNPAID` to `PAID` permanently.

---

## Cancel an Invoice {#cancel}

Only the original issuer wallet can call this. The invoice record is preserved — it is never deleted from the blockchain.

```bash
cast send $CONTRACT \
  "cancelInvoice(string)" \
  "INV-2026-001" \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC_URL
```

Emits `InvoiceCancelled` event. Status changes from `UNPAID` to `CANCELLED` permanently.

---

## List All Invoices {#list}

### Local list with optional onchain status

Shows all saved invoice files. Fetches live onchain status if `CONTRACT` is set.

```bash
node scripts/list-invoices.js

# Filter by status
node scripts/list-invoices.js --status PAID
node scripts/list-invoices.js --status CANCELLED

# Show only overdue (UNPAID and past due date)
node scripts/list-invoices.js --overdue
```

### Via cast — all invoice IDs for your wallet

```bash
MY_WALLET=$(cast wallet address --private-key $PRIVATE_KEY)

cast call $CONTRACT \
  "getIssuerInvoices(address)" \
  $MY_WALLET \
  --rpc-url $RPC_URL
```

---

## Fetch a Single Invoice Record {#fetch}

Retrieve the full onchain record for any invoice ID:

```bash
cast call $CONTRACT \
  "getInvoice(string)" \
  "INV-2026-001" \
  --rpc-url $RPC_URL
```

Returns: `invoiceId, dataHash, issuer, timestamp, dueTimestamp, amountUSD, clientName, status, exists`

**Status values:** `0` = UNPAID, `1` = PAID, `2` = CANCELLED

---

## Get Overdue Invoices {#overdue}

Returns all UNPAID invoices past their due date for a wallet:

```bash
MY_WALLET=$(cast wallet address --private-key $PRIVATE_KEY)

cast call $CONTRACT \
  "getOverdueInvoices(address)" \
  $MY_WALLET \
  --rpc-url $RPC_URL
```

---

## Check Total Invoices on Chain {#total}

```bash
cast call $CONTRACT "totalInvoices()" --rpc-url $RPC_URL | cast to-dec
```

---

## Check if Invoice ID is Already Taken {#exists}

```bash
cast call $CONTRACT \
  "invoiceExists(string)" \
  "INV-2026-001" \
  --rpc-url $RPC_URL
# Returns 0x01 = taken, 0x00 = available
```

---

## Error Reference

| Error | Cause | Fix |
|---|---|---|
| `InvoiceAlreadyExists` | Invoice ID already logged | Use a unique ID or omit `--id` to auto-generate |
| `InvoiceNotFound` | ID does not exist onchain | Check the ID, confirm it was logged |
| `NotInvoiceIssuer` | Caller is not the original issuer | Use the wallet that originally logged the invoice |
| `InvoiceAlreadyClosed` | Invoice is already PAID or CANCELLED | Check status first with `getInvoice()` |
| `EmptyInvoiceId` | Empty string passed as ID | Provide a valid invoice ID |
| `EmptyHash` | Zero bytes32 passed | Re-run the invoice generator |
| `insufficient funds` | Not enough PHRS for gas | Top up wallet from faucet |
| `WARNING: ethereum-cryptography...` | npm package missing | Run `npm install` |
