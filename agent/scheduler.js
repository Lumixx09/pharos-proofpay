/**
 * ProofPay Agent — Scheduler
 *
 * Runs periodic tasks:
 *  - Overdue invoice check (default: every 60 minutes)
 *  - Full status sync for all local invoices
 */

const { ethers } = require("ethers");
const fs   = require("fs");
const path = require("path");

const INVOICES_DIR = path.join(process.cwd(), "invoices");
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

const READ_ABI = [
  "function getOverdueInvoices(address issuer) external view returns (string[])",
  "function getInvoice(string invoiceId) external view returns (tuple(string invoiceId, bytes32 dataHash, address issuer, address clientWallet, uint256 timestamp, uint256 dueTimestamp, uint256 amountUSD, string clientName, uint8 status, bool clientAcknowledged, bool clientDisputed, bool exists))",
  "function getIssuerInvoices(address issuer) external view returns (string[])",
];

const STATUS_MAP = ["UNPAID", "PAID", "CANCELLED"];

class Scheduler {
  constructor({ provider, contractAddress, issuerAddress, onEvent, intervalMs }) {
    this.provider        = provider;
    this.contractAddress = contractAddress;
    this.issuerAddress   = issuerAddress;
    this.onEvent         = onEvent;
    this.intervalMs      = intervalMs || DEFAULT_INTERVAL_MS;
    this.contract        = new ethers.Contract(contractAddress, READ_ABI, provider);
    this._timer          = null;
  }

  start() {
    console.log(`  [scheduler] Running every ${Math.round(this.intervalMs / 60000)} minute(s).`);
    this._run();
    this._timer = setInterval(() => this._run(), this.intervalMs);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    console.log("  [scheduler] Stopped.");
  }

  async _run() {
    await this.checkOverdue();
    await this.syncAllStatuses();
  }

  async checkOverdue() {
    try {
      const overdueIds = await this.contract.getOverdueInvoices(this.issuerAddress);
      if (overdueIds.length === 0) {
        console.log("  [scheduler] No overdue invoices.");
        return;
      }

      console.log(`\n  ⚠  OVERDUE INVOICES (${overdueIds.length}):`);
      for (const id of overdueIds) {
        try {
          const inv = await this.contract.getInvoice(id);
          const usd = (Number(inv.amountUSD) / 100).toFixed(2);
          const due = new Date(Number(inv.dueTimestamp) * 1000).toLocaleDateString();
          console.log(`     • ${id} — ${inv.clientName} — $${usd} — due ${due}`);
        } catch {
          console.log(`     • ${id}`);
        }
      }
      console.log();

      this.onEvent("OverdueFound", { count: overdueIds.length, ids: overdueIds });
    } catch (err) {
      console.error("  [scheduler] Overdue check failed:", err.message);
    }
  }

  async syncAllStatuses() {
    if (!fs.existsSync(INVOICES_DIR)) return;

    const jsonFiles = fs.readdirSync(INVOICES_DIR)
      .filter(f => f.endsWith(".json") && !f.endsWith(".receipt.json"));

    if (jsonFiles.length === 0) return;

    let synced = 0;
    for (const file of jsonFiles) {
      const invoiceId = file.replace(".json", "");
      const receiptFile = path.join(INVOICES_DIR, `${invoiceId}.receipt.json`);

      try {
        const inv    = await this.contract.getInvoice(invoiceId);
        const status = STATUS_MAP[Number(inv.status)] || "UNKNOWN";

        // Load or create receipt
        let receipt = { invoiceId, onchain: {} };
        if (fs.existsSync(receiptFile)) {
          try { receipt = JSON.parse(fs.readFileSync(receiptFile, "utf8")); } catch { }
        }

        // Update status in receipt
        const prevStatus = receipt.finalStatus;
        receipt.finalStatus         = status;
        receipt.lastSynced          = new Date().toISOString();
        receipt.clientAcknowledged  = inv.clientAcknowledged;
        receipt.clientDisputed      = inv.clientDisputed;
        receipt.contract            = receipt.contract || this.contractAddress;
        receipt.issuerWallet        = receipt.issuerWallet || inv.issuer;

        fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2));
        synced++;

        if (prevStatus && prevStatus !== status) {
          console.log(`  [scheduler] Status changed: ${invoiceId} ${prevStatus} → ${status}`);
          this.onEvent("StatusChanged", { invoiceId, from: prevStatus, to: status });
        }
      } catch {
        // Invoice not yet logged onchain — skip silently
      }
    }

    if (synced > 0) {
      console.log(`  [scheduler] Synced ${synced} invoice(s) from chain.`);
    }
  }
}

module.exports = Scheduler;
