// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/P2PVaultBSC.sol";
import "../src/P2PVaultDSC.sol";

/**
 * @title DeployP2PVaultBSC
 * @notice Deploy P2P Vault on BSC Chain
 * 
 * Run with:
 * forge script script/DeployP2PVaults.s.sol:DeployP2PVaultBSC --rpc-url $BSC_RPC_URL --broadcast --verify
 */
contract DeployP2PVaultBSC is Script {
    function run() external {
        // Configuration
        address USDT_BSC = vm.envAddress("BSC_USDT_ADDRESS"); // BEP20 USDT
        address bridgeRelayer = vm.envAddress("BRIDGE_RELAYER_ADDRESS");
        
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        P2PVaultBSC vault = new P2PVaultBSC(USDT_BSC, bridgeRelayer);
        
        console.log("P2PVaultBSC deployed at:", address(vault));
        console.log("USDT Address:", USDT_BSC);
        console.log("Bridge Relayer:", bridgeRelayer);
        
        vm.stopBroadcast();
    }
}

/**
 * @title DeployP2PVaultDSC
 * @notice Deploy P2P Vault on DSC Chain
 * 
 * Run with:
 * forge script script/DeployP2PVaults.s.sol:DeployP2PVaultDSC --rpc-url $DSC_RPC_URL --broadcast --verify
 */
contract DeployP2PVaultDSC is Script {
    function run() external {
        // Configuration
        address DEP20_USDT = vm.envAddress("DSC_DEP20_USDT_ADDRESS"); // DEP20 USDT on DSC
        address bridgeRelayer = vm.envAddress("BRIDGE_RELAYER_ADDRESS");
        
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        P2PVaultDSC vault = new P2PVaultDSC(DEP20_USDT, bridgeRelayer);
        
        console.log("P2PVaultDSC deployed at:", address(vault));
        console.log("DEP20 USDT Address:", DEP20_USDT);
        console.log("Bridge Relayer:", bridgeRelayer);
        
        vm.stopBroadcast();
    }
}

