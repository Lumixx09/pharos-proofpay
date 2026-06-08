---
name: pharos-proofpay-agent
description: >
  A fully autonomous onchain invoice agent built on Pharos. Composes the
  pharos-proofpay Skill into a live agent that monitors wallets, listens for
  blockchain events, auto-marks invoices paid when payment arrives, alerts on
  overdue invoices, verifies invoice integrity on demand, and manages the full
  invoice lifecycle without manual intervention.

  Trigger phrases: "start the invoice agent", "watch my invoices", "monitor
  payments", "check overdue", "auto-mark paid", "what invoices are unpaid",
  "has Acme Corp paid yet", "run proofpay agent".

version: 2.0.0
author: iEngineer Solutions (@M_Lumixx)
license: MIT
phase: Agent Arena (Phase 2 — Pharos Skill-to-Agent Dual Cascade Hackathon)
composes:
  - pharos-proofpay (Phase 1 Skill)
requires:
  - node
  - ethers (npm)
  - ethereum-cryptography (npm)
---

# ProofPay Agent

> The autonomous invoice lifecycle agent for Pharos. Issues, monitors, verifies,
> and settles invoices onchain — without any manual steps.

---

## What Makes This an Agent (Not Just a Skill)

The Phase 1 Skill responds to commands. This Agent **acts on its own**:

| Skill (Phase 1)          | Agent (Phase 2)                                      |
|--------------------------|------------------------------------------------------|
| You run a command        | Agent runs continuously, watching the chain          |
| You mark invoices paid   | Agent detects incoming payments and marks them automatically |
| You check overdue        | Agent alerts you on a schedule without being asked   |
| You verify on demand     | Agent re-verifies all invoices periodically          |
| Single action per prompt | Composes multiple skills into a decision loop        |

---

## Agent Capabilities

### 1. Payment Monitor (Event-Driven)
Listens for `InvoicePaid`, `InvoiceLogged`, `InvoiceCancelled`, `InvoiceAcknowledged`,
and `InvoiceDisputed` events from the `InvoiceLogger` contract in real time.
When a payment event fires, the agent:
- Updates the local `.receipt.json` file with the tx hash and timestamp
- Logs the status change to the agent activity log
- Prints a notification to the console

### 2. Overdue Invoice Scanner (Scheduled)
Every hour (configurable), the agent calls `getOverdueInvoices(issuerAddress)`
and reports any invoices past their due date that are still UNPAID.

### 3. Full Status Sync
On startup and on schedule, syncs the onchain status of all local invoices and
updates their `.receipt.json` files — so your local records always reflect chain truth.

### 4. Natural Language Interface
Accepts plain English commands at runtime:

```
> has acme corp paid?
> show me all overdue invoices
> create invoice for TechCorp, $800, due in 14 days
> mark INV-202606-347 as paid
> verify INV-202606-213
> stop watching
```

### 5. Composable Action Pipeline
Each agent action calls the underlying Pharos ProofPay Skill functions —
the agent is the orchestration layer on top of the skill.

---

## How to Start the Agent

```bash
# Start in full autonomous mode (monitors + scheduler + CLI)
node agent/index.js

# Start monitor only (listen for events, no scheduler)
node agent/index.js --monitor-only

# Start scheduler only (periodic checks, no event listener)
node agent/index.js --scheduler-only

# Run a one-shot overdue check and exit
node agent/index.js --check-overdue

# Run a one-shot status sync and exit
node agent/index.js --sync-status
```

---

## Agent Decision Loop

```
START
  │
  ├─► Connect to Pharos Atlantic Testnet
  ├─► Load all local invoices from invoices/*.json
  ├─► Sync onchain status for all invoices
  │
  ├─► [Event Listener] Subscribe to InvoiceLogger contract events
  │     InvoiceLogged    → log new invoice, update receipt
  │     InvoicePaid      → update receipt to PAID, notify
  │     InvoiceCancelled → update receipt to CANCELLED, notify
  │     InvoiceAcknowledged → update receipt, notify
  │     InvoiceDisputed  → update receipt, alert
  │
  ├─► [Scheduler — every 60 min] Check overdue invoices
  │     getOverdueInvoices(issuer) → alert if any found
  │
  ├─► [CLI] Accept natural language input
  │     parse intent → dispatch to Skill action
  │
  └─► Loop until stopped (Ctrl+C)
```

---

## Natural Language Prompting Guide

Once the agent is running, type commands directly:

### Check invoice status
```
has acme corp paid?
is INV-202606-347 paid yet?
what invoices are still unpaid?
show overdue invoices
list all paid invoices
```

### Create invoices
```
invoice TechCorp for $1200, react dashboard, net 14
bill DesignHub for logo work, $500, due in 30 days
create invoice for ClientX, API work, $2000, 7 days
```

### Manage lifecycle
```
mark INV-202606-347 as paid
cancel the DesignHub invoice
cancel INV-202606-213
```

### Verify
```
verify INV-202606-347
check if acme corp invoice was tampered with
verify all invoices
```

### Agent control
```
stop
status
how many invoices are logged?
show activity log
```

---

## Environment Variables

Same as the ProofPay Skill:

```bash
PRIVATE_KEY=your_wallet_private_key
CONTRACT=0xDeployedInvoiceLoggerAddress
RPC_URL=https://atlantic.dplabs-internal.com

# Optional agent config
POLL_INTERVAL_MS=3600000    # overdue check interval (default: 1 hour)
AGENT_LOG_FILE=agent.log    # path to activity log file
```

---

## Security Model

- Private key stays in `.env` — never logged, printed, or sent anywhere
- Agent only calls `markPaid` and `cancelInvoice` when explicitly instructed
- Event monitoring is read-only — no gas spent listening
- All write operations prompt for confirmation before signing
- No external API calls — only Pharos RPC and local file system

---

## Composability

This agent is designed to be called by other agents on Pharos:

```
Other Agent  →  "verify invoice INV-202606-347"
                         ↓
              ProofPay Agent receives request
                         ↓
              Calls verifyInvoice() on Pharos
                         ↓
              Returns: VERIFIED / TAMPERED / NOT_FOUND
```

Any agent that needs invoice proof, payment confirmation, or billing records
can delegate to the ProofPay Agent.
