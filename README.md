# pharos-proofpay

> Turn a plain English sentence into a professional invoice with immutable onchain proof — powered by Pharos.

---

## The Problem ❌

* **Wasted Time:** Freelancers and agencies spend hours editing templates, exporting PDFs, and chasing clients for payment.
* **No Ground Truth:** Emails are deleted, and PDF invoices can be easily edited or falsified. There is no immutable proof that a specific invoice existed at a specific time.
* **Friction:** Traditional invoicing requires moving between multiple tools (word processors, email clients, spreadsheet templates, and accounting software).

## The Solution: Pharos ProofPay (AI + Onchain Proof) 🚀

**pharos-proofpay** is a zero-friction AI Agent Skill that automates the entire invoice creation and verification lifecycle:

1. **Prompt to Generate:** Speak naturally to your AI agent (e.g., *"Invoice Acme Corp for React dashboard, $1200, due in 14 days"*). The agent creates a structured, compliant invoice JSON.
2. **Tamper-Proof Fingerprint:** The agent automatically hashes (Keccak-256) the invoice details.
3. **Onchain Timestamping:** The hash is logged on the high-performance **Pharos Blockchain** to create permanent, legally verifiable proof of issuance.
4. **Instant Verification:** Anyone can verify the authenticity of the invoice at any time by matching the file hash to the onchain registry. If a client tampers with the invoice amount or due date, verification fails immediately.

---

## How It Works

```
Your words  →  Invoice JSON  →  keccak256 hash  →  Pharos blockchain
                (offchain)         (offchain)          (permanent)
```

The invoice data (client name, amount, description, dates) lives in a local JSON file.
The **proof** — a unique fingerprint of that exact file — lives onchain forever.

Anyone can verify the invoice was never altered by recomputing the hash and comparing it to what is stored on Pharos. If even one character changes, the hash will not match.

---

## Project Structure

```
pharos-proofpay/
│
├── README.md                          # Project overview and quick start
├── SKILL.md                           # AI agent skill definition
├── .env                               # Private config — never commit (gitignored)
├── .env.example                       # Template for .env
├── foundry.toml                       # Foundry project config
├── package.json                       # Node.js dependencies
│
├── contracts/
│   ├── src/
│   │   └── InvoiceLogger.sol          # Onchain invoice registry (non-upgradeable)
│   ├── script/
│   │   └── Deploy.s.sol               # Forge deploy script
│   └── test/
│       └── InvoiceLogger.t.sol        # 25 Forge tests
│
├── scripts/
│   ├── generate-invoice.js            # Generate invoice + hash + cast command
│   ├── verify-invoice.js              # One-command invoice verification
│   └── list-invoices.js               # List all invoices with onchain status
│
├── assets/
│   └── networks.json                  # Pharos testnet + mainnet RPC config
│
├── docs/
│   ├── HOW-IT-WORKS.md                # Technical architecture walkthrough
│   ├── DEVELOPER.md                   # Developer guide — extend and contribute
│   ├── USER-GUIDE.md                  # End-user guide for freelancers
│   ├── INSTALL.md                     # Platform-specific installation steps
│   ├── COMMANDS.md                    # Full cast + script command reference
│   └── SUBMIT.md                      # Pharos Agent Centre submission guide
│
└── invoices/                          # Generated invoice JSONs (gitignored)
```

---

## Prerequisites

Before you start, make sure you have the following installed:

