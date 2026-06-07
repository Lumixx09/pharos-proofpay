// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/InvoiceLogger.sol";

contract DeployInvoiceLogger is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        InvoiceLogger logger = new InvoiceLogger();

        vm.stopBroadcast();

        console.log("InvoiceLogger deployed at:", address(logger));
        console.log("Network Chain ID:", block.chainid);
        console.log("Deployer:", vm.addr(deployerKey));
    }
}
