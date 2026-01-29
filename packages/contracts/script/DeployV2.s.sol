// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/P2PVaultBSCv2.sol";
import "../src/P2PVaultDSCv2.sol";

contract DeployV2BSC is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address usdtAddress = vm.envAddress("BSC_USDT_ADDRESS");
        address relayerAddress = vm.envAddress("RELAYER_ADDRESS");
        
        vm.startBroadcast(deployerPrivateKey);
        
        P2PVaultBSCv2 vault = new P2PVaultBSCv2(usdtAddress, relayerAddress);
        
        console.log("P2PVaultBSCv2 deployed at:", address(vault));
        console.log("USDT address:", usdtAddress);
        console.log("Relayer address:", relayerAddress);
        
        vm.stopBroadcast();
    }
}

contract DeployV2DSC is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address dep20UsdtAddress = vm.envAddress("DSC_USDT_ADDRESS");
        address relayerAddress = vm.envAddress("RELAYER_ADDRESS");
        
        vm.startBroadcast(deployerPrivateKey);
        
        P2PVaultDSCv2 vault = new P2PVaultDSCv2(dep20UsdtAddress, relayerAddress);
        
        console.log("P2PVaultDSCv2 deployed at:", address(vault));
        console.log("DEP20 USDT address:", dep20UsdtAddress);
        console.log("Relayer address:", relayerAddress);
        
        vm.stopBroadcast();
    }
}
