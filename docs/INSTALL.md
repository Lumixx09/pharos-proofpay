# Installation Guide

Step-by-step setup for pharos-proofpay on any platform.

---

## Prerequisites Overview

| Tool | Version | Purpose |
|---|---|---|
| Node.js | v18 or higher | Runs the invoice generator scripts |
| npm | Bundled with Node.js | Installs JavaScript dependencies |
| Foundry (forge + cast) | Latest | Compiles and deploys the smart contract |
| Git | Any | Clones the repository and manages forge dependencies |
| A Pharos wallet | — | Signs transactions |
| Testnet PHRS | — | Gas fee token (free from faucet) |

---

## Step 1 — Install Node.js

### macOS

```bash
# Using Homebrew (recommended)
brew install node

# Or download the installer from nodejs.org
# https://nodejs.org → click "LTS" → download and run the .pkg file
```

### Windows

Download the installer from [nodejs.org](https://nodejs.org), click **LTS**, run the `.msi` file, and follow the prompts.

### Linux (Ubuntu / Debian)

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Verify

```bash
node --version   # should print v18.x.x or higher
npm --version    # should print a version number
```

---

## Step 2 — Install Foundry

Foundry provides `forge` (compile + test + deploy) and `cast` (call contracts).

### macOS / Linux

```bash
curl -L https://foundry.paradigm.xyz | bash
```

After the script runs, open a **new terminal window** (or run `source ~/.bashrc` / `source ~/.zshrc`), then:

```bash
foundryup
```

### Windows

Open **PowerShell** and run:

```powershell
curl -L https://foundry.paradigm.xyz | bash
```

Then open a new PowerShell window and run:

```powershell
foundryup
```

> **Note:** On Windows, Foundry works best through WSL2 (Windows Subsystem for Linux). If you encounter issues with native Windows Foundry, install WSL2 with Ubuntu and follow the Linux steps above.

### Verify

```bash
forge --version   # should print forge x.x.x
cast --version    # should print cast x.x.x
```

---

## Step 3 — Clone the Repository

```bash
git clone https://github.com/yourusername/pharos-proofpay.git
cd pharos-proofpay
```

---

## Step 4 — Install JavaScript Dependencies

```bash
npm install
```

This installs `ethereum-cryptography`, which provides the real keccak256 hash function. Verify it works:

```bash
node -e "require('ethereum-cryptography/keccak'); console.log('OK')"
```

---

## Step 5 — Install Foundry Standard Library

The smart contract tests require `forge-std`. Run this **once** in the project root:

```bash
forge install foundry-rs/forge-std
```

This creates a `lib/forge-std` directory. You should see a `.gitmodules` file appear. Verify the tests compile:

```bash
forge build
```

---

## Step 6 — Set Up Your Wallet

You need an EVM-compatible wallet to sign transactions. You can use an existing wallet (MetaMask, hardware wallet) or generate a new one.

### Generate a new wallet with cast (recommended for testnet)

```bash
cast wallet new
```

Output:

```
Successfully created new keypair.
Address:     0xYourNewAddress
Private key: 0xYourPrivateKey
```

**Write down both values. Never share your private key with anyone.**

### Or import an existing private key

If you already have a wallet, find its private key in MetaMask under:
`Account Details → Export Private Key`

---

## Step 7 — Configure Your Environment

Open the `.env` file in the project root and fill in your values:

```
PRIVATE_KEY=0xYourPrivateKey
CONTRACT=
RPC_URL=https://atlantic.dplabs-internal.com
```

Leave `CONTRACT` blank for now — you will fill it in after deploying.

---

## Step 8 — Get Testnet PHRS

You need PHRS tokens to pay for transactions on the Pharos Atlantic Testnet.

1. Get your wallet address:
   ```bash
   cast wallet address --private-key $PRIVATE_KEY
   ```
   (Or read it from your `.env` or wherever you saved it.)

2. Visit the Pharos testnet faucet and request tokens for your address.

3. Check your balance:
   ```bash
   source .env && export PRIVATE_KEY RPC_URL

   cast balance \
     $(cast wallet address --private-key $PRIVATE_KEY) \
     --rpc-url $RPC_URL \
     --ether
   ```

   You should see a non-zero balance.

---

## Step 9 — Deploy the Smart Contract

This is a one-time step per network. The deploy script will print the contract address.

```bash
# Load environment variables
source .env && export PRIVATE_KEY RPC_URL

# Deploy
forge script contracts/script/Deploy.s.sol:DeployInvoiceLogger \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast
```

Expected output:

```
InvoiceLogger deployed at: 0xAbCdEf1234567890AbCdEf1234567890AbCdEf12
Network Chain ID: 688689
Deployer: 0xYourWalletAddress
```

Copy the deployed address and add it to your `.env`:

```
CONTRACT=0xAbCdEf1234567890AbCdEf1234567890AbCdEf12
```

Verify it appears on the explorer:
```
https://atlantic.pharosscan.xyz/address/0xYourContractAddress
```

---

## Step 10 — Run the Tests

Confirm everything works before using the tool on real invoices:

```bash
forge test -vv
```

All 16 tests should pass:

```
[PASS] test_LogInvoice()
[PASS] test_MarkPaid()
[PASS] test_CancelInvoice()
[PASS] test_GetOverdueInvoices()
... (16 total)
```

---

## Step 11 — Generate Your First Test Invoice

```bash
source .env && export PRIVATE_KEY CONTRACT RPC_URL

node scripts/generate-invoice.js \
  --client "Test Client" \
  --work "Test invoice — setup verification" \
  --amount 1 \
  --days 7
```

Copy the `cast send` command from the output and run it. You will receive a transaction hash. Check it on the explorer:

```
https://atlantic.pharosscan.xyz/tx/0xYourTxHash
```

Installation is complete.

---

## Platform-Specific Notes

### Windows (native, without WSL)

- Use PowerShell for all commands, not Command Prompt
- Load environment variables with `$env:PRIVATE_KEY = "..."` instead of `export`
- If `forge` and `cast` are not recognised after `foundryup`, restart PowerShell and try again
- Path issues are the most common Windows problem — make sure `~/.foundry/bin` is in your PATH

### macOS (Apple Silicon / M1/M2/M3)

Foundry has native ARM builds. If you get architecture errors, run `foundryup` again after Rosetta 2 is installed (`softwareupdate --install-rosetta`).

### Linux (CI / server environments)

For headless server installs, you may need to set `HOME` before running `foundryup`:

```bash
export HOME=/root
curl -L https://foundry.paradigm.xyz | bash
export PATH="$HOME/.foundry/bin:$PATH"
foundryup
```

---

## Uninstalling

### Remove Foundry

```bash
rm -rf ~/.foundry
```

Remove `~/.foundry/bin` from your PATH in `.bashrc` / `.zshrc`.

### Remove Node dependencies

```bash
rm -rf node_modules
```

### Remove the project

```bash
cd ..
rm -rf pharos-proofpay
```

Note: your deployed smart contract remains on the blockchain permanently regardless of what you do locally.


