---
name: pharos-proofpay
description: >
  Invoke this skill whenever a developer, freelancer, or agency wants to create
  an invoice, log proof of work onchain, or verify an invoice has not been altered.
  Trigger phrases include: "create invoice", "bill my client", "log invoice",
  "generate invoice", "verify invoice", "proof of work", "invoice [client name]",
  "how much do I owe", "send invoice", "payment record", or any request to document
  and timestamp freelance or contract work. This skill generates a structured invoice
  from natural language, hashes it, and logs it immutably on the Pharos blockchain —
  creating tamper-proof, timestamped proof of issuance that is legally stronger than email.
version: 1.0.0
author: iEngineer Solutions (@M_Lumixx)
license: MIT
requires:
  anyBins:
    - cast
    - forge
    - node
    - jq
---

# Pharos ProofPay

Turn a plain English sentence into a professional invoice with immutable onchain proof.

A freelancer should never have to open a template, copy-paste client details, export
a PDF, and pray the client pays. This skill handles generation, hashing, and onchain
logging in one flow — so the work is recorded on Pharos the moment it's done.

---

## What This Skill Does

1. **Parses** natural language invoice requests into structured invoice data
2. **Generates** a clean invoice JSON with all required fields
3. **Hashes** the invoice data (keccak256) to create a tamper-proof fingerprint
4. **Logs** the hash onchain to Pharos via the `InvoiceLogger` smart contract
5. **Returns** a transaction hash — permanent, timestamped proof the invoice was issued

The invoice data lives offchain (JSON file). The *proof* lives onchain. Anyone
can verify the invoice was not altered by recomputing the hash and calling `verifyInvoice`.

---

## Automated Environment Provisioning & Setup

When the user first invokes this skill, the Agent MUST automatically check for, install, and configure all dependencies. The user should not have to run commands manually.

### 1. Verify and Install Node.js Dependencies
- Check if `node` and `npm` are available. If not, ask the user to download Node.js (or offer to install it via system package managers if available).
- If `node_modules/` or `ethereum-cryptography` is missing, the Agent MUST run:
  ```bash
  npm install
  ```

### 2. Verify and Install Foundry (cast + forge)
- Check if `forge` and `cast` are available in the system PATH.
- If they are missing, the Agent MUST automatically install them:
  *   **macOS / Linux**: Run the paradigm installer:
      ```bash
      curl -L https://foundry.paradigm.xyz | bash && source ~/.bashrc && foundryup
      ```
  *   **Windows**: Download the precompiled Windows binaries release zip from GitHub (`https://github.com/foundry-rs/foundry/releases`), extract `forge.exe` and `cast.exe` to a local `bin/` directory within the workspace, and run them from there.

### 3. Deploy Contract Automatically
- If the user has configured their private key but has not deployed the `InvoiceLogger` registry contract:
  - Ask the user: *"Would you like me to deploy a new InvoiceLogger registry contract on Pharos Atlantic Testnet for you?"*
  - If yes, run the deployment script automatically:
    ```bash
    forge script contracts/script/Deploy.s.sol:DeployInvoiceLogger \
      --rpc-url https://atlantic.dplabs-internal.com \
      --private-key $PRIVATE_KEY \
      --broadcast
    ```
  - Read the deployed contract address from the terminal output and write it to `.env` as `CONTRACT=<address>`.

---

## Network Configuration

Network details in `assets/networks.json`.

- **Default**: Atlantic testnet — used when user does not specify a network
- **Mainnet**: Requires explicit confirmation before any write operation

```bash
RPC_URL=$(jq -r '.networks[] | select(.name=="atlantic-testnet") | .rpcUrl' assets/networks.json)
```

---

## Capability Index

| User Intent | Capability | Reference |
|---|---|---|
| Create an invoice | Natural language → invoice JSON + onchain log | → `docs/COMMANDS.md#generate` |
| Log invoice to chain | Hash invoice and call `logInvoice()` | → `docs/COMMANDS.md#log` |
| Verify invoice integrity | `verify-invoice.js` — one command | → `docs/COMMANDS.md#verify` |
| Mark invoice paid | Issuer calls `markPaid()` onchain | → `docs/COMMANDS.md#paid` |
| Cancel an invoice | Issuer calls `cancelInvoice()` onchain | → `docs/COMMANDS.md#cancel` |
| List all my invoices | `list-invoices.js` with live onchain status | → `docs/COMMANDS.md#list` |
| Fetch invoice record | Read full record from chain | → `docs/COMMANDS.md#fetch` |
| Get overdue invoices | `getOverdueInvoices(address)` | → `docs/COMMANDS.md#overdue` |
| Deploy the contract | First-time setup on any network | → `docs/COMMANDS.md#deploy` |
| Check total invoices | Read global counter | → `docs/COMMANDS.md#total` |

---

## Core Flow — Step by Step

### Step 1 — Parse the Request

Accept any of these input styles:

```
"Invoice Acme Corp for landing page work, $800, due in 7 days"
"Bill TechCorp for React dashboard, 3 days work, $1200"
"Create invoice for Logo design, client: DesignHub, amount: $350, net 14"
```

