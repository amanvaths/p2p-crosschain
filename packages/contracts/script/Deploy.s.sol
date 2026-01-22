// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/P2PVaultBSC.sol";
import "../src/P2PVaultDSC.sol";

/**
 * @title DeployBSC
 * @notice Deploy P2PVaultBSC to BSC chain
 * @dev Run with: forge script script/Deploy.s.sol:DeployBSC --rpc-url bsc --broadcast --verify
 */
contract DeployBSC is Script {
    function run() external {
        // Load environment variables
        address usdt = vm.envAddress("BSC_USDT_ADDRESS");
        address bridgeRelayer = vm.envAddress("BRIDGE_RELAYER_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        console.log("Deploying P2PVaultBSC...");
        console.log("USDT Address:", usdt);
        console.log("Bridge Relayer:", bridgeRelayer);
        
        vm.startBroadcast(deployerPrivateKey);
        
        P2PVaultBSC vault = new P2PVaultBSC(usdt, bridgeRelayer);
        
        vm.stopBroadcast();
        
        console.log("P2PVaultBSC deployed at:", address(vault));
        console.log("Owner:", vault.owner());
    }
}

/**
 * @title DeployDSC
 * @notice Deploy P2PVaultDSC to DSC chain
 * @dev Run with: forge script script/Deploy.s.sol:DeployDSC --rpc-url dsc --broadcast --verify
 */
contract DeployDSC is Script {
    function run() external {
        // Load environment variables
        address dep20 = vm.envAddress("DSC_DEP20_USDT_ADDRESS");
        address bridgeRelayer = vm.envAddress("BRIDGE_RELAYER_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        console.log("Deploying P2PVaultDSC...");
        console.log("DEP20 USDT Address:", dep20);
        console.log("Bridge Relayer:", bridgeRelayer);
        
        vm.startBroadcast(deployerPrivateKey);
        
        P2PVaultDSC vault = new P2PVaultDSC(dep20, bridgeRelayer);
        
        vm.stopBroadcast();
        
        console.log("P2PVaultDSC deployed at:", address(vault));
        console.log("Owner:", vault.owner());
    }
}

/**
 * @title DeployAll
 * @notice Deploy both contracts (for testing purposes)
 */
contract DeployAll is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address bridgeRelayer = vm.envAddress("BRIDGE_RELAYER_ADDRESS");
        
        // BSC Deployment
        address bscUsdt = vm.envOr("BSC_USDT_ADDRESS", address(0x55d398326f99059fF775485246999027B3197955));
        
        // DSC Deployment
        address dscDep20 = vm.envOr("DSC_DEP20_USDT_ADDRESS", address(0xbc27aCEac6865dE31a286Cd9057564393D5251CB));
        
        vm.startBroadcast(deployerPrivateKey);
        
        P2PVaultBSC vaultBSC = new P2PVaultBSC(bscUsdt, bridgeRelayer);
        P2PVaultDSC vaultDSC = new P2PVaultDSC(dscDep20, bridgeRelayer);
        
        vm.stopBroadcast();
        
        console.log("===== Deployment Complete =====");
        console.log("P2PVaultBSC:", address(vaultBSC));
        console.log("P2PVaultDSC:", address(vaultDSC));
    }
}

/**
 * @title UpgradeRelayer
 * @notice Script to change bridge relayer (requires 2-step process)
 */
contract UpgradeRelayer is Script {
    function initiateChange(address vault, address newRelayer) external {
        uint256 ownerPrivateKey = vm.envUint("OWNER_PRIVATE_KEY");
        
        vm.startBroadcast(ownerPrivateKey);
        
        // Try BSC vault first
        try P2PVaultBSC(vault).initiateBridgeRelayerChange(newRelayer) {
            console.log("Initiated relayer change for BSC vault");
        } catch {
            // Try DSC vault
            P2PVaultDSC(vault).initiateBridgeRelayerChange(newRelayer);
            console.log("Initiated relayer change for DSC vault");
        }
        
        vm.stopBroadcast();
        
        console.log("New relayer change initiated for:", newRelayer);
        console.log("Must wait 24 hours before completing");
    }
    
    function completeChange(address vault) external {
        uint256 ownerPrivateKey = vm.envUint("OWNER_PRIVATE_KEY");
        
        vm.startBroadcast(ownerPrivateKey);
        
        // Try BSC vault first
        try P2PVaultBSC(vault).completeBridgeRelayerChange() {
            console.log("Completed relayer change for BSC vault");
        } catch {
            // Try DSC vault
            P2PVaultDSC(vault).completeBridgeRelayerChange();
            console.log("Completed relayer change for DSC vault");
        }
        
        vm.stopBroadcast();
    }
}

/**
 * @title EmergencyActions
 * @notice Script for emergency operations
 */
contract EmergencyActions is Script {
    function activateEmergency(address vault) external {
        uint256 ownerPrivateKey = vm.envUint("OWNER_PRIVATE_KEY");
        
        vm.startBroadcast(ownerPrivateKey);
        
        try P2PVaultBSC(vault).activateEmergencyMode() {
            console.log("Emergency mode activated for BSC vault");
        } catch {
            P2PVaultDSC(vault).activateEmergencyMode();
            console.log("Emergency mode activated for DSC vault");
        }
        
        vm.stopBroadcast();
        
        console.log("WARNING: Emergency withdrawal available in 2 days");
    }
    
    function emergencyWithdraw(address vault, address to) external {
        uint256 ownerPrivateKey = vm.envUint("OWNER_PRIVATE_KEY");
        
        vm.startBroadcast(ownerPrivateKey);
        
        try P2PVaultBSC(vault).emergencyWithdraw(to) {
            console.log("Emergency withdrawal completed from BSC vault to:", to);
        } catch {
            P2PVaultDSC(vault).emergencyWithdraw(to);
            console.log("Emergency withdrawal completed from DSC vault to:", to);
        }
        
        vm.stopBroadcast();
    }
}
