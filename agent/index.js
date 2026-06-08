#!/usr/bin/env node
/**
 * ProofPay Agent — Main Entry Point
 *
 * Autonomous invoice lifecycle agent for Pharos.
 * Composes the pharos-proofpay Skill into a live agent that:
 *   - Monitors onchain events in real time
 *   - Runs periodic overdue checks and status syncs
 *   - Accepts natural language commands at the CLI
 *
 * Usage:
 *   node agent/index.js                  # full agent (monitor + scheduler + CLI)
 *   node agent/index.js --monitor-only   # events only
 *   node agent/index.js --scheduler-only # periodic checks only
 *   node agent/index.js --check-overdue  # one-shot overdue check, then exit
 *   node agent/index.js --sync-status    # one-shot status sync, then exit
 */

const { ethers }   = require("ethers");
const readline     = require("readline");
const fs           = require("fs");
const path         = require("path");

const Monitor   = require("./monitor");
const Scheduler = require("./scheduler");
const Actions   = require("./actions");

// ─── Load .env ────────────────────────────────────────────────────────────────

try {
  const envPath = path.join(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const parts = line.split("=");
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join("=").trim().replace(/^['"]|['"]$/g, "");
        if (key && !process.env[key]) process.env[key] = val;
      }
    }
  }
} catch { }

const RPC_URL      = process.env.RPC_URL      || "https://atlantic.dplabs-internal.com";
const PRIVATE_KEY  = process.env.PRIVATE_KEY;
const CONTRACT     = process.env.CONTRACT;
const INTERVAL_MS  = parseInt(process.env.POLL_INTERVAL_MS || "3600000");

// ─── Arg flags ────────────────────────────────────────────────────────────────

const args          = process.argv.slice(2);
const monitorOnly   = args.includes("--monitor-only");
const schedulerOnly = args.includes("--scheduler-only");
const checkOverdue  = args.includes("--check-overdue");
const syncStatus    = args.includes("--sync-status");
const oneShot       = checkOverdue || syncStatus;

// ─── Banner ───────────────────────────────────────────────────────────────────

function banner() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           PHAROS PROOFPAY — AUTONOMOUS AGENT v2.0            ║
║        Phase 2 · Pharos Agent Arena · Skill-to-Agent         ║
╚══════════════════════════════════════════════════════════════╝

  Network  : Pharos Atlantic Testnet
  Contract : ${CONTRACT || "(not set — deploy first)"}
  RPC      : ${RPC_URL}

  Type a command or "help" to see options. Ctrl+C to stop.
`);
}

// ─── Natural language intent parser ──────────────────────────────────────────

function parseIntent(input) {
  const t = input.toLowerCase().trim();

  if (/^(stop|exit|quit|bye)/.test(t))           return { action: "stop" };
  if (/^help/.test(t))                            return { action: "help" };
  if (/^status$/.test(t))                         return { action: "agentStatus" };
  if (/total|how many/.test(t))                   return { action: "total" };

  // Overdue / list
  if (/overdue/.test(t))                          return { action: "listOverdue" };
  if (/list|show|all invoices|unpaid/.test(t))    return { action: "listAll" };

  // Status check — "has acme corp paid" / "is INV-xxx paid"
  const invIdMatch = t.match(/inv-\d{6}-\d{3,}/i);
  if (invIdMatch) {
    const invoiceId = invIdMatch[0].toUpperCase();
    if (/paid|status|check/.test(t))              return { action: "status",  invoiceId };
    if (/mark.*paid|record.*payment/.test(t))     return { action: "markPaid", invoiceId };
    if (/cancel/.test(t))                         return { action: "cancel",  invoiceId };
    if (/verify|tamper|authentic/.test(t))        return { action: "verify",  invoiceId };
    return { action: "status", invoiceId };
  }

  // Client name status — "has acme corp paid"
  const clientPaidMatch = t.match(/has\s+(.+?)\s+(paid|paid yet)/i);
  if (clientPaidMatch)                            return { action: "findClient", clientName: clientPaidMatch[1].trim() };

  // Mark paid by client name
  const markPaidMatch = t.match(/mark\s+(.+?)\s+as\s+paid/i);
  if (markPaidMatch) {
    const id = markPaidMatch[1].trim().toUpperCase();
    if (id.startsWith("INV-"))                    return { action: "markPaid", invoiceId: id };
  }

  // Cancel by client name or id
  const cancelMatch = t.match(/cancel\s+(the\s+)?(.+?)\s+invoice/i);
  if (cancelMatch) {
    const id = cancelMatch[2].trim().toUpperCase();
    if (id.startsWith("INV-"))                    return { action: "cancel", invoiceId: id };
  }

  // Verify
  if (/verify|tamper/.test(t)) {
    const m = t.match(/verify\s+(inv-[\w-]+)/i);
    if (m) return { action: "verify", invoiceId: m[1].toUpperCase() };
  }

  // Generate invoice
  const invoiceMatch = t.match(/(?:invoice|bill|charge)\s+(.+?)\s+for\s+(.+?)[,\s]+\$?([\d,]+).*?(?:net|due in)\s*(\d+)/i);
  if (invoiceMatch) {
    return {
      action:  "generate",
      client:  invoiceMatch[1].trim(),
      work:    invoiceMatch[2].trim(),
      amount:  parseFloat(invoiceMatch[3].replace(",", "")),
      days:    parseInt(invoiceMatch[4]),
      autolog: true,
    };
  }

  return { action: "unknown", input };
}

// ─── Help text ────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
  COMMANDS:
  ──────────────────────────────────────────────────────────────
  status                              Agent status
  list / show all invoices            All your invoices + live onchain status
  overdue                             Only overdue unpaid invoices
  how many invoices                   Total invoices logged globally

  has [client name] paid?             Find invoice by client name, show status
  is INV-202606-347 paid?             Check specific invoice status
  verify INV-202606-347               Verify integrity + spoofing detection
  mark INV-202606-347 as paid         Record payment onchain
  cancel INV-202606-347               Cancel invoice onchain

  invoice [client] for [work], $[amount], net [days]
                                      Generate + log a new invoice

  help                                Show this menu
  stop / exit                         Shut down the agent
  ──────────────────────────────────────────────────────────────
`);
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

