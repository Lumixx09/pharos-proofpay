#!/usr/bin/env node

/**
 * pharos-proofpay — Invoice Generator
 *
 * Usage (argument mode):
 *   node scripts/generate-invoice.js \
 *     --client "Acme Corp" \
 *     --work "Built landing page" \
 *     --amount 800 \
 *     --days 7
 *
 * Usage (multi-item):
 *   node scripts/generate-invoice.js \
 *     --client "Acme Corp" \
 *     --item "UI Design:500" \
 *     --item "Backend Dev:800" \
 *     --days 14
 *
 * Usage (natural language):
 *   echo "Invoice Acme Corp for landing page work, $800, due in 7 days" | \
 *     node scripts/generate-invoice.js --parse
 *
 * Flags:
 *   --autolog   Automatically run cast send after generating (requires CONTRACT + PRIVATE_KEY in env)
 *   --id        Custom invoice ID (auto-generated if omitted)
 */

const crypto  = require("crypto");
const fs      = require("fs");
const path    = require("path");
const { spawnSync } = require("child_process");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, "0"); }

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function dueDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + parseInt(days, 10));
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function dueDateTimestamp(days) {
  const d = new Date();
  d.setDate(d.getDate() + parseInt(days, 10));
  d.setHours(23, 59, 59, 0);
  return Math.floor(d.getTime() / 1000);
}

function autoId() {
  const d = new Date();
  const rand = Math.floor(Math.random() * 900) + 100;
  return `INV-${d.getFullYear()}${pad(d.getMonth()+1)}-${rand}`;
}

function keccak256(data) {
  try {
    const { keccak256: k } = require("ethereum-cryptography/keccak");
    const { utf8ToBytes }   = require("ethereum-cryptography/utils");
    return "0x" + Buffer.from(k(utf8ToBytes(data))).toString("hex");
  } catch {
    const h = crypto.createHash("sha256").update(data).digest("hex");
    console.warn("WARNING: ethereum-cryptography not installed. Using SHA-256 fallback hash.");
    return "0x" + h;
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const val = argv[i+1] && !argv[i+1].startsWith("--") ? argv[++i] : true;
      if (key === "item") {
        if (!args.item) args.item = [];
        args.item.push(val);
      } else {
        args[key] = val;
      }
    }
  }
  return args;
}

// ─── Multi-item parser ────────────────────────────────────────────────────────

function parseItems(itemArgs) {
  const items = Array.isArray(itemArgs) ? itemArgs : [itemArgs];
  return items.map(item => {
    const lastColon = item.lastIndexOf(":");
    if (lastColon === -1) throw new Error(`Invalid --item format: "${item}". Expected "Description:amount"`);
    const desc   = item.slice(0, lastColon).trim();
    const amount = parseFloat(item.slice(lastColon + 1).trim());
    if (!desc || isNaN(amount)) throw new Error(`Invalid --item value: "${item}"`);
    return { description: desc, amount, currency: "USD" };
  });
}

// ─── Natural language parser ──────────────────────────────────────────────────

function parseNaturalLanguage(input) {
  const result = {};

  const amountMatch = input.match(/\$?([\d,]+(?:\.\d+)?)\s*(USD|USDC|PHRS|ETH)?/i);
  if (amountMatch) result.amount = parseFloat(amountMatch[1].replace(",", ""));

  const dueMatch = input.match(/(?:due in|net\s?|in\s?)(\d+)\s*days?/i);
  if (dueMatch) result.days = parseInt(dueMatch[1]);

  const clientMatch = input.match(/(?:invoice|bill|charge)\s+([A-Z][A-Za-z\s]+?)\s+(?:for|,)/i);
  if (clientMatch) result.client = clientMatch[1].trim();

  const workMatch = input.match(/for\s+(.+?)(?:,|\$|\d+\s*USD|due|$)/i);
  if (workMatch) result.work = workMatch[1].trim();

  return result;
}

// ─── Auto-log via cast ────────────────────────────────────────────────────────

