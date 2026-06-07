const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

async function main() {
  const invoiceId = process.argv[2];
  const hash = process.argv[3];
  const amountUSD = parseInt(process.argv[4]);
  const dueTimestamp = parseInt(process.argv[5]);
  const clientName = process.argv[6];
  const clientWallet = process.argv[7] || "0x0000000000000000000000000000000000000000";

  if (!invoiceId || !hash || isNaN(amountUSD) || isNaN(dueTimestamp) || !clientName) {
    console.error("Usage: node log-invoice.js <id> <hash> <amount> <dueTimestamp> <client> [clientWallet]");
    process.exit(1);
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
  } catch (e) {
    console.warn("Failed to load .env:", e.message);
  }

  const pk = process.env.PRIVATE_KEY;
  const contractAddress = process.env.CONTRACT;
  const rpc = process.env.RPC_URL || "https://atlantic.dplabs-internal.com";

  if (!pk || !contractAddress) {
    console.error("❌ Error: PRIVATE_KEY and CONTRACT address must be set in your .env file.");
    process.exit(1);
  }

  console.log("Connecting to Pharos Atlantic Testnet...");
  const provider = new ethers.JsonRpcProvider(rpc, null, {
    staticNetwork: ethers.Network.from(688689)
  });
  const wallet = new ethers.Wallet(pk, provider);

  const abi = [
    "function logInvoice(string invoiceId, bytes32 dataHash, uint256 amountUSD, uint256 dueTimestamp, string clientName, address clientWallet) external"
  ];

  console.log(`Sending log transaction for invoice ${invoiceId}...`);
  const contract = new ethers.Contract(contractAddress, abi, wallet);
  
  const tx = await contract.logInvoice(invoiceId, hash, amountUSD, dueTimestamp, clientName, clientWallet);
  console.log("Transaction sent! Hash:", tx.hash);
  
  console.log("Waiting for confirmation...");
  const receipt = await tx.wait();

  if (receipt.status === 1) {
    console.log("\n✅ INVOICE LOGGED ONCHAIN SUCCESSFUL");
    console.log("Invoice ID  :", invoiceId);
    console.log("Tx Hash     :", tx.hash);
    console.log("Explorer URL: https://atlantic.pharosscan.xyz/tx/" + tx.hash);
  } else {
    console.error("❌ Transaction reverted!");
    process.exit(1);
  }
}

main().catch(console.error);
