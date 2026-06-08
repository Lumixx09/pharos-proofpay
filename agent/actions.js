/**
 * ProofPay Agent — Action Handlers
 *
 * Every action the agent can take in response to natural language input.
 * Wraps the underlying ProofPay Skill scripts and contract calls.
 */

const { ethers }    = require("ethers");
const { spawnSync } = require("child_process");
const fs   = require("fs");
const path = require("path");

const INVOICES_DIR = path.join(process.cwd(), "invoices");
const STATUS_MAP   = ["UNPAID", "PAID", "CANCELLED"];

const READ_ABI = [
  "function getInvoice(string invoiceId) external view returns (tuple(string invoiceId, bytes32 dataHash, address issuer, address clientWallet, uint256 timestamp, uint256 dueTimestamp, uint256 amountUSD, string clientName, uint8 status, bool clientAcknowledged, bool clientDisputed, bool exists))",
  "function getIssuerInvoices(address issuer) external view returns (string[])",
  "function getOverdueInvoices(address issuer) external view returns (string[])",
  "function verifyInvoice(string invoiceId, bytes32 dataHash) external view returns (bool)",
  "function totalInvoices() external view returns (uint256)",
];

const WRITE_ABI = [
  "function markPaid(string invoiceId) external",
  "function cancelInvoice(string invoiceId) external",
];

class Actions {
  constructor({ provider, contractAddress, wallet }) {
    this.provider        = provider;
    this.contractAddress = contractAddress;
    this.wallet          = wallet;
    this.readContract    = new ethers.Contract(contractAddress, READ_ABI, provider);
    this.writeContract   = new ethers.Contract(contractAddress, WRITE_ABI, wallet);
  }

  // ─── Status Queries ────────────────────────────────────────────────────────

  async getInvoiceStatus(invoiceId) {
    try {
      const inv    = await this.readContract.getInvoice(invoiceId);
      const status = STATUS_MAP[Number(inv.status)] || "UNKNOWN";
      const usd    = (Number(inv.amountUSD) / 100).toFixed(2);
      const due    = new Date(Number(inv.dueTimestamp) * 1000).toLocaleDateString();
      const now    = Math.floor(Date.now() / 1000);
      const isOverdue = Number(inv.status) === 0 && Number(inv.dueTimestamp) < now;

      return {
        invoiceId,
        status: isOverdue ? "OVERDUE" : status,
        clientName: inv.clientName,
        amountUSD: `$${usd}`,
        dueDate: due,
        issuer: inv.issuer,
        clientWallet: inv.clientWallet,
        clientAcknowledged: inv.clientAcknowledged,
        clientDisputed: inv.clientDisputed,
        exists: inv.exists,
      };
    } catch (err) {
      if (err.message.includes("InvoiceNotFound") || err.message.includes("revert")) {
        return { invoiceId, exists: false, status: "NOT_FOUND" };
      }
      throw err;
    }
  }

  async listAllInvoices(issuerAddress) {
    const ids = await this.readContract.getIssuerInvoices(issuerAddress);
    const results = [];
    for (const id of ids) {
      results.push(await this.getInvoiceStatus(id));
    }
    return results;
  }

  async listOverdue(issuerAddress) {
    const ids = await this.readContract.getOverdueInvoices(issuerAddress);
    const results = [];
    for (const id of ids) {
      results.push(await this.getInvoiceStatus(id));
    }
    return results;
  }

  async getTotalInvoices() {
    const total = await this.readContract.totalInvoices();
    return Number(total);
  }

  // ─── Search by client name (local files) ──────────────────────────────────

  async findByClient(clientName) {
    if (!fs.existsSync(INVOICES_DIR)) return [];
    const files  = fs.readdirSync(INVOICES_DIR).filter(f => f.endsWith(".json") && !f.endsWith(".receipt.json"));
    const matches = [];
    for (const file of files) {
      try {
        const inv = JSON.parse(fs.readFileSync(path.join(INVOICES_DIR, file), "utf8"));
        if ((inv.client?.name || "").toLowerCase().includes(clientName.toLowerCase())) {
          const onchain = await this.getInvoiceStatus(inv.invoiceId);
          matches.push({ ...onchain, clientName: inv.client?.name });
        }
      } catch { }
    }
    return matches;
  }

