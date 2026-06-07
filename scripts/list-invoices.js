#!/usr/bin/env node

/**
 * pharos-proofpay — Invoice Lister
 *
 * Reads all saved invoice JSON files from the local invoices/ directory
 * and displays a formatted summary. If CONTRACT and RPC_URL are set in
 * the environment, it also fetches the live onchain status (UNPAID/PAID/CANCELLED)
 * for each invoice.
 *
 * Usage:
 *   node scripts/list-invoices.js
 *   node scripts/list-invoices.js --overdue     (show only overdue invoices)
 *   node scripts/list-invoices.js --status PAID (filter by status)
 */

const fs    = require("fs");
const path  = require("path");
const { ethers } = require("ethers");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      args[key] = argv[i+1] && !argv[i+1].startsWith("--") ? argv[++i] : true;
    }
  }
  return args;
}

function isOverdue(invoice) {
  if (!invoice.dueDate) return false;
  return new Date(invoice.dueDate) < new Date() && invoice.status === "UNPAID";
}

function statusBadge(status, overdue) {
  if (status === "PAID")      return "PAID      ";
  if (status === "CANCELLED") return "CANCELLED ";
  if (overdue)                return "OVERDUE   ";
  return "UNPAID    ";
}

async function fetchOnchainStatus(invoiceId, contractAddress, provider) {
  const abi = [
    "function getInvoice(string invoiceId) external view returns (tuple(string invoiceId, bytes32 dataHash, address issuer, address clientWallet, uint256 timestamp, uint256 dueTimestamp, uint256 amountUSD, string clientName, uint8 status, bool clientAcknowledged, bool clientDisputed, bool exists))"
  ];
  try {
    const contract = new ethers.Contract(contractAddress, abi, provider);
    const onchainInv = await contract.getInvoice(invoiceId);
    if (!onchainInv.exists) return null;
    const codes = ["UNPAID", "PAID", "CANCELLED"];
    return codes[Number(onchainInv.status)] || null;
  } catch (err) {
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args     = parseArgs(process.argv);
  const invoiceDir = path.join(process.cwd(), "invoices");

  if (!fs.existsSync(invoiceDir)) {
    console.log("\n  No invoices directory found. Generate your first invoice with:\n");
    console.log('  node scripts/generate-invoice.js --client "Client" --work "Work" --amount 500 --days 14\n');
    return;
  }

  const files = fs.readdirSync(invoiceDir)
    .filter(f => f.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    console.log("\n  No invoices found in invoices/\n");
    return;
  }

  // Load .env manually
  try {
    const envPath = path.join(__dirname, "../.env");
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, "utf8").split("\n");
      for (const line of lines) {
        const parts = line.split("=");
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const val = parts.slice(1).join("=").trim().replace(/^['"]|['"]$/g, "");
          process.env[key] = val;
        }
      }
    }
  } catch (e) {}

  const contract    = process.env.CONTRACT;
  const rpc         = process.env.RPC_URL || "https://atlantic.dplabs-internal.com";
  
  let provider;
  let canFetchOnchain = false;
  if (contract) {
    try {
      provider = new ethers.JsonRpcProvider(rpc, null, {
        staticNetwork: ethers.Network.from(688689)
      });
      canFetchOnchain = true;
    } catch (e) {
      canFetchOnchain = false;
    }
  }

  const invoices = files.map(file => {
    try {
      const raw     = fs.readFileSync(path.join(invoiceDir, file), "utf8");
      const invoice = JSON.parse(raw);
      return invoice;
    } catch {
      return null;
    }
  }).filter(Boolean);

  // Apply filters
  let filtered = invoices;
  if (args.overdue) {
    filtered = invoices.filter(isOverdue);
  } else if (args.status) {
    filtered = invoices.filter(i => (i.status || "UNPAID").toUpperCase() === args.status.toUpperCase());
  }

  if (filtered.length === 0) {
    console.log(`\n  No invoices match the filter.\n`);
    return;
  }

  // Totals
  const totalAmount = filtered.reduce((sum, i) => sum + (i.total || 0), 0);
  const unpaidAmount = filtered
    .filter(i => i.status !== "PAID" && i.status !== "CANCELLED")
    .reduce((sum, i) => sum + (i.total || 0), 0);

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║              PHAROS PROOFPAY — ALL INVOICES               ║
╚══════════════════════════════════════════════════════════════╝
`);

  if (canFetchOnchain) {
    console.log("  Fetching live onchain status...\n");
  }

  const COL = {
    id:     18,
    client: 20,
    amount: 12,
    due:    12,
    status: 12,
  };

  const header =
    "  " +
    "Invoice ID".padEnd(COL.id) +
    "Client".padEnd(COL.client) +
    "Amount".padEnd(COL.amount) +
    "Due".padEnd(COL.due) +
    "Status";

  console.log(header);
  console.log("  " + "─".repeat(74));

  for (const invoice of filtered) {
    let displayStatus = invoice.status || "UNPAID";

    if (canFetchOnchain) {
      const onchain = await fetchOnchainStatus(invoice.invoiceId, contract, provider);
      if (onchain) displayStatus = onchain;
    }

    const overdue = isOverdue({ ...invoice, status: displayStatus });
    const badge   = statusBadge(displayStatus, overdue).trim();
    const amount  = invoice.total != null ? `$${invoice.total.toFixed(2)}` : "?";

    const row =
      "  " +
      (invoice.invoiceId || "?").padEnd(COL.id) +
      (invoice.client?.name || "?").substring(0, COL.client - 1).padEnd(COL.client) +
      amount.padEnd(COL.amount) +
      (invoice.dueDate || "?").padEnd(COL.due) +
      badge + (overdue ? " ⚠" : "");

    console.log(row);
  }

  console.log("  " + "─".repeat(74));
  console.log(`  ${filtered.length} invoice(s)   Total: $${totalAmount.toFixed(2)}   Outstanding: $${unpaidAmount.toFixed(2)}`);

  if (!canFetchOnchain) {
    console.log("\n  Set CONTRACT in your .env to see live onchain status.");
  }

  console.log(`
──────────────────────────────────────────────────────────────
  Commands:
──────────────────────────────────────────────────────────────

  Verify an invoice:
    node scripts/verify-invoice.js --id <INVOICE_ID>

  Mark an invoice paid:
    cast send $CONTRACT "markPaid(string)" "<INVOICE_ID>" \\
      --private-key $PRIVATE_KEY --rpc-url $RPC_URL

  Cancel an invoice:
    cast send $CONTRACT "cancelInvoice(string)" "<INVOICE_ID>" \\
      --private-key $PRIVATE_KEY --rpc-url $RPC_URL

  Show only overdue:
    node scripts/list-invoices.js --overdue

  Filter by status:
    node scripts/list-invoices.js --status PAID
`);
}

main().catch(console.error);