| Tool | Purpose | Install |
|---|---|---|
| **Node.js** v18+ | Runs the invoice generator | [nodejs.org](https://nodejs.org) |
| **Foundry** | Compiles, tests, and deploys the contract | See below |
| **A Pharos wallet** | Signs transactions on the testnet | Any EVM wallet (MetaMask, cast wallet) |
| **Testnet PHRS** | Gas fees for logging invoices | Pharos faucet |

---

## Part 1 — Installation

### Step 1 — Clone the repository

```bash
git clone https://github.com/yourusername/pharos-proofpay.git
cd pharos-proofpay
```

### Step 2 — Install Foundry

Foundry is required to compile, test, and deploy the smart contract.

**macOS / Linux:**
```bash
curl -L https://foundry.paradigm.xyz | bash
source ~/.zshenv
foundryup
```

**Windows (PowerShell):**
```powershell
curl -L https://foundry.paradigm.xyz | bash
# Then open a new terminal and run:
foundryup
```

Verify the installation:
```bash
forge --version
cast --version
```

### Step 3 — Install Foundry standard library

The contract tests require `forge-std`. Run this once in the project root:

```bash
forge install foundry-rs/forge-std
```

This creates a `lib/forge-std` directory. You will see it tracked in `.gitmodules`.

### Step 4 — Install Node.js dependencies

```bash
npm install
```

This installs `ethereum-cryptography`, which provides the real keccak256 hash function used by the invoice generator.

Verify it works:
```bash
node -e "const { keccak256 } = require('ethereum-cryptography/keccak'); console.log('keccak256 ready');"
```

---

## Part 2 — Configuration

### Step 5 — Set up your environment file

Open the `.env` file in the project root and fill in your values:

```bash
# Your wallet private key (keep this secret, never share it)
PRIVATE_KEY=your_private_key_here

# Deployed InvoiceLogger contract address (you will fill this after Step 6)
CONTRACT=

# Pharos Atlantic Testnet RPC — pre-filled, do not change
RPC_URL=https://atlantic.dplabs-internal.com
```

To load the environment variables in your terminal:

```bash
# Linux / macOS
source .env && export PRIVATE_KEY CONTRACT RPC_URL

# Or set them manually:
export PRIVATE_KEY=0xYOUR_KEY
export RPC_URL=https://atlantic.dplabs-internal.com
```

**Windows PowerShell:**
```powershell
$env:PRIVATE_KEY = "0xYOUR_KEY"
$env:RPC_URL = "https://atlantic.dplabs-internal.com"
```

### Step 6 — Get testnet PHRS for gas

You need PHRS tokens on the Pharos Atlantic Testnet to pay for transactions.

1. Go to the Pharos faucet at [https://atlantic.pharosscan.xyz](https://atlantic.pharosscan.xyz)
2. Connect your wallet or paste your address
3. Request testnet PHRS

Verify your balance:
```bash
cast balance $(cast wallet address --private-key $PRIVATE_KEY) \
  --rpc-url $RPC_URL \
  --ether
```

---

## Part 3 — Deploy the Smart Contract

### Step 7 — Run the contract tests (optional but recommended)

Before deploying, verify the contract logic passes all tests:

```bash
forge test -vv
```

Expected output:
```
Running 25 tests for contracts/test/InvoiceLogger.t.sol:InvoiceLoggerTest
[PASS] test_LogInvoice()
[PASS] test_LogInvoiceWithoutClientWallet()
[PASS] test_TotalInvoicesIncrement()
[PASS] test_DuplicateInvoiceReverts()
[PASS] test_EmptyIdReverts()
[PASS] test_EmptyHashReverts()
[PASS] test_VerifyInvoice()
[PASS] test_GetIssuerInvoices()
[PASS] test_GetClientInvoices()
[PASS] test_MarkPaid()
[PASS] test_MarkPaidNotIssuerReverts()
[PASS] test_MarkPaidAlreadyPaidReverts()
[PASS] test_CancelInvoice()
[PASS] test_CancelNotIssuerReverts()
[PASS] test_CancelAlreadyPaidReverts()
[PASS] test_AcknowledgeInvoice()
[PASS] test_AcknowledgeWrongCallerReverts()
[PASS] test_AcknowledgeNoClientWalletReverts()
[PASS] test_AcknowledgeTwiceReverts()
[PASS] test_DisputeInvoice()
[PASS] test_DisputeWrongCallerReverts()
[PASS] test_DisputeNoClientWalletReverts()
[PASS] test_GetOverdueInvoices()
[PASS] test_GetOverdueInvoicesEmpty()
[PASS] test_InvoiceExists()
```

### Step 8 — Deploy InvoiceLogger to Pharos testnet

```bash
forge script contracts/script/Deploy.s.sol:DeployInvoiceLogger \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast
```

The output will print something like:

```
InvoiceLogger deployed at: 0xAbCdEf1234567890...
Network Chain ID: 688689
Deployer: 0xYourWalletAddress
```

Copy the deployed address and set it:

```bash
export CONTRACT=0xAbCdEf1234567890...
```

Also save it in your `.env` file:
```
CONTRACT=0xAbCdEf1234567890...
```

You can verify the deployment on the explorer:
```
https://atlantic.pharosscan.xyz/address/0xYourContractAddress
```

---

## Part 4 — Using the Skill

### Generate an invoice — argument mode

```bash
node scripts/generate-invoice.js \
  --client "Acme Corp" \
  --work "Landing page design and development" \
  --amount 800 \
  --days 7
```

Parameters:

| Flag | Required | Description |
|---|---|---|
| `--client` | Yes | Client name |
| `--work` | Yes | Description of work done (single item) |
| `--amount` | Yes | Invoice amount in USD (single item) |
| `--item "Desc:amount"` | No | Line item — repeat for multiple (replaces `--work`/`--amount`) |
| `--days` | No | Payment due in N days (default: 14) |
| `--id` | No | Custom invoice ID (auto-generated if omitted) |
| `--client-wallet` | No | Client's EVM wallet address — enables onchain acknowledgment/dispute |
| `--autolog` | No | Automatically run `cast send` after generating (requires env vars) |

### Generate an invoice — natural language mode

```bash
echo "Invoice Acme Corp for landing page work, $800, due in 7 days" | \
  node scripts/generate-invoice.js --parse
```

More natural language examples the parser understands:

```bash
echo "Bill TechCorp for React dashboard, 3 days work, $1200, net 14" | node scripts/generate-invoice.js --parse
echo "Invoice DesignHub for brand identity, $500 USD, due in 30 days" | node scripts/generate-invoice.js --parse
echo "Charge ClientX for API integration work, $2000, net 7" | node scripts/generate-invoice.js --parse
```

### What the output looks like

```
╔══════════════════════════════════════════════════════════════╗
║              PHAROS PROOFPAY — GENERATED                  ║
╚══════════════════════════════════════════════════════════════╝

  Invoice ID : INV-202606-347
  Client     : Acme Corp
  Work       : Landing page design and development
  Amount     : $800.00 USD
  Issued     : 2026-06-07
  Due        : 2026-06-14

  Data Hash  : 0xabc123def456...
  Saved to   : invoices/INV-202606-347.json

──────────────────────────────────────────────────────────────
  ONCHAIN LOGGING — Run this to log to Pharos:
──────────────────────────────────────────────────────────────

  cast send $CONTRACT \
    "logInvoice(string,bytes32,uint256,uint256,string,address)" \
    "INV-202606-347" \
    "0xabc123def456..." \
    80000 \
    1751500799 \
    "Acme Corp" \
    "0x0000000000000000000000000000000000000000" \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL
```

### Log the invoice onchain

Copy the `cast send` command from the output and run it. Or build it manually:

```bash
cast send $CONTRACT \
  "logInvoice(string,bytes32,uint256,uint256,string,address)" \
  "INV-202606-347" \
  "0xYOUR_HASH" \
  80000 \
  1751500799 \
  "Acme Corp" \
  "0x0000000000000000000000000000000000000000" \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC_URL
```

> Amount format: USD cents. $800.00 = `80000`. $1,200.00 = `120000`.
> Due date: Unix timestamp. The generator prints the correct value.
> No client wallet: pass `0x0000000000000000000000000000000000000000`.
> With a client wallet: replace the last address with your client's wallet address.

You will receive a transaction hash. Check it on the explorer:
```
https://atlantic.pharosscan.xyz/tx/0xYOUR_TX_HASH
```

**Or use `--autolog` to skip this step entirely:**

```bash
node scripts/generate-invoice.js \
  --client "Acme Corp" \
  --work "Landing page design" \
  --amount 800 \
  --days 7 \
  --autolog
```

This generates the invoice, hashes it, and submits it to Pharos in one command. Requires `PRIVATE_KEY` and `CONTRACT` set in your `.env`.

### Verify an invoice has not been tampered with

**Using the script (recommended):**

```bash
node scripts/verify-invoice.js --id INV-202606-347
```

This reads the local JSON file, recomputes the hash, queries Pharos, and compares. It also detects wallet spoofing — if the JSON claims to be from a different freelancer than the wallet that actually signed the transaction, it will flag it.

**Using cast directly:**

```bash
cast call $CONTRACT \
  "verifyInvoice(string,bytes32)" \
  "INV-202606-347" "0xYOUR_HASH" \
  --rpc-url $RPC_URL
```

- Returns `0x01` → invoice is untampered
- Returns `0x00` → hash mismatch, data may have been altered

### List all your invoices

```bash
node scripts/list-invoices.js
```

Shows a table of every invoice in your local `invoices/` folder with live onchain status (if `CONTRACT` is set). Filter flags:

```bash
node scripts/list-invoices.js --overdue          # only UNPAID past due date
node scripts/list-invoices.js --status PAID      # only paid invoices
node scripts/list-invoices.js --status CANCELLED # only cancelled invoices
```

### Fetch the full onchain record

```bash
cast call $CONTRACT \
  "getInvoice(string)" \
  "INV-202606-347" \
  --rpc-url $RPC_URL
```

Returns: `invoiceId, dataHash, issuer, clientWallet, timestamp, dueTimestamp, amountUSD, clientName, status (0=UNPAID/1=PAID/2=CANCELLED), clientAcknowledged, clientDisputed, exists`

### Mark an invoice as paid

```bash
cast send $CONTRACT \
  "markPaid(string)" \
  "INV-202606-347" \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC_URL
```

Only the issuer wallet can mark an invoice paid. Status changes permanently from `UNPAID` to `PAID`.

### Cancel an invoice

```bash
cast send $CONTRACT \
  "cancelInvoice(string)" \
  "INV-202606-347" \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC_URL
```

Only the issuer wallet can cancel. Status changes permanently to `CANCELLED`. The original record is never deleted.

### Client wallet: acknowledgment and dispute

If you logged an invoice with `--client-wallet 0xAddress`, the client's wallet can independently:

**Acknowledge (they agree to the invoice):**
```bash
cast send $CONTRACT \
  "acknowledgeInvoice(string)" \
  "INV-202606-347" \
  --private-key $CLIENT_PRIVATE_KEY \
  --rpc-url $RPC_URL
```

**Dispute (they disagree with the invoice):**
```bash
cast send $CONTRACT \
  "disputeInvoice(string)" \
  "INV-202606-347" \
  --private-key $CLIENT_PRIVATE_KEY \
  --rpc-url $RPC_URL
```

Both are permanent onchain records. Only the registered `clientWallet` can call these — not the issuer, not any other address.

### Query invoices by client wallet

```bash
cast call $CONTRACT \
  "getClientInvoices(address)" \
  "0xClientWalletAddress" \
  --rpc-url $RPC_URL
```

### Find overdue invoices

```bash
cast call $CONTRACT \
  "getOverdueInvoices(address)" \
  $(cast wallet address --private-key $PRIVATE_KEY) \
  --rpc-url $RPC_URL
```

Returns all UNPAID invoices past their due timestamp.

### List all invoices from your wallet

```bash
cast call $CONTRACT \
  "getIssuerInvoices(address)" \
  $(cast wallet address --private-key $PRIVATE_KEY) \
  --rpc-url $RPC_URL
```

### Check global invoice count

```bash
cast call $CONTRACT "totalInvoices()" --rpc-url $RPC_URL | cast to-dec
```

---

## Part 5 — Install as an AI Agent Skill

Once installed, AI agents (Claude Code, Codex, OpenClaw) can invoke this skill from natural language without any manual steps.

**Claude Code:**
```bash
cp SKILL.md ~/.claude/skills/pharos-proofpay.md
```

**Codex:**
```bash
cp SKILL.md ~/.codex/skills/pharos-proofpay.md
```

**OpenClaw:**
```bash
openclaw skills add https://github.com/yourusername/pharos-proofpay
```

After installing, you can say to your AI agent:

> "Invoice Acme Corp for landing page work, $800, due in 7 days"

and the agent will handle generation and onchain logging automatically.

---

## Part 6 — Submit to Pharos Agent Centre

This skill was built for the **Pharos Agent Centre Skill Builder Campaign**.

### Submission checklist

Before submitting, confirm all of these:

- [ ] Repository is public on GitHub
- [ ] Contract is deployed on Pharos Atlantic Testnet and address is documented
- [ ] `forge test` passes all 25 tests
- [ ] `node scripts/generate-invoice.js --client "Test" --work "Demo" --amount 100 --days 7` runs without errors
- [ ] At least one invoice has been logged onchain (have a transaction hash ready)
- [ ] Demo video or screenshots showing the full flow are ready

### Submission message format

Post the following in the `#skill-submissions` channel on the Pharos Discord:

```
Skill Name:
pharos-proofpay

Short Description:
AI agent skill that turns a plain English sentence into a structured invoice,
hashes it with keccak256, and logs the hash immutably on Pharos — giving
freelancers tamper-proof, blockchain-timestamped proof of every invoice issued.

GitHub Link:
https://github.com/yourusername/pharos-proofpay

Demo Link / Screenshots:
[paste your video link or screenshots here]

How to Use:
1. npm install && forge install foundry-rs/forge-std
2. Set PRIVATE_KEY, RPC_URL in .env
3. forge script contracts/script/Deploy.s.sol:DeployInvoiceLogger --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast
4. export CONTRACT=<deployed address>
5. node scripts/generate-invoice.js --client "Acme Corp" --work "Dashboard" --amount 800 --days 7
6. Copy the cast send command from the output and run it to log onchain
   (or add --autolog to auto-submit)
7. node scripts/verify-invoice.js --id INV-ID
   (or: cast call $CONTRACT "verifyInvoice(string,bytes32)" "INV-ID" "0xHASH" --rpc-url $RPC_URL)

Supported Framework:
Foundry (forge + cast) + Node.js

Dependencies:
- Foundry (forge, cast)
- Node.js v18+
- npm package: ethereum-cryptography
- Network: Pharos Atlantic Testnet (Chain ID: 688689)
```

---

## Smart Contract Reference

**InvoiceLogger.sol** — non-upgradeable, deployed on Pharos Atlantic Testnet

### Write functions

| Function | Signature | Who can call | Description |
|---|---|---|---|
| `logInvoice` | `(string, bytes32, uint256, uint256, string, address)` | Anyone | Log a new invoice onchain |
| `markPaid` | `(string)` | Issuer only | Mark an invoice as PAID |
| `cancelInvoice` | `(string)` | Issuer only | Cancel an invoice permanently |
| `acknowledgeInvoice` | `(string)` | Client wallet only | Client confirms they agree to the invoice |
| `disputeInvoice` | `(string)` | Client wallet only | Client raises a permanent onchain dispute |

### Read functions

| Function | Signature | Description |
|---|---|---|
| `verifyInvoice` | `(string, bytes32) → bool` | Verify invoice hash matches the onchain record |
| `getInvoice` | `(string) → Invoice` | Fetch the full invoice struct |
| `getIssuerInvoices` | `(address) → string[]` | List all invoice IDs logged by a wallet |
| `getClientInvoices` | `(address) → string[]` | List all invoices where this wallet is the registered client |
| `getOverdueInvoices` | `(address) → string[]` | List UNPAID invoices past their due date for an issuer |
| `invoiceExists` | `(string) → bool` | Check if an invoice ID is already taken |
| `totalInvoices` | `() → uint256` | Global invoice count |

### Invoice lifecycle

```
logInvoice()  →  UNPAID
                   │
          ┌────────┴────────┐
          │                 │
       markPaid()    cancelInvoice()
          │                 │
        PAID           CANCELLED
```

While UNPAID, the client wallet (if registered) can independently call `acknowledgeInvoice()` or `disputeInvoice()` — these do not change the payment status but create permanent onchain evidence of client sentiment.

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `InvoiceAlreadyExists` | Invoice ID already logged | Let the generator auto-assign a new ID |
| `InvoiceNotFound` | ID does not exist onchain | Verify the ID spelling and confirm it was logged |
| `NotInvoiceIssuer` | Wrong wallet calling `markPaid` or `cancelInvoice` | Only the wallet that logged the invoice can change its status |
| `NotInvoiceClient` | Wrong wallet calling `acknowledgeInvoice` or `disputeInvoice` | Only the registered `clientWallet` can call these |
| `NoClientWalletSet` | `acknowledgeInvoice`/`disputeInvoice` called but no client wallet was registered | Re-log the invoice with `--client-wallet 0xAddress` |
| `InvoiceAlreadyClosed` | Calling `markPaid` or `cancelInvoice` on an invoice that is already PAID or CANCELLED | Status is final — cannot be changed again |
| `InvoiceAlreadyAcknowledged` | Client called `acknowledgeInvoice` twice | Acknowledgment is permanent and can only happen once |
| `EmptyInvoiceId` | Blank ID was passed | Provide a valid ID or omit `--id` to auto-generate |
| `EmptyHash` | Hash is zero bytes | Re-run the invoice generator |
| `insufficient funds` | Not enough PHRS for gas | Top up from the Pharos testnet faucet |
| `WARNING: ethereum-cryptography not installed` | npm package missing | Run `npm install` |
| `forge: command not found` | Foundry not installed | Run `foundryup` |
| `cast: command not found` | Foundry not on PATH | Re-run `foundryup` or use WSL2 on Windows |
| Hash mismatch on verify | Invoice file was modified after logging | Use the original unedited JSON file |

---

## Network

| | Testnet | Mainnet |
|---|---|---|
| Name | Pharos Atlantic Testnet | Pharos Mainnet |
| Chain ID | 688689 | 688689 |
| RPC | `https://atlantic.dplabs-internal.com` | `https://rpc.pharos.xyz` |
| Explorer | `https://atlantic.pharosscan.xyz` | `https://pharosscan.xyz` |
| Token | PHRS | PHRS |

---

## Author

Built by **iEngineer Solutions** ([@M_Lumixx](https://x.com/M_Lumixx)) for the Pharos Agent Centre Skill Builder Campaign.

---

## License

MIT

