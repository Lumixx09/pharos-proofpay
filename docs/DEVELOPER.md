# Developer Guide

Everything a developer needs to understand, extend, fork, or contribute to pharos-proofpay.

---

## Codebase Tour

```
pharos-proofpay/
│
├── contracts/
│   ├── src/
│   │   └── InvoiceLogger.sol        ← The onchain registry. All logic lives here.
│   ├── script/
│   │   └── Deploy.s.sol             ← Forge deploy script. Run once per network.
│   └── test/
│       └── InvoiceLogger.t.sol      ← 16 Forge tests. Run with: forge test -vv
│
├── scripts/
│   ├── generate-invoice.js          ← Core script. Parses input, builds JSON, hashes, prints cast cmd.
│   ├── verify-invoice.js            ← Reads JSON, recomputes hash, calls verifyInvoice().
│   └── list-invoices.js             ← Lists local invoices, optionally fetches onchain status.
│
├── assets/
│   └── networks.json                ← Pharos testnet + mainnet RPC config.
│
├── references/
│   └── invoice-ops.md               ← Full cast command reference for every contract function.
│
├── docs/
│   ├── HOW-IT-WORKS.md              ← Technical architecture walkthrough.
│   ├── DEVELOPER.md                 ← This file.
│   ├── USER-GUIDE.md                ← Non-technical guide for end users.
│   ├── INSTALL.md                   ← Platform-specific installation steps.
│   ├── COMMANDS.md                  ← Full cast + script command reference.
│   └── SUBMIT.md                    ← Pharos Agent Centre submission guide.
│
├── invoices/                        ← Generated invoice JSONs (gitignored, local only).
├── SKILL.md                         ← AI agent skill definition file.
├── README.md                        ← Project overview and quick start.
├── .env                             ← Private config (gitignored — never commit this).
├── .gitignore
├── foundry.toml                     ← Foundry project config.
└── package.json                     ← Node.js dependencies.
```

---

## Development Setup

### 1. Clone and install everything

```bash
git clone https://github.com/yourusername/pharos-proofpay.git
cd pharos-proofpay

# Install Node deps
npm install

# Install Foundry
curl -L https://foundry.paradigm.xyz | bash && foundryup

# Install forge-std (required for tests)
forge install foundry-rs/forge-std
```

### 2. Run the test suite

```bash
forge test -vv
```

All 16 tests should pass. If a test fails, the output will show the exact assertion and line number.

```
Running 16 tests for contracts/test/InvoiceLogger.t.sol:InvoiceLoggerTest
[PASS] test_LogInvoice()
[PASS] test_TotalInvoicesIncrement()
[PASS] test_DuplicateInvoiceReverts()
[PASS] test_EmptyIdReverts()
[PASS] test_EmptyHashReverts()
[PASS] test_VerifyInvoice()
[PASS] test_GetIssuerInvoices()
[PASS] test_MarkPaid()
[PASS] test_MarkPaidNotIssuerReverts()
[PASS] test_MarkPaidAlreadyPaidReverts()
[PASS] test_CancelInvoice()
[PASS] test_CancelNotIssuerReverts()
[PASS] test_CancelAlreadyPaidReverts()
[PASS] test_GetOverdueInvoices()
[PASS] test_GetOverdueInvoicesEmpty()
[PASS] test_InvoiceExists()
```

### 3. Test the Node.js scripts locally

```bash
# Argument mode
node scripts/generate-invoice.js --client "Test Client" --work "Test work" --amount 500 --days 7

# Multi-item mode
node scripts/generate-invoice.js \
  --client "Test Client" \
  --item "Design:300" \
  --item "Development:500" \
  --days 14

# Natural language mode
echo "Invoice TestCorp for design work, $400, due in 7 days" | \
  node scripts/generate-invoice.js --parse

# List all generated invoices
node scripts/list-invoices.js

# Verify a generated invoice (without onchain check)
node scripts/verify-invoice.js --id <generated-invoice-id>
```

---

## Contract Architecture

### InvoiceLogger.sol

The contract is intentionally minimal — it is a write-once registry with no upgradeability.

**Key design decisions:**

- **No owner/admin**: Deployer has no special powers after deployment. No rug surface.
- **No funds**: The contract never holds ETH or tokens. It only stores invoice metadata.
- **`exists` bool on struct**: Prevents a zero-value Invoice being returned as valid when an ID is not found. Alternative would be checking `bytes(inv.invoiceId).length > 0` but the bool is cheaper to check.
- **`string` indexed in events**: `indexed string` stores the keccak256 of the string in the event topic, enabling fast filtering by invoice ID from logs.
- **Two-pass `getOverdueInvoices`**: Counts first, allocates exact-size array, then populates. Avoids dynamic memory resizing in Solidity.

### Adding a new contract function

1. Add function to `contracts/src/InvoiceLogger.sol`
2. Add corresponding test(s) to `contracts/test/InvoiceLogger.t.sol`
3. Run `forge test -vv` — all existing tests must still pass
4. Add the cast command template to `references/invoice-ops.md`

### Redeploying to a new network

1. Add the network to `assets/networks.json`
2. Run the deploy script with the new RPC URL
3. Save the new contract address

---

## Script Architecture

All three scripts follow the same pattern:

```
parseArgs()       ← read CLI flags into an object
     │
     ▼
validate inputs   ← exit with usage message if required args missing
     │
     ▼
core logic        ← compute hash / read file / call cast
     │
     ▼
output            ← formatted console output
     │
     ▼
optional side     ← autolog (generate), cast call (verify), status fetch (list)
effect
```