  // ─── Write Operations ──────────────────────────────────────────────────────

  async markPaid(invoiceId) {
    console.log(`  [action] Sending markPaid("${invoiceId}") to chain...`);
    const tx      = await this.writeContract.markPaid(invoiceId);
    const receipt = await tx.wait();

    // Update local receipt file
    this._updateReceipt(invoiceId, "PAID", "markPaid", "InvoicePaid", receipt.hash);

    return {
      invoiceId,
      txHash: receipt.hash,
      explorerUrl: `https://atlantic.pharosscan.xyz/tx/${receipt.hash}`,
      status: "PAID",
    };
  }

  async cancelInvoice(invoiceId) {
    console.log(`  [action] Sending cancelInvoice("${invoiceId}") to chain...`);
    const tx      = await this.writeContract.cancelInvoice(invoiceId);
    const receipt = await tx.wait();

    this._updateReceipt(invoiceId, "CANCELLED", "cancelInvoice", "InvoiceCancelled", receipt.hash);

    return {
      invoiceId,
      txHash: receipt.hash,
      explorerUrl: `https://atlantic.pharosscan.xyz/tx/${receipt.hash}`,
      status: "CANCELLED",
    };
  }

  // ─── Verify ────────────────────────────────────────────────────────────────

  async verifyInvoice(invoiceId) {
    const invoiceFile = path.join(INVOICES_DIR, `${invoiceId}.json`);
    if (!fs.existsSync(invoiceFile)) {
      return { invoiceId, result: "FILE_NOT_FOUND", verified: false };
    }

    const result = spawnSync("node", [
      path.join(process.cwd(), "scripts", "verify-invoice.js"),
      "--id", invoiceId,
    ], { encoding: "utf8" });

    const output = result.stdout || result.stderr || "";
    const verified   = output.includes("VERIFIED AUTHENTIC");
    const tampered   = output.includes("HASH MISMATCH");
    const spoofed    = output.includes("SPOOFING DETECTED");
    const notLogged  = output.includes("NOT LOGGED");

    return {
      invoiceId,
      verified,
      tampered,
      spoofed,
      notLogged,
      result: verified ? "VERIFIED" : tampered ? "TAMPERED" : spoofed ? "SPOOFED" : notLogged ? "NOT_LOGGED" : "UNKNOWN",
      raw: output,
    };
  }

  // ─── Generate Invoice (delegates to Skill script) ─────────────────────────

  generateInvoice(flags) {
    // flags: { client, work, amount, days, autolog, clientWallet, item }
    const args = ["scripts/generate-invoice.js"];
    if (flags.client)       args.push("--client", flags.client);
    if (flags.work)         args.push("--work",   flags.work);
    if (flags.amount)       args.push("--amount", String(flags.amount));
    if (flags.days)         args.push("--days",   String(flags.days));
    if (flags.id)           args.push("--id",     flags.id);
    if (flags.clientWallet) args.push("--client-wallet", flags.clientWallet);
    if (flags.autolog)      args.push("--autolog");
    if (flags.item)         flags.item.forEach(i => args.push("--item", i));

    const result = spawnSync("node", args, { encoding: "utf8" });
    return result.stdout || result.stderr;
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  _updateReceipt(invoiceId, status, actionKey, eventName, txHash) {
    const receiptFile = path.join(INVOICES_DIR, `${invoiceId}.receipt.json`);
    let receipt = { invoiceId, onchain: {} };
    if (fs.existsSync(receiptFile)) {
      try { receipt = JSON.parse(fs.readFileSync(receiptFile, "utf8")); } catch { }
    }
    receipt.finalStatus = status;
    receipt.onchain     = receipt.onchain || {};
    receipt.onchain[actionKey] = {
      txHash,
      explorerUrl: `https://atlantic.pharosscan.xyz/tx/${txHash}`,
      event: eventName,
      timestamp: new Date().toISOString(),
    };
    if (!fs.existsSync(INVOICES_DIR)) fs.mkdirSync(INVOICES_DIR, { recursive: true });
    fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2));
  }
}

module.exports = Actions;
