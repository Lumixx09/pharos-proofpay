# How pharos-proofpay Works

A technical walkthrough of the full system — from plain English to an immutable onchain record.

---

## The Core Idea

Every invoice this skill creates has two parts:

| Part | Where it lives | What it contains |
|---|---|---|
| Invoice JSON | Your local machine | Client, amount, dates, line items |
| Proof | Pharos blockchain | A unique fingerprint (hash) of the JSON |

The invoice data stays private and offline. Only the proof goes onchain. Anyone with the JSON file can verify it matches what was logged — but no one can read the contents from the blockchain alone.

---

## The Flow, Step by Step

```
 You say:
 "Invoice Acme Corp for $800 landing page work, due in 7 days"
          │
          ▼
 ┌─────────────────────────┐
 │  generate-invoice.js    │  ← Node.js script
 │                         │
 │  1. Parse input         │
 │  2. Build invoice JSON  │
 │  3. Compute keccak256   │
 │  4. Save JSON to disk   │
 │  5. Print cast command  │
 └─────────────────────────┘
          │
          ▼
 invoices/INV-202606-347.json   ← stored on your machine
          │
          ▼
 ┌─────────────────────────┐
 │  cast send              │  ← Foundry CLI
 │                         │
 │  Calls logInvoice() on  │
 │  the InvoiceLogger      │
 │  smart contract         │
 └─────────────────────────┘
          │
          ▼
 ┌─────────────────────────┐
 │  Pharos Blockchain      │
 │                         │
 │  Invoice ID: INV-xxx    │
 │  Hash:       0xabc...   │
 │  Issuer:     0xDEF...   │
 │  Timestamp:  1749290400 │
 │  Due:        1749895200 │
 │  Amount:     80000      │
 │  Status:     UNPAID     │
 └─────────────────────────┘
```

---

## Why keccak256?

keccak256 is the same hash function Ethereum uses internally. It takes any input — a full JSON string, a PDF, a paragraph — and produces a fixed 32-byte output. Key properties:

- **Deterministic**: the same input always produces the same hash
- **One-way**: you cannot reverse a hash to get the original data
- **Collision-resistant**: two different inputs never produce the same hash
- **Sensitive**: changing even one character produces a completely different hash

This is why it works as a tamper-proof fingerprint. If someone edits the invoice JSON — even just the amount — the recomputed hash will not match what was logged onchain, and `verifyInvoice()` returns false.

---

## The Smart Contract

`InvoiceLogger.sol` is a minimal, non-upgradeable registry deployed on Pharos.

### Storage layout

```solidity
mapping(string => Invoice)   private _invoices;        // invoiceId → record
mapping(address => string[]) private _issuerInvoices;  // wallet → list of IDs
uint256 public totalInvoices;
```

### Invoice struct

```solidity
struct Invoice {
    string  invoiceId;     // "INV-2026-001"
    bytes32 dataHash;      // keccak256 of the JSON file
    address issuer;        // wallet that logged it
    uint256 timestamp;     // block.timestamp at logging
    uint256 dueTimestamp;  // Unix timestamp of payment due date
    uint256 amountUSD;     // USD cents (80000 = $800.00)
    string  clientName;    // "Acme Corp"
    Status  status;        // UNPAID | PAID | CANCELLED
    bool    exists;        // prevents zero-value confusion on lookups
}
```

### Invoice lifecycle

```
logInvoice()
     │
     ▼
  UNPAID
  /    \
markPaid()  cancelInvoice()
  /            \
PAID        CANCELLED
```

Once an invoice is PAID or CANCELLED it cannot be changed again. The record always remains readable on the blockchain.

### Why it is non-upgradeable

There is no owner, no proxy, no admin key. Once deployed, the contract cannot be changed by anyone — including the deployer. This is intentional: it guarantees that logged invoice records cannot be altered, deleted, or backdated by anyone, ever.

---

## Hashing: What Exactly Gets Hashed

The script serialises the invoice object to JSON with 2-space indentation:

```js
const invoiceJSON = JSON.stringify(invoice, null, 2);
const invoiceHash = keccak256(invoiceJSON);
```

The same string is both saved to disk and hashed. This means:

- Reading the saved file and recomputing keccak256 always produces the same hash
- If the file is reformatted, minified, or re-ordered, the hash changes

This is why you must never edit the saved invoice JSON after logging it. If you need to correct an invoice, log a new one with a new ID.

---

## The Due Timestamp

The due date is stored onchain as a Unix timestamp (seconds since 1970-01-01 UTC). The generator computes it as end-of-day on the Nth day:

```js
function dueDateTimestamp(days) {
  const d = new Date();
  d.setDate(d.getDate() + parseInt(days, 10));
  d.setHours(23, 59, 59, 0);
  return Math.floor(d.getTime() / 1000);
}
```

This enables the `getOverdueInvoices(address)` function on the contract to identify invoices where `dueTimestamp < block.timestamp` and status is still `UNPAID`.

---

## Amount Format

Amounts are stored as USD cents (a `uint256`) to avoid floating-point issues in Solidity:

| Invoice amount | Onchain value |
|---|---|
| $1.00 | 100 |
| $800.00 | 80000 |
| $1,200.00 | 120000 |
| $9,999.99 | 999999 |

---

## Verification in Detail

When `node scripts/verify-invoice.js --id INV-xxx` runs:

1. Reads `invoices/INV-xxx.json` from disk
2. Computes `keccak256(fileContents)`
3. Calls `cast call $CONTRACT "verifyInvoice(string,bytes32)" "INV-xxx" "0xHASH"`
4. The contract checks `_invoices[invoiceId].dataHash == dataHash`
5. Returns `true` (untampered) or `false` (mismatch)

If the contract returns an error (`InvoiceNotFound`), the invoice was never logged.

---

## Event Log

Every state-changing action emits an event permanently recorded in the Pharos transaction log:

| Action | Event |
|---|---|
| `logInvoice()` | `InvoiceLogged(invoiceId, issuer, dataHash, amountUSD, clientName, dueTimestamp, timestamp)` |
| `markPaid()` | `InvoicePaid(invoiceId, issuer, timestamp)` |
| `cancelInvoice()` | `InvoiceCancelled(invoiceId, issuer, timestamp)` |

These events are queryable from the Pharos explorer and any indexer, making the full invoice history auditable without reading contract storage directly.

---

## Security Model

| What is protected | How |
|---|---|
| Invoice data privacy | Only the hash goes onchain — contents are never visible on-chain |
| Tamper evidence | Any change to the JSON breaks the hash — detected by `verifyInvoice()` |
| Issuer-only actions | `markPaid` and `cancelInvoice` check `msg.sender == inv.issuer` |
| Replay prevention | `InvoiceAlreadyExists` error blocks re-logging the same ID |
| Private key safety | The key is read from the environment — never logged, printed, or stored in any file |

---

## What This Skill Does Not Do

- It does not send the invoice to the client — you still share the JSON file manually
- It does not accept or hold payments — no funds move through the contract
- It does not store invoice contents onchain — only the hash
- It does not guarantee the client sees or acknowledges the invoice

