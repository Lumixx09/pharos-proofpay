# Pharos ProofPay

> Turn a plain English sentence into a professional invoice with permanent, tamper-proof proof on the Pharos blockchain.

**GitHub:** https://github.com/Lumixx09/pharos-proofpay
**Network:** Pharos Atlantic Testnet (Chain ID: 688689)
**Live Demo Tx:** https://atlantic.pharosscan.xyz/tx/0x04a716bf83b966540cf0f4251074b0081408a43a79d71c5cb3348b40f3fa6248

---

## What Is Pharos ProofPay?

Pharos ProofPay is an AI agent skill that does three things in one command:

1. **Creates** a professional invoice from a plain English sentence
2. **Fingerprints** it using keccak256 cryptographic hashing
3. **Logs** that fingerprint permanently on the Pharos blockchain

The result is an invoice that cannot be denied, cannot be altered, and cannot be faked — because the proof lives on a public blockchain that no single person or company controls.

You do not need to understand blockchain to use this. You just describe your work, and the skill handles everything else.

---

## Why This Exists — The Real Problem

If you are a freelancer, contractor, agency, or any service provider, you have probably faced at least one of these:

- A client says "I never received that invoice"
- A client claims the amount was different from what you agreed
- A client disputes when work was delivered
- You have no way to prove a PDF invoice was not edited after the fact
- An email chain gets deleted and there is no record

Traditional invoices — PDFs, emails, Word documents — are trivially easy to forge or edit. There is no ground truth. When a dispute happens, it becomes your word against theirs.

**Pharos ProofPay solves this by making the invoice permanent and mathematically verifiable the moment it is created.**

---

## Who Should Use This

### Freelancers and Independent Contractors
Designers, developers, writers, consultants, photographers, video editors — anyone who invoices clients for work. If you have ever had a client dispute an invoice, this protects you. If you have never had a dispute, this ensures you never will.

### Agencies and Studios
Creative agencies, software studios, and consulting firms that issue invoices to corporate clients. Onchain proof is especially powerful when dealing with legal or procurement departments that require documented audit trails.

### Small and Medium Businesses
Any business that provides services on credit — deliver now, collect later. With Pharos ProofPay, every invoice you issue has a blockchain timestamp that proves exactly when it was created and what it said.

### Legal and Financial Professionals
Lawyers, accountants, and advisors who need verifiable records of billing activity. The hash-based verification provides mathematical proof of document integrity that is stronger than a signed PDF.

### Any Industry Where "Proof of Invoice" Matters
Construction, logistics, healthcare billing, IT services, media production — anywhere that invoice disputes cost time and money.

---

## How It Works — Plain English

Think of it like this. When you take a photo with your phone, the photo file contains metadata — the exact date, time, and location it was taken. That metadata cannot be changed without breaking the file. Pharos ProofPay does the same thing for your invoice, but using a public blockchain instead of your phone's internal clock.

Here is the full flow:

```
You describe your work in plain English
              ↓
The skill creates a structured invoice JSON file
(saved on your computer)
              ↓
The entire invoice is run through keccak256 hashing
— this produces a unique 64-character fingerprint
— if even one character in the invoice changes,
  the fingerprint changes completely
              ↓
That fingerprint (not your invoice data) is sent
to the Pharos blockchain and stored permanently
with a timestamp, your wallet address, the amount,
and the client name
              ↓
You receive a transaction hash — a link to the
permanent onchain record anyone can look up
              ↓
At any time in the future, you or anyone else
can verify the invoice is authentic by running
one command — it re-fingerprints the file and
checks it matches the onchain record
```

**What lives on the blockchain:** The fingerprint (hash), your wallet address, the invoice ID, the amount in USD cents, the client name, the due date timestamp, and the current status.

**What stays on your computer:** The full invoice text — client details, line items, descriptions. This is private. Nobody can read it from the blockchain.

---

## Understanding Invoice Status

Every invoice has a status that lives **on the blockchain**, not in your local file.

