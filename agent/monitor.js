/**
 * ProofPay Agent — Blockchain Event Monitor
 *
 * Subscribes to InvoiceLogger contract events in real time.
 * On each event, updates the local receipt file and notifies the agent.
 */

const { ethers } = require("ethers");
const fs   = require("fs");
const path = require("path");

const INVOICES_DIR = path.join(process.cwd(), "invoices");

const ABI = [
  "event InvoiceLogged(string indexed invoiceId, address indexed issuer, address clientWallet, bytes32 dataHash, uint256 amountUSD, string clientName, uint256 dueTimestamp, uint256 timestamp)",
  "event InvoicePaid(string indexed invoiceId, address indexed issuer, uint256 timestamp)",
  "event InvoiceCancelled(string indexed invoiceId, address indexed issuer, uint256 timestamp)",
  "event InvoiceAcknowledged(string indexed invoiceId, address indexed clientWallet, uint256 timestamp)",
  "event InvoiceDisputed(string indexed invoiceId, address indexed clientWallet, uint256 timestamp)",
];

function receiptPath(invoiceId) {
  return path.join(INVOICES_DIR, `${invoiceId}.receipt.json`);
}

function loadReceipt(invoiceId) {
  const p = receiptPath(invoiceId);
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { }
  }
  return { invoiceId, onchain: {} };
}

function saveReceipt(receipt) {
  if (!fs.existsSync(INVOICES_DIR)) fs.mkdirSync(INVOICES_DIR, { recursive: true });
  fs.writeFileSync(receiptPath(receipt.invoiceId), JSON.stringify(receipt, null, 2));
}

function explorerTx(txHash) {
  return `https://atlantic.pharosscan.xyz/tx/${txHash}`;
}

function ts(blockTimestamp) {
  return new Date(Number(blockTimestamp) * 1000).toISOString();
}

class Monitor {
  constructor({ provider, contractAddress, onEvent }) {
    this.provider        = provider;
    this.contractAddress = contractAddress;
    this.onEvent         = onEvent; // callback(type, data)
    this.contract        = null;
    this.running         = false;
  }

  start() {
    this.contract = new ethers.Contract(this.contractAddress, ABI, this.provider);
    this.running  = true;

    this.contract.on("InvoiceLogged", (invoiceId, issuer, clientWallet, dataHash, amountUSD, clientName, dueTimestamp, timestamp, event) => {
      const txHash  = event.log.transactionHash;
      const receipt = loadReceipt(invoiceId);
      receipt.invoiceId    = invoiceId;
      receipt.contract     = this.contractAddress;
      receipt.issuerWallet = issuer;
      receipt.dataHash     = dataHash;
      receipt.finalStatus  = "UNPAID";
      receipt.onchain      = receipt.onchain || {};
      receipt.onchain.logInvoice = {
        txHash,
        explorerUrl: explorerTx(txHash),
        event: "InvoiceLogged",
        timestamp: ts(timestamp),
      };
      saveReceipt(receipt);

      const usd = (Number(amountUSD) / 100).toFixed(2);
      this.onEvent("InvoiceLogged", {
        invoiceId,
        issuer,
        clientName,
        amountUSD: `$${usd}`,
        txHash,
        explorerUrl: explorerTx(txHash),
      });
    });

    this.contract.on("InvoicePaid", (invoiceId, issuer, timestamp, event) => {
      const txHash  = event.log.transactionHash;
      const receipt = loadReceipt(invoiceId);
      receipt.finalStatus = "PAID";
      receipt.onchain     = receipt.onchain || {};
      receipt.onchain.markPaid = {
        txHash,
        explorerUrl: explorerTx(txHash),
        event: "InvoicePaid",
        timestamp: ts(timestamp),
      };
      saveReceipt(receipt);

      this.onEvent("InvoicePaid", { invoiceId, issuer, txHash, explorerUrl: explorerTx(txHash) });
    });

    this.contract.on("InvoiceCancelled", (invoiceId, issuer, timestamp, event) => {
      const txHash  = event.log.transactionHash;
      const receipt = loadReceipt(invoiceId);
      receipt.finalStatus = "CANCELLED";
      receipt.onchain     = receipt.onchain || {};
      receipt.onchain.cancelInvoice = {
        txHash,
        explorerUrl: explorerTx(txHash),
        event: "InvoiceCancelled",
        timestamp: ts(timestamp),
      };
      saveReceipt(receipt);

      this.onEvent("InvoiceCancelled", { invoiceId, issuer, txHash, explorerUrl: explorerTx(txHash) });
    });

    this.contract.on("InvoiceAcknowledged", (invoiceId, clientWallet, timestamp, event) => {
      const txHash  = event.log.transactionHash;
      const receipt = loadReceipt(invoiceId);
      receipt.onchain = receipt.onchain || {};
      receipt.onchain.acknowledge = {
        txHash,
        explorerUrl: explorerTx(txHash),
        event: "InvoiceAcknowledged",
        clientWallet,
        timestamp: ts(timestamp),
      };
      saveReceipt(receipt);

      this.onEvent("InvoiceAcknowledged", { invoiceId, clientWallet, txHash, explorerUrl: explorerTx(txHash) });
    });

    this.contract.on("InvoiceDisputed", (invoiceId, clientWallet, timestamp, event) => {
      const txHash  = event.log.transactionHash;
      const receipt = loadReceipt(invoiceId);
      receipt.onchain = receipt.onchain || {};
      receipt.onchain.dispute = {
        txHash,
        explorerUrl: explorerTx(txHash),
        event: "InvoiceDisputed",
        clientWallet,
        timestamp: ts(timestamp),
      };
      saveReceipt(receipt);

      this.onEvent("InvoiceDisputed", { invoiceId, clientWallet, txHash, explorerUrl: explorerTx(txHash) });
    });

    console.log(`  [monitor] Listening for InvoiceLogger events on ${this.contractAddress}`);
  }

  stop() {
    if (this.contract) this.contract.removeAllListeners();
    this.running = false;
    console.log("  [monitor] Stopped.");
  }
}

module.exports = Monitor;
