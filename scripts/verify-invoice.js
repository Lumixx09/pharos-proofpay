#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ethers } = require("ethers");

function keccak256(data) {
  try {
    const { keccak256: k } = require("ethereum-cryptography/keccak");
    const { utf8ToBytes }   = require("ethereum-cryptography/utils");
    return "0x" + Buffer.from(k(utf8ToBytes(data))).toString("hex");
  } catch {
    const h = crypto.createHash("sha256").update(data).digest("hex");
    return "0x" + h;
  }
}

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

const statusMap = ["UNPAID", "PAID", "CANCELLED"];

async function main() {
  const args = parseArgs(process.argv);

  let filePath;
  if (args.file) {
    filePath = path.resolve(process.cwd(), args.file);
  } else if (args.id) {
    filePath = path.join(process.cwd(), "invoices", `${args.id}.json`);
  } else {
    console.error(`
Usage:
  node scripts/verify-invoice.js --id INV-202606-347
  node scripts/verify-invoice.js --file invoices/INV-202606-347.json
`);
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`\n  ❌ Invoice file not found: ${filePath}\n`);
    process.exit(1);
  }

  const invoiceJSON = fs.readFileSync(filePath, "utf8");

  let invoice;
  try {
    invoice = JSON.parse(invoiceJSON);
  } catch {
    console.error(`\n  ❌ Could not parse invoice JSON: ${filePath}\n`);
    process.exit(1);
  }

  const invoiceId      = invoice.invoiceId || args.id;
  const recomputedHash = keccak256(invoiceJSON);
  const total          = typeof invoice.total === "number" ? `$${invoice.total.toFixed(2)} USD` : "Unknown";

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║              PHAROS PROOFPAY — VERIFIER                   ║
╚══════════════════════════════════════════════════════════════╝

  Invoice ID : ${invoiceId}
  Client     : ${invoice.client?.name || "Unknown"}
  Amount     : ${total}
  Issued     : ${invoice.issueDate || "Unknown"}
  Due        : ${invoice.dueDate   || "Unknown"}
  Claimed Freelancer Wallet: ${invoice.freelancer?.address || "None"}

  Local File Hash: ${recomputedHash}
`);

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

  const contractAddress = process.env.CONTRACT;
  const rpc = process.env.RPC_URL || "https://atlantic.dplabs-internal.com";

  if (!contractAddress) {
    console.log("  CONTRACT not configured in env. Skipping onchain lookup.");
    return;
  }

  console.log("  Querying Pharos Blockchain Registry...");
  const provider = new ethers.JsonRpcProvider(rpc, null, {
    staticNetwork: ethers.Network.from(688689)
  });
  
  const abi = [
    "function getInvoice(string invoiceId) external view returns (tuple(string invoiceId, bytes32 dataHash, address issuer, address clientWallet, uint256 timestamp, uint256 dueTimestamp, uint256 amountUSD, string clientName, uint8 status, bool clientAcknowledged, bool clientDisputed, bool exists))"
  ];

  const contract = new ethers.Contract(contractAddress, abi, provider);

  try {
    const onchainInv = await contract.getInvoice(invoiceId);
    
    if (!onchainInv.exists) {
      console.log(`
  ⚠  NOT LOGGED — This invoice ID has not been registered onchain yet.
`);
      return;
    }

    const hashesMatch = onchainInv.dataHash.toLowerCase() === recomputedHash.toLowerCase();
    
    // Check for spoofing: Freelancer address in JSON must match the onchain transaction signer (issuer)
    const claimedAddress = (invoice.freelancer?.address || "").toLowerCase();
    const actualIssuer = onchainInv.issuer.toLowerCase();
    const issuerVerified = claimedAddress === actualIssuer;

    console.log("──────────────────────────────────────────────────────────────");
    console.log("  ONCHAIN RECORD FOUND:");
    console.log("  Onchain Hash:       ", onchainInv.dataHash);
    console.log("  Actual Signer:      ", onchainInv.issuer);
    console.log("  Onchain Status:     ", statusMap[Number(onchainInv.status)]);
    if (onchainInv.clientWallet !== "0x0000000000000000000000000000000000000000") {
      console.log("  Registered Client:  ", onchainInv.clientWallet);
      console.log("  Client Acknowledged:", onchainInv.clientAcknowledged ? "✅ YES" : "❌ NO");
      console.log("  Client Disputed:    ", onchainInv.clientDisputed ? "⚠️ YES (Disputed!)" : "❌ NO");
    }
    console.log("──────────────────────────────────────────────────────────────");

    if (!hashesMatch) {
      console.log(`
  ❌ HASH MISMATCH — The invoice file details do not match the onchain record!
     The file has been tampered with or modified since it was logged.
`);
    } else if (!issuerVerified) {
      console.log(`
  ❌ SPOOFING DETECTED — Security Alert!
     The invoice JSON claims it belongs to freelancer wallet: ${invoice.freelancer?.address}
     However, this invoice hash was registered onchain by wallet: ${onchainInv.issuer}
     This invoice cannot be trusted!
`);
    } else {
      console.log(`
  ✅ VERIFIED AUTHENTIC — Invoice details are completely verified!
     The file has not been altered, and the signer matches the creator signature.
`);
    }

  } catch (err) {
    if (err.message.includes("InvoiceNotFound") || err.message.includes("revert")) {
      console.log(`
  ⚠  NOT LOGGED — This invoice ID is not registered in this contract onchain.
`);
    } else {
      console.error("  ❌ RPC Query Failed:", err.message);
    }
  }
}

main().catch(console.error);