async function dispatch(intent, actions, issuerAddress) {
  switch (intent.action) {

    case "help":
      printHelp();
      break;

    case "stop":
      console.log("\n  Shutting down ProofPay Agent. Goodbye.\n");
      process.exit(0);

    case "agentStatus":
      console.log(`\n  Agent running. Contract: ${CONTRACT}\n  Issuer: ${issuerAddress}\n`);
      break;

    case "total": {
      const total = await actions.getTotalInvoices();
      console.log(`\n  Total invoices logged on Pharos: ${total}\n`);
      break;
    }

    case "listAll": {
      const list = await actions.listAllInvoices(issuerAddress);
      if (list.length === 0) { console.log("\n  No invoices found.\n"); break; }
      console.log(`\n  ${"Invoice ID".padEnd(20)} ${"Client".padEnd(22)} ${"Amount".padEnd(12)} ${"Status"}`);
      console.log("  " + "─".repeat(70));
      for (const inv of list) {
        console.log(`  ${inv.invoiceId.padEnd(20)} ${(inv.clientName||"").padEnd(22)} ${(inv.amountUSD||"").padEnd(12)} ${inv.status}`);
      }
      console.log();
      break;
    }

    case "listOverdue": {
      const list = await actions.listOverdue(issuerAddress);
      if (list.length === 0) { console.log("\n  No overdue invoices.\n"); break; }
      console.log(`\n  ⚠  ${list.length} OVERDUE INVOICE(S):\n`);
      for (const inv of list) {
        console.log(`  • ${inv.invoiceId} — ${inv.clientName} — ${inv.amountUSD} — due ${inv.dueDate}`);
      }
      console.log();
      break;
    }

    case "status": {
      const inv = await actions.getInvoiceStatus(intent.invoiceId);
      if (!inv.exists) { console.log(`\n  Invoice ${intent.invoiceId} not found onchain.\n`); break; }
      const ack = inv.clientAcknowledged ? " (client acknowledged ✅)" : inv.clientDisputed ? " (client disputed ⚠)" : "";
      console.log(`
  Invoice  : ${inv.invoiceId}
  Client   : ${inv.clientName}
  Amount   : ${inv.amountUSD}
  Due      : ${inv.dueDate}
  Status   : ${inv.status}${ack}
`);
      break;
    }

    case "findClient": {
      const list = await actions.findByClient(intent.clientName);
      if (list.length === 0) { console.log(`\n  No invoices found for "${intent.clientName}".\n`); break; }
      for (const inv of list) {
        const paid = inv.status === "PAID" ? "Yes ✅" : "No ❌";
        console.log(`\n  ${inv.invoiceId} — ${inv.clientName} — ${inv.amountUSD} — Paid: ${paid} — Status: ${inv.status}`);
      }
      console.log();
      break;
    }

    case "markPaid": {
      console.log(`\n  Marking ${intent.invoiceId} as paid onchain...`);
      try {
        const result = await actions.markPaid(intent.invoiceId);
        console.log(`
  ✅ MARKED PAID
  Invoice : ${result.invoiceId}
  Tx Hash : ${result.txHash}
  Explorer: ${result.explorerUrl}
`);
      } catch (err) {
        console.error(`  ❌ Failed: ${err.message}\n`);
      }
      break;
    }

    case "cancel": {
      console.log(`\n  Cancelling ${intent.invoiceId} onchain...`);
      try {
        const result = await actions.cancelInvoice(intent.invoiceId);
        console.log(`
  ✅ CANCELLED
  Invoice : ${result.invoiceId}
  Tx Hash : ${result.txHash}
  Explorer: ${result.explorerUrl}
`);
      } catch (err) {
        console.error(`  ❌ Failed: ${err.message}\n`);
      }
      break;
    }

    case "verify": {
      console.log(`\n  Verifying ${intent.invoiceId}...`);
      const result = await actions.verifyInvoice(intent.invoiceId);
      if (result.verified)   console.log("  ✅ VERIFIED AUTHENTIC — Invoice is untampered and signer matches.\n");
      else if (result.tampered)  console.log("  ❌ HASH MISMATCH — Invoice file was modified after logging.\n");
      else if (result.spoofed)   console.log("  ❌ SPOOFING DETECTED — Claimed issuer does not match onchain signer.\n");
      else if (result.notLogged) console.log("  ⚠  NOT LOGGED — This invoice has not been registered onchain.\n");
      else console.log(result.raw);
      break;
    }

    case "generate": {
      console.log(`\n  Generating invoice for ${intent.client}...`);
      const output = actions.generateInvoice({
        client: intent.client,
        work:   intent.work,
        amount: intent.amount,
        days:   intent.days,
        autolog: intent.autolog,
      });
      console.log(output);
      break;
    }

    case "unknown":
    default:
      console.log(`\n  I didn't understand that. Type "help" for a list of commands.\n`);
      break;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!CONTRACT) {
    console.error("\n  ❌ CONTRACT not set in .env — deploy InvoiceLogger first.\n");
    process.exit(1);
  }
  if (!PRIVATE_KEY) {
    console.error("\n  ❌ PRIVATE_KEY not set in .env\n");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL, null, {
    staticNetwork: ethers.Network.from(688689),
  });
  const wallet  = new ethers.Wallet(PRIVATE_KEY, provider);
  const actions = new Actions({ provider, contractAddress: CONTRACT, wallet });

  const issuerAddress = wallet.address;

  // ─── One-shot modes ──────────────────────────────────────────────────────────

  if (checkOverdue) {
    const scheduler = new Scheduler({ provider, contractAddress: CONTRACT, issuerAddress, onEvent: () => {}, intervalMs: INTERVAL_MS });
    await scheduler.checkOverdue();
    process.exit(0);
  }

  if (syncStatus) {
    const scheduler = new Scheduler({ provider, contractAddress: CONTRACT, issuerAddress, onEvent: () => {}, intervalMs: INTERVAL_MS });
    await scheduler.syncAllStatuses();
    process.exit(0);
  }

  // ─── Full agent mode ─────────────────────────────────────────────────────────

  banner();

  function onEvent(type, data) {
    const line = "  " + "─".repeat(60);
    if (type === "InvoiceLogged") {
      console.log(`\n${line}\n  📄 NEW INVOICE LOGGED\n  ID: ${data.invoiceId}  Client: ${data.clientName}  Amount: ${data.amountUSD}\n  Tx: ${data.explorerUrl}\n${line}\n`);
    } else if (type === "InvoicePaid") {
      console.log(`\n${line}\n  ✅ INVOICE PAID\n  ID: ${data.invoiceId}\n  Tx: ${data.explorerUrl}\n${line}\n`);
    } else if (type === "InvoiceCancelled") {
      console.log(`\n${line}\n  🚫 INVOICE CANCELLED\n  ID: ${data.invoiceId}\n  Tx: ${data.explorerUrl}\n${line}\n`);
    } else if (type === "InvoiceAcknowledged") {
      console.log(`\n${line}\n  🤝 CLIENT ACKNOWLEDGED\n  ID: ${data.invoiceId}  Wallet: ${data.clientWallet}\n  Tx: ${data.explorerUrl}\n${line}\n`);
    } else if (type === "InvoiceDisputed") {
      console.log(`\n${line}\n  ⚠  CLIENT DISPUTED\n  ID: ${data.invoiceId}  Wallet: ${data.clientWallet}\n  Tx: ${data.explorerUrl}\n${line}\n`);
    } else if (type === "OverdueFound") {
      console.log(`\n${line}\n  ⚠  ${data.count} OVERDUE INVOICE(S) DETECTED\n${line}\n`);
    } else if (type === "StatusChanged") {
      console.log(`\n  [sync] ${data.invoiceId}: ${data.from} → ${data.to}`);
    }
  }

  // Start monitor
  if (!schedulerOnly) {
    const monitor = new Monitor({ provider, contractAddress: CONTRACT, onEvent });
    monitor.start();
  }

  // Start scheduler
  if (!monitorOnly) {
    const scheduler = new Scheduler({ provider, contractAddress: CONTRACT, issuerAddress, onEvent, intervalMs: INTERVAL_MS });
    scheduler.start();
  }

  // Start CLI
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "\n  > " });
  rl.prompt();
  rl.on("line", async (line) => {
    const input  = line.trim();
    if (!input) { rl.prompt(); return; }
    const intent = parseIntent(input);
    await dispatch(intent, actions, issuerAddress);
    rl.prompt();
  });
  rl.on("close", () => {
    console.log("\n  ProofPay Agent stopped.\n");
    process.exit(0);
  });
}

main().catch(err => {
  console.error("\n  ❌ Agent crashed:", err.message);
  process.exit(1);
});
