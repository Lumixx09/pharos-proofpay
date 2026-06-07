const fs = require("fs");
const path = require("path");
const solc = require("solc");
const { ethers } = require("ethers");

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
  } catch (e) {
    console.warn("Failed to load .env:", e.message);
  }

  console.log("Compiling contracts/src/InvoiceLogger.sol...");
  const contractPath = path.join(__dirname, "../contracts/src/InvoiceLogger.sol");
  const source = fs.readFileSync(contractPath, "utf8");

  const input = {
    language: "Solidity",
    sources: {
      "InvoiceLogger.sol": {
        content: source,
      },
    },
    settings: {
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  
  if (output.errors) {
    let hasError = false;
    for (const error of output.errors) {
      console.error(error.formattedMessage);
      if (error.severity === "error") {
        hasError = true;
      }
    }
    if (hasError) {
      process.exit(1);
    }
  }

  const contractData = output.contracts["InvoiceLogger.sol"]["InvoiceLogger"];
  const abi = contractData.abi;
  const bytecode = contractData.evm.bytecode.object;

  console.log("Connecting to Pharos Atlantic Testnet...");
  const pk = process.env.PRIVATE_KEY;
  if (!pk) {
    console.error("❌ Error: PRIVATE_KEY not set. Add it to your .env file.");
    process.exit(1);
  }
  const rpc = process.env.RPC_URL || "https://atlantic.dplabs-internal.com";
  
  const provider = new ethers.JsonRpcProvider(rpc, null, {
    staticNetwork: ethers.Network.from(688689)
  });
  const wallet = new ethers.Wallet(pk, provider);
  console.log("Wallet address:", wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log("Gas balance:", ethers.formatEther(balance), "PHRS");

  if (balance === 0n) {
    console.error("❌ Error: Zero balance! Please fund your wallet first.");
    process.exit(1);
  }

  console.log("Deploying InvoiceLogger...");
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("\n✅ InvoiceLogger successfully deployed at:", address);

  // Write contract address back to .env
  const envPath = path.join(__dirname, "../.env");
  let envContent = fs.readFileSync(envPath, "utf8");
  if (envContent.includes("CONTRACT=")) {
    envContent = envContent.replace(/CONTRACT=.*/, `CONTRACT=${address}`);
  } else {
    envContent += `\nCONTRACT=${address}`;
  }
  fs.writeFileSync(envPath, envContent);
  console.log("Updated .env file with CONTRACT address.");
}

main().catch(console.error);