```
You log the invoice  →  Status: UNPAID  (starting state)
                              │
               ┌──────────────┴──────────────┐
               │                             │
     Client pays you                  Work called off
     You run markPaid()               You run cancelInvoice()
               │                             │
          Status: PAID                Status: CANCELLED
```

**Important:** The local JSON file on your computer always shows `"status": "UNPAID"` — do not edit it, because that would break the hash. The real, live status lives onchain. When you run `node scripts/list-invoices.js`, it reads the live status from Pharos and shows you the truth.

### Checking if an invoice is paid

```bash
node scripts/list-invoices.js
```

This shows every invoice with its current onchain status:

```
  Invoice ID          Client               Amount      Due         Status
  ──────────────────────────────────────────────────────────────────────────
  INV-202606-213      Acme Corp            $1200.00    2026-06-14  PAID
  INV-202606-381      DesignHub            $500.00     2026-06-30  UNPAID
  INV-202606-547      TechCorp             $2000.00    2026-06-07  OVERDUE ⚠
  ──────────────────────────────────────────────────────────────────────────
  3 invoice(s)   Total: $3700.00   Outstanding: $2500.00
```

### Recording a payment

When your client pays you (by bank transfer, PayPal, crypto, or any method), you record it onchain:

```bash
node scripts/log-invoice.js "INV-202606-213" markPaid
```

Or with cast:

```bash
cast send $CONTRACT "markPaid(string)" "INV-202606-213" \
  --private-key $PRIVATE_KEY --rpc-url $RPC_URL
```

The status changes permanently to PAID on the blockchain. This cannot be undone.

---

## Why It Is Safe

### Your private key never leaves your machine
Your wallet's private key is stored only in a `.env` file on your own computer. It is never sent to any server, never logged, never printed. The `.env` file is gitignored — it cannot accidentally be committed to GitHub.

### Your invoice data is private
Only the fingerprint (hash) of your invoice goes onchain. The actual contents — client name, amount, work description — stay in a local JSON file on your computer. No one can read your invoice details from the blockchain.

### The contract cannot be changed or taken down
The `InvoiceLogger` smart contract is non-upgradeable. There is no admin key, no owner, no backdoor. Once deployed, no one — not even the developer — can alter or delete records. It runs on Pharos' decentralized network.

### Logged invoices cannot be altered
Once an invoice hash is logged, it is permanent. If you edit the invoice file after logging it, the hash will not match the onchain record and verification will fail — proving the file was tampered with. This protection works against both clients and freelancers equally.

### Spoofing is detected automatically
The verification script checks not just the hash, but also whether the wallet address in the invoice JSON matches the wallet that actually signed the onchain transaction. If someone tries to copy your invoice and claim they sent it, the verifier catches it:

```
❌ SPOOFING DETECTED — Security Alert!
   The invoice JSON claims it belongs to freelancer wallet: 0xFakeAddress
   However, this invoice hash was registered onchain by wallet: 0xRealAddress
```

---

## The Client Consent System

By default, Pharos ProofPay gives you **proof of issuance** — it proves your wallet logged that invoice at that time. This is already strong protection.

But if you want to go further and get **proof of agreement** — where the client cryptographically confirms they received and agree to the invoice — you can register their wallet address when creating the invoice:

```bash
node scripts/generate-invoice.js \
  --client "Acme Corp" \
  --work "Website redesign" \
  --amount 2000 \
  --days 14 \
  --client-wallet 0xClientWalletAddress
```

This registers their wallet onchain. They can then use their own wallet to:

**Acknowledge (they agree):**
The client signs a transaction with their own wallet. This is cryptographic proof they agreed to the invoice — stronger than any email or signed PDF.

**Dispute (they disagree):**
The client places a permanent onchain record of disagreement. This cannot be hidden or deleted. It is public evidence of the dispute.

Both actions can only be performed by the exact registered wallet — not the issuer, not anyone else. Your client's wallet is never drained or charged anything except a tiny gas fee (fractions of a cent on testnet, near-zero on Pharos mainnet).

**If your client is not comfortable with blockchain:** That is completely fine. Skip `--client-wallet` entirely. The system works the same way — you just have proof of issuance instead of proof of agreement.

