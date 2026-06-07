# Submission Guide — Pharos Agent Centre Skill Builder Campaign

Everything you need to do before hitting Submit.

---

## Campaign Details

| | |
|---|---|
| **Campaign** | Pharos Agent Centre Skill Builder |
| **Submission Channel** | `#skill-submissions` on Pharos Discord |
| **Deadline** | 8 June 2026 |
| **Reward** | $500 per qualified skill |
| **Announcement** | 15 June 2026 |

---

## Pre-Submission Checklist

Complete every item before posting your submission.

### Code

- [ ] Repository is **public** on GitHub
- [ ] `forge test -vv` passes all 16 tests
- [ ] `node scripts/generate-invoice.js --client "Test" --work "Demo" --amount 100 --days 7` runs without errors
- [ ] `node scripts/verify-invoice.js --id <generated-id>` runs without errors
- [ ] `node scripts/list-invoices.js` runs without errors
- [ ] No private keys, `.env` files, or sensitive data committed to the repo
- [ ] `invoices/` folder is gitignored (check `.gitignore`)

### Onchain

- [ ] `InvoiceLogger.sol` is deployed on Pharos Atlantic Testnet
- [ ] Contract address is documented (in README or SKILL.md)
- [ ] At least **one invoice has been logged onchain** — you have a transaction hash
- [ ] That transaction is visible on `https://atlantic.pharosscan.xyz`

### Documentation

- [ ] `README.md` has clear setup instructions
- [ ] `SKILL.md` is present and describes the skill correctly
- [ ] GitHub repo has a description and topic tags

### Demo

- [ ] You have a **video or screenshots** showing the full flow:
  1. Running `generate-invoice.js`
  2. Running `cast send` to log it
  3. The transaction appearing on the Pharos explorer
  4. Running `verify-invoice.js` showing VERIFIED

---

## How to Get a Demo Video or Screenshots

You do not need a professional video. A screen recording of your terminal is enough.

### Option A — Terminal screenshots

1. Run `node scripts/generate-invoice.js --client "Demo Client" --work "Demo work" --amount 500 --days 7`
2. Screenshot the output (shows invoice + hash + cast command)
3. Run the `cast send` command
4. Screenshot the transaction hash output
5. Open `https://atlantic.pharosscan.xyz/tx/0xYourTxHash` and screenshot it
6. Run `node scripts/verify-invoice.js --id <invoice-id>` and screenshot the `✅ VERIFIED` output

### Option B — Screen recording

Use any screen recorder (QuickTime on Mac, Xbox Game Bar on Windows, OBS on any platform) and record yourself running through the full flow. Upload to YouTube (unlisted is fine) or Loom.

---

## Prepare the GitHub Repository

### What your repo should contain

```
pharos-proofpay/
├── README.md           ← must be clear and complete
├── SKILL.md            ← required by Pharos Agent Centre
├── .gitignore          ← invoices/, .env, node_modules/ must be ignored
├── contracts/
│   ├── src/InvoiceLogger.sol
│   ├── script/Deploy.s.sol
│   └── test/InvoiceLogger.t.sol
├── scripts/
│   ├── generate-invoice.js
│   ├── verify-invoice.js
│   └── list-invoices.js
├── assets/networks.json
├── references/invoice-ops.md
├── docs/
│   ├── HOW-IT-WORKS.md
│   ├── DEVELOPER.md
│   ├── USER-GUIDE.md
│   ├── INSTALL.md
│   └── SUBMIT.md
├── foundry.toml
└── package.json
```

### What must NOT be in your repo

- `.env` file
- `invoices/*.json` files (gitignored, contains client data)
- `node_modules/`
- `out/` or `cache/` (Foundry build artifacts)
- Your private key anywhere in any file

### Final check before making the repo public

```bash
git log --oneline        # review all commits
git diff HEAD~1          # check last commit for sensitive data
grep -r "PRIVATE_KEY=" . --include="*.js" --include="*.sol" --include="*.json"
```

---

## The Submission Message

Post this **as one complete message** in the `#skill-submissions` Discord channel. Replace every placeholder in brackets.

---

**Skill Name:**
`pharos-proofpay`

**Short Description:**
An AI agent skill that turns a plain English sentence into a professional invoice, hashes it with keccak256, and logs the hash immutably on Pharos — giving freelancers tamper-proof, blockchain-timestamped proof of every invoice issued. Supports full invoice lifecycle (UNPAID → PAID / CANCELLED), multi-line-item invoices, onchain overdue detection, and one-command verification.

**GitHub Link:**
`https://github.com/[YOUR_USERNAME]/pharos-proofpay`

**Demo Link / Screenshots:**
`[paste your YouTube/Loom link or attach screenshots here]`

**Instructions on How to Use the Skill:**

```
1. Clone the repo and install dependencies:
   git clone https://github.com/[YOUR_USERNAME]/pharos-proofpay
   cd pharos-proofpay
   npm install
   forge install foundry-rs/forge-std

2. Set environment variables in .env:
   PRIVATE_KEY=<your_wallet_private_key>
   RPC_URL=https://atlantic.dplabs-internal.com

3. Deploy the contract (once):
   forge script contracts/script/Deploy.s.sol:DeployInvoiceLogger \
     --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast
   # Save the printed address → CONTRACT=0x...

4. Generate and log an invoice in one step:
   node scripts/generate-invoice.js \
     --client "Acme Corp" --work "Dashboard build" --amount 800 --days 14 \
     --autolog

5. Verify the invoice is untampered:
   node scripts/verify-invoice.js --id INV-202606-XXX

6. View all your invoices:
   node scripts/list-invoices.js

7. Mark paid when client pays:
   cast send $CONTRACT "markPaid(string)" "INV-202606-XXX" \
     --private-key $PRIVATE_KEY --rpc-url $RPC_URL
```

**Supported Framework:**
Foundry (forge + cast) + Node.js v18+

**Extra Notes / Dependencies:**
- Requires Foundry and Node.js v18+
- npm dependency: `ethereum-cryptography`
- Network: Pharos Atlantic Testnet (Chain ID: 688689)
- RPC: `https://atlantic.dplabs-internal.com`
- Deployed contract: `[YOUR_CONTRACT_ADDRESS]`
- Full docs in `/docs` — HOW-IT-WORKS, DEVELOPER, USER-GUIDE, INSTALL

---

## After Submitting

- Watch the `#skill-submissions` channel for reviewer feedback
- If a reviewer asks a question, respond promptly
- Winners announced 15 June 2026
- Keep the GitHub repo public until at least after the announcement date

---

## If You Need to Update After Submitting

If reviewers request changes or you find a bug after submitting:

1. Fix the code and push to GitHub
2. Reply in the same Discord thread with: `"Updated — [brief description of what changed]"`
3. Do not submit a second message for the same skill

---

## Common Rejection Reasons

Understanding these helps you avoid them:

| Reason | How to avoid |
|---|---|
| No onchain proof — contract not deployed | Deploy before submitting, include contract address |
| Private key found in repository | Check git history with `git log -p`, never commit `.env` |
| Tests do not pass | Run `forge test` before submitting |
| Skill does not match documentation | Make sure your submission message matches what the code actually does |
| Demo not working | Test your demo commands fresh in a new terminal before recording |
| Missing SKILL.md | This file is required — it defines the AI agent skill |