Extract: `client name`, `work description`, `amount`, `due days`, `invoice ID (auto if not given)`

### Step 2 — Generate Invoice

```bash
node scripts/generate-invoice.js \
  --client "Acme Corp" \
  --work "Landing page design and development" \
  --amount 800 \
  --days 7
```

Or via natural language pipe:

```bash
echo "Invoice Acme Corp for landing page work, $800, due in 7 days" | \
  node scripts/generate-invoice.js --parse
```

The script outputs:
- Invoice JSON saved to `invoices/<ID>.json`
- The `dataHash` (keccak256)
- The ready-to-run `cast send` command

### Step 3 — Confirm with User

Before logging onchain, show:

```
INVOICE READY
─────────────────────────────────────────
  ID       : INV-2026-042
  Client   : Acme Corp
  Work     : Landing page design
  Amount   : $800.00 USD
  Issued   : 2026-06-07
  Due      : 2026-06-14
  Hash     : 0xabc123...
  Network  : Atlantic Testnet
  Wallet   : 0xDEF...456
─────────────────────────────────────────
Log this invoice onchain? [y/n]
```

### Step 4 — Log Onchain

```bash
cast send $CONTRACT \
  "logInvoice(string,bytes32,uint256,uint256,string,address)" \
  "INV-2026-042" \
  "0xDATA_HASH" \
  80000 \
  1751500799 \
  "Acme Corp" \
  "0x0000000000000000000000000000000000000000" \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC_URL
```

### Step 5 — Confirm and Return Receipt

```
✅ INVOICE LOGGED ONCHAIN

  Invoice ID  : INV-2026-042
  Tx Hash     : 0xTRANSACTION_HASH
  Explorer    : https://atlantic.pharosscan.xyz/tx/0xTRANSACTION_HASH
  Timestamp   : 2026-06-07 14:32:11 UTC
  Network     : Pharos Atlantic Testnet

  Your invoice is now immutably timestamped on Pharos.
  Share the invoice JSON with your client.
  Anyone can verify it was not altered using the hash above.
```

## Interactive User Onboarding & Pre-checks

If this is the user's first time using the skill or if environment variables (`PRIVATE_KEY`, `CONTRACT`) are missing, the Agent MUST NOT abort. Instead, guide the user through a warm, personalized setup flow:

1. **Greet the User**: Greet them warmly and explain that you will help get their Pharos Developer Invoice setup configured in seconds.
2. **Collect the Private Key**: Ask the user for their Private Key. Explain that it is only saved locally in their `.env` file to sign onchain logs and is never shared or transmitted anywhere else.
3. **Handle Contract Address**: Ask if they already have a deployed `InvoiceLogger` contract address:
   - **If yes**: Save the contract address they provide.
   - **If no**: Offer to deploy a fresh instance of `InvoiceLogger` on Pharos Atlantic Testnet automatically. If they agree, compile and deploy it using their key, then save the address.
4. **Create the `.env` File**: Write the credentials to their local `.env` file automatically so they do not have to edit files manually.
5. **Verify Gas Balance**:
   - Derive the wallet address: `cast wallet address --private-key $PRIVATE_KEY`
   - Check the wallet's PHRS balance: `cast balance <address> --rpc-url $RPC_URL --ether`
   - If the balance is zero, explain in a friendly way how to get free testnet gas tokens from the faucet (e.g., pointing them to Pharos community channels or PharosPort) before trying to write onchain.

Before every write operation (`cast send`), the Agent MUST:
1. Verify the gas balance of the derived wallet is sufficient.
2. Display a friendly confirmation summarizing the transaction details (action, network, wallet, gas status).
3. Ask the user if they are ready to submit it onchain.

---

## Natural Language Examples

```
"Invoice DesignHub for brand identity work, $500, due in 14 days"
→ Generates INV-202606-XXX, hashes it, logs to Pharos

"Verify invoice INV-2026-001"
→ Reads saved JSON, recomputes hash, calls verifyInvoice()

"Show all my invoices"
→ Calls getIssuerInvoices() with connected wallet

"What's on chain for INV-2026-001?"
→ Calls getInvoice("INV-2026-001"), formats and returns record
```

---

## General Error Handling

| Error | Cause | Action |
|---|---|---|
| `InvoiceAlreadyExists` | ID already logged | Generate new unique ID |
| `InvoiceNotFound` | ID not on chain | Check ID spelling or confirm it was logged |
| `EmptyInvoiceId` | Blank ID passed | Provide or auto-generate an ID |
| `EmptyHash` | Hash is zero bytes | Re-run invoice generator |
| `insufficient funds` | No PHRS for gas | Get testnet PHRS from faucet |
| Node script fails | Missing dependency | Run `npm install ethereum-cryptography` |

---

## Security Rules

- Private keys are never logged, printed, or included in any output
- Mainnet operations require explicit user re-confirmation
- Invoice JSON is stored locally — only the hash goes onchain
- The contract is non-upgradeable — logged invoices cannot be deleted or altered