function autolog(id, invoiceHash, amountCents, dueTs, client, clientWallet) {
  const pk       = process.env.PRIVATE_KEY;
  const contract = process.env.CONTRACT;
  const rpc      = process.env.RPC_URL || "https://atlantic.dplabs-internal.com";

  if (!pk || !contract) {
    console.log(`
  ⚠  --autolog skipped: PRIVATE_KEY and CONTRACT must be set in your environment.
  Add them to your .env file, then re-run.
`);
    return;
  }

  console.log("  Sending to Pharos...\n");

  const result = spawnSync("cast", [
    "send", contract,
    "logInvoice(string,bytes32,uint256,uint256,string,address)",
    id, invoiceHash, String(amountCents), String(dueTs), client, clientWallet,
    "--private-key", pk,
    "--rpc-url", rpc,
  ], { encoding: "utf8" });

  if (result.error) {
    console.log("  ⚠  cast not found. Install Foundry and re-run, or log manually with the command above.");
    return;
  }

  if (result.status !== 0) {
    console.error("  ❌ cast send failed:");
    console.error(result.stderr || result.stdout);
    return;
  }

  const txMatch = (result.stdout || "").match(/transactionHash\s+(0x[a-fA-F0-9]+)/i);
  const txHash  = txMatch ? txMatch[1] : "(see output above)";

  console.log(`
──────────────────────────────────────────────────────────────
  ✅ INVOICE LOGGED ONCHAIN
──────────────────────────────────────────────────────────────

  Invoice ID : ${id}
  Tx Hash    : ${txHash}
  Explorer   : https://atlantic.pharosscan.xyz/tx/${txHash}
`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
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

  const args = parseArgs(process.argv);

  let client, lineItems, amount, days, id;

  if (args.parse) {
    const chunks = [];
    process.stdin.on("data", c => chunks.push(c));
    await new Promise(r => process.stdin.on("end", r));
    const input  = Buffer.concat(chunks).toString().trim();
    const parsed = parseNaturalLanguage(input);
    client = parsed.client || args.client;
    amount = parsed.amount || parseFloat(args.amount);
    days   = parsed.days   || parseInt(args.days || "14");
    id     = args.id       || autoId();
    lineItems = [{ description: parsed.work || args.work || "Services rendered", amount, currency: "USD" }];
  } else if (args.item) {
    lineItems = parseItems(args.item);
    amount    = lineItems.reduce((sum, i) => sum + i.amount, 0);
    client    = args.client;
    days      = parseInt(args.days || "14");
    id        = args.id || autoId();
  } else {
    client    = args.client;
    amount    = parseFloat(args.amount);
    days      = parseInt(args.days || "14");
    id        = args.id || autoId();
    lineItems = [{ description: args.work || "Services rendered", amount, currency: "USD" }];
  }

  if (!client || !amount || isNaN(amount)) {
    console.error(`
Usage:
  node scripts/generate-invoice.js --client "Acme Corp" --work "Landing page" --amount 800 --days 7

  With client wallet (enables onchain acknowledgment/dispute):
  node scripts/generate-invoice.js --client "Acme Corp" --work "Landing page" --amount 800 --days 7 \\
    --client-wallet 0xClientWalletAddress

  Multi-item:
  node scripts/generate-invoice.js --client "Acme Corp" --item "Design:500" --item "Dev:800" --days 14

  Natural language:
  echo "Invoice Acme Corp for landing page work, $800, due in 7 days" | \\
    node scripts/generate-invoice.js --parse
    `);
    process.exit(1);
  }

  const dueTs        = dueDateTimestamp(days);
  const clientWallet = args["client-wallet"] || "0x0000000000000000000000000000000000000000";

  let freelancerAddress = "";
  const pk = process.env.PRIVATE_KEY;
  if (pk) {
    try {
      const { ethers } = require("ethers");
      const wallet = new ethers.Wallet(pk);
      freelancerAddress = wallet.address;
    } catch (e) {}
  }

  const invoice = {
    invoiceId:  id,
    issueDate:  today(),
    dueDate:    dueDate(days),
    dueTimestamp: dueTs,
    client: {
      name:   client,
      wallet: clientWallet !== "0x0000000000000000000000000000000000000000" ? clientWallet : undefined,
    },
    freelancer: {
      tool:  "pharos-proofpay",
      chain: "Pharos",
      address: freelancerAddress || args.wallet || "",
    },
    lineItems,
    total:    amount,
    currency: "USD",
    status:   "UNPAID",
    meta: {
      generatedAt: new Date().toISOString(),
      skill:       "pharos-proofpay v2.0.0",
    }
  };

  const invoiceJSON = JSON.stringify(invoice, null, 2);
  const invoiceHash = keccak256(invoiceJSON);
  const amountCents = Math.round(amount * 100);

  const outDir  = path.join(process.cwd(), "invoices");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${id}.json`), invoiceJSON);

  const itemLines = lineItems.map(i =>
    `    ${i.description.padEnd(32)} $${i.amount.toFixed(2)}`
  ).join("\n");

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║              PHAROS PROOFPAY — GENERATED                  ║
╚══════════════════════════════════════════════════════════════╝

  Invoice ID : ${id}
  Client     : ${client}
  Issued     : ${today()}
  Due        : ${dueDate(days)}

  Line Items :
${itemLines}
  ─────────────────────────────────────────
  Total      : $${amount.toFixed(2)} USD

  Data Hash  : ${invoiceHash}
  Saved to   : invoices/${id}.json

──────────────────────────────────────────────────────────────
  ONCHAIN LOGGING — Run this to log to Pharos:
──────────────────────────────────────────────────────────────

  cast send $CONTRACT \\
    "logInvoice(string,bytes32,uint256,uint256,string,address)" \\
    "${id}" \\
    "${invoiceHash}" \\
    ${amountCents} \\
    ${dueTs} \\
    "${client}" \\
    "${clientWallet}" \\
    --private-key $PRIVATE_KEY \\
    --rpc-url $RPC_URL

──────────────────────────────────────────────────────────────
  VERIFY LATER — Prove this invoice was not tampered with:
──────────────────────────────────────────────────────────────

  node scripts/verify-invoice.js --id ${id}

  Or manually:
  cast call $CONTRACT \\
    "verifyInvoice(string,bytes32)" \\
    "${id}" "${invoiceHash}" \\
    --rpc-url $RPC_URL
`);

  if (args.autolog) {
    autolog(id, invoiceHash, amountCents, dueTs, client, clientWallet);
  }
}

main().catch(console.error);