---

## Installing as an AI Agent Skill

Once installed, you never need to run commands manually again. Just talk to your AI agent in plain English and it handles everything.

### Claude Code

```bash
# Clone the repo
git clone https://github.com/Lumixx09/pharos-proofpay
cd pharos-proofpay

# Copy the skill definition to Claude's skills folder
cp SKILL.md ~/.claude/skills/pharos-proofpay.md
```

Then in Claude Code, just say:

> "Invoice Acme Corp for landing page design, $800, due in 14 days"

Claude will generate the invoice, hash it, and log it to Pharos — all from that one sentence.

### Codex

```bash
cp SKILL.md ~/.codex/skills/pharos-proofpay.md
```

### Pharos Agent Centre

```bash
npx skills add https://github.com/Lumixx09/pharos-proofpay
```

---

## How to Prompt the Agent

Once the skill is installed in your AI agent, you speak naturally. The agent understands all of these:

### Creating invoices

```
"Invoice Acme Corp for landing page design, $800, due in 7 days"
"Bill TechCorp for the React dashboard we built, $1200, net 14"
"Charge DesignHub for logo design and brand identity work, $650, due in 30 days"
"Create invoice for ClientX — API integration, $2000, 7 day terms"
"Invoice GlobalMedia for video production, $3500, net 21"
```

### Checking invoice status

```
"Is INV-202606-213 paid yet?"
"Show me all my overdue invoices"
"List all unpaid invoices"
"What's the status of the Acme Corp invoice?"
"Show me everything logged onchain from my wallet"
```

### Marking invoices paid or cancelled

```
"Mark INV-202606-213 as paid — Acme Corp just paid"
"Cancel invoice INV-202606-381, the project was called off"
"Record payment received for the TechCorp invoice"
```

### Verifying invoice integrity

```
"Verify invoice INV-202606-213"
"Check if the DesignHub invoice has been tampered with"
"Confirm the hash matches for INV-202606-347"
```

### Multi-item invoices

```
"Invoice DesignHub for: logo design $400, brand guide $300, business cards $150 — due in 30 days"
"Bill Acme Corp for development $800 and QA testing $200, net 14"
```

---

## Quick Start — Manual Setup

If you want to use the tool directly without an AI agent:

### Step 1 — Clone and install

```bash
git clone https://github.com/Lumixx09/pharos-proofpay
cd pharos-proofpay
npm install
forge install foundry-rs/forge-std
```

### Step 2 — Configure

Copy `.env.example` to `.env` and fill in:

```bash
PRIVATE_KEY=your_wallet_private_key
RPC_URL=https://atlantic.dplabs-internal.com
CONTRACT=                              # fill after deploying
```

### Step 3 — Deploy the contract

```bash
forge script contracts/script/Deploy.s.sol:DeployInvoiceLogger \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast
```

Copy the deployed address into your `.env` as `CONTRACT=0x...`

### Step 4 — Generate and log your first invoice

```bash
node scripts/generate-invoice.js \
  --client "Acme Corp" \
  --work "Landing page design" \
  --amount 800 \
  --days 14 \
  --autolog
```

Done. Your invoice is fingerprinted and logged on Pharos.

### Step 5 — Verify it

```bash
node scripts/verify-invoice.js --id INV-202606-347
```

```
✅ VERIFIED AUTHENTIC — Invoice details are completely verified!
   The file has not been altered, and the signer matches the creator signature.
```

---

## All Available Commands

### Generate an invoice

```bash
# Single item
node scripts/generate-invoice.js \
  --client "Acme Corp" \
  --work "Landing page" \
  --amount 800 \
  --days 14

# Multiple line items
node scripts/generate-invoice.js \
  --client "DesignHub" \
  --item "Logo design:400" \
  --item "Brand guide:300" \
  --item "Business cards:150" \
  --days 30

# Natural language
echo "Invoice TechCorp for dashboard work, $1200, net 14" | \
  node scripts/generate-invoice.js --parse

# Generate and log in one step
node scripts/generate-invoice.js --client "Acme" --work "Dev" --amount 800 --days 7 --autolog

# With client wallet for two-party acknowledgment
node scripts/generate-invoice.js --client "Acme" --work "Dev" --amount 800 --days 7 \
  --client-wallet 0xClientWalletAddress
```

