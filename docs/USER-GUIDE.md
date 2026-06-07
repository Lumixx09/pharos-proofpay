# User Guide — pharos-proofpay

**For freelancers and contractors who want to use this tool.**
No blockchain experience required.

---

## What Is This?

pharos-proofpay is a tool that:

1. Creates a professional invoice from a single sentence
2. Stamps it with a permanent, tamper-proof timestamp on the Pharos blockchain

That timestamp is your proof. If a client ever disputes when an invoice was sent, or claims the amount was different, you can prove it with one command — using an independent public blockchain that no one controls.

Think of it as a notary stamp that is instant, free (just gas), and lives forever.

---

## What You Get

Every time you run this tool:

- A **JSON invoice file** saved to your computer with all the details
- A **blockchain record** — a unique fingerprint of your invoice, permanently logged on Pharos with a timestamp
- The ability to **prove the invoice was not altered** at any point in the future

---

## Before You Start

You need three things installed:

1. **Node.js** — Download from [nodejs.org](https://nodejs.org) (choose the LTS version)
2. **Foundry** — See the [INSTALL guide](INSTALL.md) for step-by-step instructions
3. **A wallet with testnet PHRS** — See the [INSTALL guide](INSTALL.md) for how to get this

If you have not done the one-time setup yet, read [INSTALL.md](INSTALL.md) first, then come back here.

---

## Your First Invoice

### Step 1 — Open your terminal

On Mac: press `Cmd + Space`, type "Terminal", press Enter.
On Windows: press `Win + R`, type "cmd", press Enter.

### Step 2 — Navigate to the project folder

```bash
cd path/to/pharos-proofpay
```

### Step 3 — Load your settings

```bash
# Mac / Linux
source .env && export PRIVATE_KEY CONTRACT RPC_URL

# Windows (PowerShell)
$env:PRIVATE_KEY = "your_private_key"
$env:CONTRACT    = "your_contract_address"
$env:RPC_URL     = "https://atlantic.dplabs-internal.com"
```

### Step 4 — Create an invoice

Tell it what to invoice in plain English:

```bash
echo "Invoice Acme Corp for website redesign, $2000, due in 14 days" | \
  node scripts/generate-invoice.js --parse
```

Or use flags directly:

```bash
node scripts/generate-invoice.js \
  --client "Acme Corp" \
  --work "Website redesign" \
  --amount 2000 \
  --days 14
```

You will see something like this:

```
╔══════════════════════════════════════════════════════════════╗
║              Pharos ProofPay — GENERATED                  ║
╚══════════════════════════════════════════════════════════════╝

  Invoice ID : INV-202606-547
  Client     : Acme Corp
  Issued     : 2026-06-07
  Due        : 2026-06-21

  Line Items :
    Website redesign                     $2000.00

  Total      : $2000.00 USD

  Data Hash  : 0xabc123...
  Saved to   : invoices/INV-202606-547.json

──────────────────────────────────────────────────────────────
  ONCHAIN LOGGING — Run this to log to Pharos:
──────────────────────────────────────────────────────────────

  cast send $CONTRACT \
    "logInvoice(string,bytes32,uint256,uint256,string,address)" \
    "INV-202606-547" \
    "0xabc123..." \
    200000 \
    1751500799 \
    "Acme Corp" \
    "0x0000000000000000000000000000000000000000" \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL
```

**Optional — include your client's wallet address for onchain acknowledgment:**

```bash
node scripts/generate-invoice.js \
  --client "Acme Corp" \
  --work "Website redesign" \
  --amount 2000 \
  --days 14 \
  --client-wallet 0xClientWalletAddress
```

This registers their wallet onchain so they can later acknowledge or dispute the invoice. See [Can Someone Create a Fake Invoice?](#can-someone-create-a-fake-invoice) for why this matters. If you skip `--client-wallet`, everything works exactly the same — you just get proof of issuance without client acknowledgment.

### Step 5 — Log it to the blockchain

Copy the `cast send ...` command from the output and paste it into your terminal, then press Enter.

**Or**, let the tool do it automatically by adding `--autolog`:

```bash
node scripts/generate-invoice.js \
  --client "Acme Corp" \
  --work "Website redesign" \
  --amount 2000 \
  --days 14 \
  --autolog
```

You will receive a transaction hash — that is your permanent proof.

### Step 6 — Share the invoice with your client

Find the file the tool saved (`invoices/INV-202606-547.json`) and send it to your client by email or any other way you prefer. The JSON file contains all the invoice details in a readable format.

---

## Creating an Invoice with Multiple Line Items

If your work has several components that you want to bill separately:

```bash
node scripts/generate-invoice.js \
  --client "DesignHub" \
  --item "Logo design:400" \
  --item "Brand identity guide:300" \
  --item "Business card design:150" \
  --days 30
```

The total ($850) is calculated automatically. Each line item appears separately in the invoice.

---

## Natural Language Examples

The tool understands plain English. Try any of these:

```bash
echo "Invoice TechCorp for React dashboard, $1200, due in 14 days" | \
  node scripts/generate-invoice.js --parse

echo "Bill DesignHub for brand identity work, $500, net 30" | \
  node scripts/generate-invoice.js --parse

echo "Charge ClientX for API integration and testing, $900, due in 7 days" | \
  node scripts/generate-invoice.js --parse
```

---

## Checking If an Invoice Was Tampered With

This is the most powerful feature. At any point in the future — even years later — you can prove your invoice was not changed:

```bash
node scripts/verify-invoice.js --id INV-202606-547
```

Output when everything checks out:

```
  ✅ VERIFIED AUTHENTIC — Invoice details are completely verified!
     The file has not been altered, and the signer matches the creator signature.
```

If the file was changed in any way after logging:

```
  ❌ HASH MISMATCH — The invoice file details do not match the onchain record!
     The file has been tampered with or modified since it was logged.
```

If someone tried to pass off someone else's invoice as their own:

```
  ❌ SPOOFING DETECTED — Security Alert!
     The invoice JSON claims it belongs to freelancer wallet: 0xFakeAddress
     However, this invoice hash was registered onchain by wallet: 0xRealAddress
```

If the invoice hasn't been logged onchain yet:

```
  ⚠  NOT LOGGED — This invoice ID is not registered in this contract onchain.
```

---

## Viewing All Your Invoices

```bash
node scripts/list-invoices.js
```

This shows a table of every invoice you have generated:

```
  Invoice ID          Client               Amount      Due         Status
  ──────────────────────────────────────────────────────────────────────────
  INV-202606-213      Acme Corp            $1200.00    2026-06-14  PAID
  INV-202606-381      DesignHub            $500.00     2026-06-30  UNPAID
  INV-202606-547      TechCorp             $2000.00    2026-06-21  OVERDUE ⚠
  ──────────────────────────────────────────────────────────────────────────
  3 invoice(s)   Total: $3700.00   Outstanding: $2500.00
```

Filter to only see overdue invoices:

```bash
node scripts/list-invoices.js --overdue
```

---

## Marking an Invoice as Paid

When a client pays you, record it onchain:

```bash
cast send $CONTRACT \
  "markPaid(string)" \
  "INV-202606-547" \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC_URL
```

The invoice status changes permanently to PAID.

---

## Cancelling an Invoice

If you need to cancel an invoice (for example, if the work was called off):

```bash
cast send $CONTRACT \
  "cancelInvoice(string)" \
  "INV-202606-547" \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC_URL
```

The invoice is marked CANCELLED permanently. The original record is never deleted — it remains readable as proof the invoice existed and was cancelled.

---

## What Your Client Sees

Your client **does not touch the blockchain at all.** Here is exactly what their experience looks like:

```
You generate the invoice
        ↓
You send them the JSON file  ←  just a file, like any attachment
        ↓
Client opens it and reads it  ←  no wallet, no signing, no blockchain
        ↓
Client pays you by bank transfer, PayPal, crypto — however you agreed
        ↓
You call markPaid() to record it  ←  only you sign this, not the client
```

The blockchain is completely invisible to the client. They never see a wallet prompt, never risk losing funds, and never need to install anything.

---

## Can Someone Create a Fake Invoice?

Yes — and this is an honest limitation worth understanding.

**The current system is proof of issuance, not proof of agreement.** Anyone can log an invoice claiming any client name because the client name is just a text string. The blockchain proves that a specific wallet logged an invoice at a specific time — but it does not prove the client agreed to it.

**What protects against abuse in practice:**
- The issuer's wallet address is permanently recorded — you cannot deny you logged it
- The invoice data is hashed — the amount and details cannot be changed after logging
- A fake invoice claiming to be for "Apple Inc" only proves your wallet logged that claim — Apple Inc never signed it and can deny it

**The real fix — client wallet acknowledgment:**

If you want genuine two-party proof, provide your client's wallet address when generating the invoice:

```bash
node scripts/generate-invoice.js \
  --client "Acme Corp" \
  --work "Website redesign" \
  --amount 2000 \
  --days 14 \
  --client-wallet 0xClientWalletAddress
```

This registers the client's wallet onchain. The client can then call one of two functions with their own wallet — no one else can do this on their behalf:

**If the client agrees — they acknowledge it:**
```bash
cast send $CONTRACT \
  "acknowledgeInvoice(string)" \
  "INV-202606-547" \
  --private-key CLIENT_PRIVATE_KEY \
  --rpc-url $RPC_URL
```

**If the client disputes it — they flag it:**
```bash
cast send $CONTRACT \
  "disputeInvoice(string)" \
  "INV-202606-547" \
  --private-key CLIENT_PRIVATE_KEY \
  --rpc-url $RPC_URL
```

Both actions are permanent onchain records. An acknowledged invoice is signed by both parties — stronger than any email or PDF contract. A disputed invoice is a permanent public record of the disagreement.

**If no client wallet is provided** (the default), the system works exactly as before — proof of issuance only, no client interaction required.

---

## Frequently Asked Questions

**Q: Does my client need to do anything with the blockchain?**

No — unless you both want onchain acknowledgment. By default, your client just receives a JSON file and does nothing. If you include their wallet address with `--client-wallet`, they have the *option* to acknowledge or dispute the invoice using their own wallet. They are never forced to.

---

**Q: Is my invoice data visible to the public?**

No. Only the fingerprint (hash) of your invoice is stored on the blockchain — not the contents. Nobody can read your client name, amount, or work description from the blockchain. They can only verify that a specific file matches what was logged.

---

**Q: What does the invoice file look like?**

Here is an example:

```json
{
  "invoiceId": "INV-202606-547",
  "issueDate": "2026-06-07",
  "dueDate": "2026-06-21",
  "dueTimestamp": 1751500799,
  "client": {
    "name": "Acme Corp",
    "wallet": "0xClientWalletAddress"
  },
  "freelancer": {
    "tool": "pharos-proofpay",
    "chain": "Pharos",
    "address": "0xYourWalletAddress"
  },
  "lineItems": [
    { "description": "Website redesign", "amount": 2000, "currency": "USD" }
  ],
  "total": 2000,
  "currency": "USD",
  "status": "UNPAID",
  "meta": {
    "generatedAt": "2026-06-07T10:00:00.000Z",
    "skill": "pharos-proofpay v2.0.0"
  }
}
```

---

**Q: What if I make a mistake on the invoice?**

Do not edit the saved JSON file — that will break the hash. Instead, cancel the incorrect invoice and create a new one. Cancelled invoices are not deleted; they remain as a permanent record.

---

**Q: What does "hash" mean?**

A hash is a unique fingerprint of a file. It is a string of letters and numbers that is mathematically generated from the contents of your invoice. If even one character in your invoice changes, the hash changes completely. This is how we can prove the invoice was not altered.

---

**Q: What is PHRS? Do I need to buy it?**

PHRS is the gas token for the Pharos network — it is what you pay for each transaction (like a small stamp fee). For the testnet (practice version), you can get free PHRS from the Pharos faucet. There is no real money involved on the testnet.

---

**Q: Where is my invoice data stored?**

Locally on your computer in the `invoices/` folder. This folder is not uploaded anywhere and is not committed to git. You are responsible for backing it up.

---

**Q: What happens if I lose my invoice JSON file?**

The onchain record (ID, hash, issuer, amount, timestamp, status) is permanent. But without the original JSON file, you cannot verify the contents or re-read the line items. Back up your `invoices/` folder.

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| `PRIVATE_KEY not set` | Environment variable not loaded | Run `source .env && export PRIVATE_KEY CONTRACT RPC_URL` |
| `CONTRACT not set` | Contract not deployed | Follow the INSTALL guide, deploy the contract, save the address |
| `insufficient funds` | No PHRS for gas | Get testnet PHRS from the Pharos faucet |
| Invoice generates but cast send fails | Wrong contract address | Double-check `$CONTRACT` matches the deployed address |
| `HASH MISMATCH` on verify | Invoice file was edited | Never edit a logged invoice — cancel it and create a new one |
| `NOT LOGGED` on verify | Invoice was never logged onchain | Run the `cast send` command from the generator output |
| `node: command not found` | Node.js not installed | Download from nodejs.org |
| `cast: command not found` | Foundry not installed | Run `foundryup` — see INSTALL.md |


