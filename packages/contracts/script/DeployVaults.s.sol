// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/P2PVaultBSC.sol";
import "../src/P2PVaultDSC.sol";

/**
 * @title DeployVaultBSC
 * @notice Deploy P2PVaultBSC to BSC Chain
 * 
 * Run: forge script script/DeployVaults.s.sol:DeployVaultBSC \
 *      --rpc-url $BSC_RPC_URL \
 *      --private-key $DEPLOYER_PRIVATE_KEY \
 *      --broadcast --verify
 */
contract DeployVaultBSC is Script {
    function run() external {
        // Load environment variables
        address usdt = vm.envAddress("BSC_USDT_ADDRESS");
        address bridgeRelayer = vm.envAddress("BRIDGE_RELAYER_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        console.log("=================================");
        console.log("Deploying P2PVaultBSC on BSC Chain");
        console.log("=================================");
        console.log("USDT Address:", usdt);
        console.log("Bridge Relayer:", bridgeRelayer);
        
        vm.startBroadcast(deployerPrivateKey);
        
        P2PVaultBSC vault = new P2PVaultBSC(usdt, bridgeRelayer);
        
        vm.stopBroadcast();
        
        console.log("=================================");
        console.log("P2PVaultBSC deployed at:", address(vault));
        console.log("Owner:", vault.owner());
        console.log("=================================");
        
        // Write deployment info to file
        string memory json = string(abi.encodePacked(
            '{"chainId": 56, "contract": "P2PVaultBSC", "address": "',
            vm.toString(address(vault)),
            '", "usdt": "',
            vm.toString(usdt),
            '", "bridgeRelayer": "',
            vm.toString(bridgeRelayer),
            '"}'
        ));
        vm.writeFile("deployments/bsc-vault.json", json);
    }
}

/**
 * @title DeployVaultDSC
 * @notice Deploy P2PVaultDSC to DSC Chain
 * 
 * Run: forge script script/DeployVaults.s.sol:DeployVaultDSC \
 *      --rpc-url $DSC_RPC_URL \
 *      --private-key $DEPLOYER_PRIVATE_KEY \
 *      --broadcast
 */
contract DeployVaultDSC is Script {
    function run() external {
        // Load environment variables
        address dep20Usdt = vm.envAddress("DSC_DEP20_USDT_ADDRESS");
        address bridgeRelayer = vm.envAddress("BRIDGE_RELAYER_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        console.log("=================================");
        console.log("Deploying P2PVaultDSC on DSC Chain");
        console.log("=================================");
        console.log("DEP20 USDT Address:", dep20Usdt);
        console.log("Bridge Relayer:", bridgeRelayer);
        
        vm.startBroadcast(deployerPrivateKey);
        
        P2PVaultDSC vault = new P2PVaultDSC(dep20Usdt, bridgeRelayer);
        
        vm.stopBroadcast();
        
        console.log("=================================");
        console.log("P2PVaultDSC deployed at:", address(vault));
        console.log("Owner:", vault.owner());
        console.log("=================================");
        
        // Write deployment info to file
        string memory json = string(abi.encodePacked(
            '{"chainId": 1555, "contract": "P2PVaultDSC", "address": "',
            vm.toString(address(vault)),
            '", "dep20Usdt": "',
            vm.toString(dep20Usdt),
            '", "bridgeRelayer": "',
            vm.toString(bridgeRelayer),
            '"}'
        ));
        vm.writeFile("deployments/dsc-vault.json", json);
    }
}

/**
 * @title DeployBoth
 * @notice Helper to deploy both vaults (for testing)
 */
contract DeployBoth is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address bridgeRelayer = vm.envAddress("BRIDGE_RELAYER_ADDRESS");
        
        // BSC values
        address bscUsdt = vm.envOr("BSC_USDT_ADDRESS", address(0x55d398326f99059fF775485246999027B3197955));
        
        // DSC values
        address dscDep20 = vm.envOr("DSC_DEP20_USDT_ADDRESS", address(0xbc27aCEac6865dE31a286Cd9057564393D5251CB));
        
        console.log("=================================");
        console.log("Deploying Both Vaults");
        console.log("=================================");
        
        vm.startBroadcast(deployerPrivateKey);
        
        P2PVaultBSC vaultBSC = new P2PVaultBSC(bscUsdt, bridgeRelayer);
        P2PVaultDSC vaultDSC = new P2PVaultDSC(dscDep20, bridgeRelayer);
        
        vm.stopBroadcast();
        
        console.log("=================================");
        console.log("P2PVaultBSC:", address(vaultBSC));
        console.log("P2PVaultDSC:", address(vaultDSC));
        console.log("=================================");
        
        // Write combined deployment info
        string memory json = string(abi.encodePacked(
            '{"deployments": [',
            '{"chainId": 56, "vault": "', vm.toString(address(vaultBSC)), '", "usdt": "', vm.toString(bscUsdt), '"},',
            '{"chainId": 1555, "vault": "', vm.toString(address(vaultDSC)), '", "usdt": "', vm.toString(dscDep20), '"}',
            '], "bridgeRelayer": "', vm.toString(bridgeRelayer), '"}'
        ));
        vm.writeFile("deployments/contracts.json", json);
    }
}

/**
 * @title SetupBridgeRelayer
 * @notice Helper to configure bridge relayer after deployment
 */
contract SetupBridgeRelayer is Script {
    function initiateBscRelayerChange(address vault, address newRelayer) external {
        uint256 ownerPrivateKey = vm.envUint("OWNER_PRIVATE_KEY");
        
        vm.startBroadcast(ownerPrivateKey);
        P2PVaultBSC(vault).initiateBridgeRelayerChange(newRelayer);
        vm.stopBroadcast();
        
        console.log("BSC Relayer change initiated. Complete after 24 hours.");
    }
    
    function initiateDscRelayerChange(address vault, address newRelayer) external {
        uint256 ownerPrivateKey = vm.envUint("OWNER_PRIVATE_KEY");
        
        vm.startBroadcast(ownerPrivateKey);
        P2PVaultDSC(vault).initiateBridgeRelayerChange(newRelayer);
        vm.stopBroadcast();
        
        console.log("DSC Relayer change initiated. Complete after 24 hours.");
    }
}