### List and filter invoices

```bash
node scripts/list-invoices.js                    # all invoices with live status
node scripts/list-invoices.js --overdue          # UNPAID past due date
node scripts/list-invoices.js --status PAID      # paid invoices only
node scripts/list-invoices.js --status CANCELLED # cancelled invoices only
```

### Verify an invoice

```bash
node scripts/verify-invoice.js --id INV-202606-347
node scripts/verify-invoice.js --file invoices/INV-202606-347.json
```

### Mark paid / cancel

```bash
# Mark paid (only you as issuer can do this)
cast send $CONTRACT "markPaid(string)" "INV-202606-347" \
  --private-key $PRIVATE_KEY --rpc-url $RPC_URL

# Cancel (only you as issuer can do this)
cast send $CONTRACT "cancelInvoice(string)" "INV-202606-347" \
  --private-key $PRIVATE_KEY --rpc-url $RPC_URL
```

### Client acknowledgment and dispute

```bash
# Client acknowledges they agree (only client wallet can call this)
cast send $CONTRACT "acknowledgeInvoice(string)" "INV-202606-347" \
  --private-key $CLIENT_PRIVATE_KEY --rpc-url $RPC_URL

# Client disputes the invoice (only client wallet can call this)
cast send $CONTRACT "disputeInvoice(string)" "INV-202606-347" \
  --private-key $CLIENT_PRIVATE_KEY --rpc-url $RPC_URL
```

### Read onchain data

```bash
# Full invoice record
cast call $CONTRACT "getInvoice(string)" "INV-202606-347" --rpc-url $RPC_URL

# Verify hash
cast call $CONTRACT "verifyInvoice(string,bytes32)" "INV-202606-347" "0xHASH" --rpc-url $RPC_URL

# All invoices by your wallet
cast call $CONTRACT "getIssuerInvoices(address)" $YOUR_ADDRESS --rpc-url $RPC_URL

# All invoices where a wallet is registered as client
cast call $CONTRACT "getClientInvoices(address)" $CLIENT_ADDRESS --rpc-url $RPC_URL

# Overdue invoices
cast call $CONTRACT "getOverdueInvoices(address)" $YOUR_ADDRESS --rpc-url $RPC_URL

# Total invoices logged globally
cast call $CONTRACT "totalInvoices()" --rpc-url $RPC_URL | cast to-dec
```

---

## Project Structure

```
pharos-proofpay/
│
├── README.md                          # This file
├── SKILL.md                           # AI agent skill definition
├── .env.example                       # Environment variable template
├── foundry.toml                       # Foundry project config
├── package.json                       # Node.js dependencies
│
├── contracts/
│   ├── src/
│   │   └── InvoiceLogger.sol          # Onchain invoice registry (non-upgradeable)
│   ├── script/
│   │   └── Deploy.s.sol               # Forge deploy script
│   └── test/
│       └── InvoiceLogger.t.sol        # 25 Forge unit tests
│
├── scripts/
│   ├── generate-invoice.js            # Invoice generator — natural language + flags
│   ├── verify-invoice.js              # Verify integrity + detect spoofing
│   ├── list-invoices.js               # List invoices with live onchain status
│   ├── log-invoice.js                 # Submit invoice to chain via ethers.js
│   └── deploy.js                      # Deploy contract via ethers.js (no Foundry needed)
│
├── assets/
│   └── networks.json                  # Pharos testnet + mainnet RPC config
│
├── docs/
│   ├── HOW-IT-WORKS.md                # Technical architecture deep-dive
│   ├── DEVELOPER.md                   # Developer guide — extend and contribute
│   ├── USER-GUIDE.md                  # Plain English guide for non-technical users
│   ├── INSTALL.md                     # Platform-specific installation (Windows/Mac/Linux)
│   ├── COMMANDS.md                    # Full command reference
│   └── SUBMIT.md                      # Pharos Agent Centre submission guide
│
└── invoices/                          # Your generated invoice JSONs (gitignored)
```