### keccak256 in Node.js

The scripts use the `ethereum-cryptography` package for a proper Ethereum-compatible keccak256:

```js
const { keccak256: k } = require("ethereum-cryptography/keccak");
const { utf8ToBytes }   = require("ethereum-cryptography/utils");
const hash = "0x" + Buffer.from(k(utf8ToBytes(data))).toString("hex");
```

This is the same hash Solidity computes with `keccak256(bytes(string))`. The SHA-256 fallback exists only as a last resort — it produces a different hash and should never be used for real invoices.

### Calling cast from Node.js

The `--autolog` flag and the `verify-invoice.js` script call `cast` as a subprocess:

```js
const { spawnSync } = require("child_process");

const result = spawnSync("cast", [
  "send", contract,
  "logInvoice(string,bytes32,uint256,uint256,string)",
  invoiceId, hash, amountCents, dueTimestamp, clientName,
  "--private-key", pk,
  "--rpc-url", rpc,
], { encoding: "utf8" });
```

`spawnSync` is used (not `execSync`) to avoid shell interpolation of arguments containing special characters. If `cast` is not installed, `result.error` will be set — the scripts handle this gracefully and fall back to printing the manual command.

---

## Contract ABI (Key Functions)

```json
[
  {
    "name": "logInvoice",
    "inputs": [
      { "name": "invoiceId",    "type": "string"  },
      { "name": "dataHash",     "type": "bytes32" },
      { "name": "amountUSD",    "type": "uint256" },
      { "name": "dueTimestamp", "type": "uint256" },
      { "name": "clientName",   "type": "string"  }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "name": "markPaid",
    "inputs": [{ "name": "invoiceId", "type": "string" }],
    "stateMutability": "nonpayable"
  },
  {
    "name": "cancelInvoice",
    "inputs": [{ "name": "invoiceId", "type": "string" }],
    "stateMutability": "nonpayable"
  },
  {
    "name": "verifyInvoice",
    "inputs": [
      { "name": "invoiceId", "type": "string"  },
      { "name": "dataHash",  "type": "bytes32" }
    ],
    "outputs": [{ "type": "bool" }],
    "stateMutability": "view"
  },
  {
    "name": "getInvoice",
    "inputs": [{ "name": "invoiceId", "type": "string" }],
    "outputs": [{ "type": "tuple", "components": [...] }],
    "stateMutability": "view"
  },
  {
    "name": "getIssuerInvoices",
    "inputs": [{ "name": "issuer", "type": "address" }],
    "outputs": [{ "type": "string[]" }],
    "stateMutability": "view"
  },
  {
    "name": "getOverdueInvoices",
    "inputs": [{ "name": "issuer", "type": "address" }],
    "outputs": [{ "type": "string[]" }],
    "stateMutability": "view"
  }
]
```

---

## Extension Ideas

These are not implemented but are natural next steps if you want to build on this:

### Client wallet registration

Add a `registerClient(string invoiceId, address clientWallet)` function so the issuer can link a known client wallet. This enables the client to call `markPaid` themselves rather than the issuer doing it.

### Dispute flag

Add a `raiseDispute(string invoiceId)` function callable by the client wallet. Useful for building an arbitration layer on top.

### PDF export

Add a `--pdf` flag to `generate-invoice.js` using the `pdfkit` npm package to export a printable invoice PDF alongside the JSON.

### ENS / wallet name resolution

Resolve client wallet addresses to ENS names when displaying invoice records in `list-invoices.js`.

### Web frontend

A simple React app that reads the user's connected wallet, calls `getIssuerInvoices()`, and displays invoices with their live onchain status. No backend needed — direct contract reads via ethers.js or viem.

### Webhook on payment

An offchain service that listens for `InvoicePaid` events via a Pharos RPC subscription and sends a notification (email, Slack, Telegram) to the freelancer.

---

## Running Tests with Coverage

```bash
forge coverage
```

This shows line and branch coverage for `InvoiceLogger.sol`. Aim to keep branch coverage above 90%.

## Gas Report

```bash
forge test --gas-report
```

Useful before deployment to understand transaction costs on the target network.

## Linting the Solidity

```bash
# If you have solhint installed
solhint contracts/src/**/*.sol
```

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `PRIVATE_KEY` | For write ops | Wallet private key — never log or print this |
| `CONTRACT` | For all contract calls | Deployed InvoiceLogger address |
| `RPC_URL` | For all contract calls | Defaults to Pharos Atlantic Testnet RPC |

All three can be loaded from `.env` by running `source .env && export PRIVATE_KEY CONTRACT RPC_URL` before using the scripts.

---

## Common Mistakes

| Mistake | Result | Fix |
|---|---|---|
| Editing invoice JSON after logging | `verifyInvoice()` returns false | Never edit logged invoices — log a new one |
| Using SHA-256 fallback hash for a real invoice | Hash mismatch on verify | Run `npm install` to get `ethereum-cryptography` |
| Calling `markPaid` from the wrong wallet | `NotInvoiceIssuer` revert | Use the wallet that called `logInvoice` |
| Using the same invoice ID twice | `InvoiceAlreadyExists` revert | Omit `--id` to auto-generate a unique ID |
| Setting `dueTimestamp` to 0 | Invoice never appears as overdue | Always pass the computed `dueTimestamp` from the generator |

