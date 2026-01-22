# P2P Vault Contract Deployment Guide

## Prerequisites

1. **Install Foundry**
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

2. **Install OpenZeppelin contracts**
```bash
cd packages/contracts
forge install OpenZeppelin/openzeppelin-contracts --no-commit
```

3. **Set up environment variables**
Create a `.env` file in the contracts directory:

```bash
# Deployer wallet private key (without 0x prefix)
DEPLOYER_PRIVATE_KEY=your_private_key_here

# Bridge relayer address (use a secure multi-sig in production)
BRIDGE_RELAYER_ADDRESS=0x...

# BSC Configuration
BSC_RPC_URL=https://bsc-dataseed1.binance.org
BSC_USDT_ADDRESS=0x55d398326f99059fF775485246999027B3197955

# DSC Configuration
DSC_RPC_URL=https://rpc01.dscscan.io/
DSC_DEP20_USDT_ADDRESS=0xbc27aCEac6865dE31a286Cd9057564393D5251CB

# For contract verification
BSCSCAN_API_KEY=your_bscscan_api_key
```

## Deployment Steps

### Step 1: Deploy BSC Vault

```bash
cd packages/contracts

# Load environment
source .env

# Deploy to BSC Mainnet
forge script script/DeployVaults.s.sol:DeployVaultBSC \
  --rpc-url $BSC_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast \
  --verify
```

**Expected Output:**
```
=================================
Deploying P2PVaultBSC on BSC Chain
=================================
USDT Address: 0x55d398326f99059fF775485246999027B3197955
Bridge Relayer: 0x...
=================================
P2PVaultBSC deployed at: 0x... (COPY THIS!)
Owner: 0x...
=================================
```

### Step 2: Deploy DSC Vault

```bash
# Deploy to DSC Chain
forge script script/DeployVaults.s.sol:DeployVaultDSC \
  --rpc-url $DSC_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast
```

**Expected Output:**
```
=================================
Deploying P2PVaultDSC on DSC Chain
=================================
DEP20 USDT Address: 0xbc27aCEac6865dE31a286Cd9057564393D5251CB
Bridge Relayer: 0x...
=================================
P2PVaultDSC deployed at: 0x... (COPY THIS!)
Owner: 0x...
=================================
```

### Step 3: Update contracts.json

After deployment, update `deployments/contracts.json` with the actual addresses:

```json
{
  "chains": {
    "56": {
      "name": "BSC",
      "contracts": {
        "vault": "0x_YOUR_BSC_VAULT_ADDRESS",
        "usdt": "0x55d398326f99059fF775485246999027B3197955"
      }
    },
    "1555": {
      "name": "DSC Chain",
      "contracts": {
        "vault": "0x_YOUR_DSC_VAULT_ADDRESS",
        "usdt": "0xbc27aCEac6865dE31a286Cd9057564393D5251CB"
      }
    }
  },
  "bridgeRelayer": "0x_YOUR_BRIDGE_RELAYER",
  "deployedAt": "2026-01-22",
  "lastUpdated": "2026-01-22"
}
```

### Step 4: Update Frontend Environment

Update `apps/web/.env.local`:

```bash
# BSC Vault Address
NEXT_PUBLIC_CHAIN_A_VAULT_CONTRACT="0x_YOUR_BSC_VAULT_ADDRESS"

# DSC Vault Address
NEXT_PUBLIC_CHAIN_B_VAULT_CONTRACT="0x_YOUR_DSC_VAULT_ADDRESS"

# Bridge Relayer
NEXT_PUBLIC_BRIDGE_RELAYER="0x_YOUR_BRIDGE_RELAYER"
```

## Verification

### Verify BSC Contract on BscScan

```bash
forge verify-contract \
  --chain-id 56 \
  --constructor-args $(cast abi-encode "constructor(address,address)" $BSC_USDT_ADDRESS $BRIDGE_RELAYER_ADDRESS) \
  0x_YOUR_BSC_VAULT_ADDRESS \
  src/P2PVaultBSC.sol:P2PVaultBSC \
  --etherscan-api-key $BSCSCAN_API_KEY
```

## Post-Deployment Checklist

- [ ] Both vault addresses recorded
- [ ] contracts.json updated
- [ ] Frontend .env.local updated
- [ ] Contracts verified on block explorers
- [ ] Bridge relayer configured and funded
- [ ] Test order creation (small amount)
- [ ] Test order cancellation
- [ ] Test order filling (full flow)

## Admin Operations

### Pause Contract (Emergency)
```bash
cast send $BSC_VAULT_ADDRESS "pause()" \
  --rpc-url $BSC_RPC_URL \
  --private-key $OWNER_PRIVATE_KEY
```

### Unpause Contract
```bash
cast send $BSC_VAULT_ADDRESS "unpause()" \
  --rpc-url $BSC_RPC_URL \
  --private-key $OWNER_PRIVATE_KEY
```

### Change Bridge Relayer (2-step, 24h delay)

**Step 1: Initiate**
```bash
cast send $BSC_VAULT_ADDRESS "initiateBridgeRelayerChange(address)" $NEW_RELAYER \
  --rpc-url $BSC_RPC_URL \
  --private-key $OWNER_PRIVATE_KEY
```

**Step 2: Complete (after 24 hours)**
```bash
cast send $BSC_VAULT_ADDRESS "completeBridgeRelayerChange()" \
  --rpc-url $BSC_RPC_URL \
  --private-key $OWNER_PRIVATE_KEY
```

### Emergency Mode

**Activate (pauses contract)**
```bash
cast send $BSC_VAULT_ADDRESS "activateEmergencyMode()" \
  --rpc-url $BSC_RPC_URL \
  --private-key $OWNER_PRIVATE_KEY
```

**Withdraw (after 2 days)**
```bash
cast send $BSC_VAULT_ADDRESS "emergencyWithdraw(address)" $DESTINATION \
  --rpc-url $BSC_RPC_URL \
  --private-key $OWNER_PRIVATE_KEY
```

## Troubleshooting

### "Insufficient balance" error
- Check deployer wallet has enough BNB/DSC for gas

### "Contract not verified" on explorer
- Ensure compiler version matches (0.8.20)
- Ensure optimizer settings match (runs=200)
- Check constructor arguments are correct

### "Transaction reverted"
- Check all constructor addresses are valid
- Check bridge relayer is not zero address
- Check USDT address is correct