---

## Smart Contract Reference

**InvoiceLogger.sol** — non-upgradeable, no owner, no admin key

### Write functions (change state — costs gas)

| Function | Who can call | What it does |
|---|---|---|
| `logInvoice(id, hash, amount, dueDate, client, clientWallet)` | Anyone | Creates a new immutable invoice record |
| `markPaid(invoiceId)` | Issuer only | Changes status from UNPAID to PAID |
| `cancelInvoice(invoiceId)` | Issuer only | Changes status from UNPAID to CANCELLED |
| `acknowledgeInvoice(invoiceId)` | Registered client wallet only | Client cryptographically confirms agreement |
| `disputeInvoice(invoiceId)` | Registered client wallet only | Client places a permanent onchain dispute |

### Read functions (free — no gas)

| Function | What it returns |
|---|---|
| `getInvoice(invoiceId)` | Full invoice record: hash, issuer, amount, status, acknowledged, disputed |
| `verifyInvoice(invoiceId, hash)` | true if hash matches, false if tampered |
| `getIssuerInvoices(address)` | All invoice IDs logged by this wallet |
| `getClientInvoices(address)` | All invoices where this wallet is the registered client |
| `getOverdueInvoices(address)` | All UNPAID invoices past their due date for this issuer |
| `invoiceExists(invoiceId)` | true/false — check if an ID is already taken |
| `totalInvoices()` | Global count of all invoices ever logged |

---

## Running the Tests

```bash
forge test -vv
```

Expected: 25 tests, all passing.

```
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

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| `InvoiceAlreadyExists` | Invoice ID already logged onchain | Let the generator auto-assign a new ID (omit `--id`) |
| `InvoiceNotFound` | ID does not exist onchain | Check spelling and confirm the invoice was logged |
| `NotInvoiceIssuer` | Wrong wallet calling `markPaid` or `cancelInvoice` | Only the wallet that originally logged the invoice can change its status |
| `NotInvoiceClient` | Wrong wallet calling `acknowledgeInvoice` or `disputeInvoice` | Only the registered `clientWallet` can call these |
| `NoClientWalletSet` | Client functions called but no wallet was registered | Re-log with `--client-wallet 0xAddress` |
| `InvoiceAlreadyClosed` | Trying to mark paid or cancel an already closed invoice | Status is final — PAID and CANCELLED cannot be changed |
| `InvoiceAlreadyAcknowledged` | Client acknowledged twice | Acknowledgment is permanent and can only happen once |
| `EmptyInvoiceId` | Blank ID passed | Omit `--id` to auto-generate |
| `EmptyHash` | Hash is zero bytes | Re-run the invoice generator |
| `insufficient funds` | No PHRS for gas | Get testnet PHRS from Pharos Discord faucet |
| `npm install` fails | Node.js too old | Upgrade to Node.js v18 or later |
| `forge: command not found` | Foundry not installed | Run `foundryup` (Mac/Linux) or use WSL2 on Windows |
| `cast: command not found` | Foundry not on PATH | Run `foundryup` or use `node scripts/log-invoice.js` instead |
| Hash mismatch on verify | Invoice file was edited after logging | Use the original unedited JSON — to fix, cancel and re-issue |
| Spoofing detected on verify | JSON claims wrong wallet | The invoice was not issued by the claimed wallet |

---

## Network

| | Testnet | Mainnet |
|---|---|---|
| Name | Pharos Atlantic Testnet | Pharos Mainnet |
| Chain ID | 688689 | 688689 |
| RPC | `https://atlantic.dplabs-internal.com` | `https://rpc.pharos.xyz` |
| Explorer | `https://atlantic.pharosscan.xyz` | `https://pharosscan.xyz` |
| Token | PHRS (free from faucet) | PHRS |

---

## Author

Built by **iEngineer Solutions** ([@M_Lumixx](https://x.com/M_Lumixx)) for the Pharos Agent Centre Skill Builder Campaign.

---

## License

MIT
