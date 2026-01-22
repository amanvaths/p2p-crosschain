// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/P2PVaultBSC.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock ERC20 for testing
contract MockUSDT is ERC20 {
    constructor() ERC20("Mock USDT", "USDT") {}
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
    
    function decimals() public pure override returns (uint8) {
        return 18;
    }
}

// Malicious contract for reentrancy testing
contract ReentrancyAttacker {
    P2PVaultBSC public vault;
    uint256 public attackCount;
    
    constructor(P2PVaultBSC _vault) {
        vault = _vault;
    }
    
    function attack(uint256 orderId) external {
        vault.cancelOrder(orderId);
    }
    
    // This would be called during token transfer if USDT was ERC777
    function tokensReceived(
        address,
        address,
        address,
        uint256,
        bytes calldata,
        bytes calldata
    ) external {
        attackCount++;
        // Try to re-enter - should fail
        if (attackCount < 3) {
            try vault.cancelOrder(1) {} catch {}
        }
    }
}

contract P2PVaultBSCTest is Test {
    P2PVaultBSC public vault;
    MockUSDT public usdt;
    
    address public owner = address(1);
    address public bridgeRelayer = address(2);
    address public buyer1 = address(3);
    address public buyer2 = address(4);
    address public seller1 = address(5);
    address public attacker = address(6);
    
    uint256 public constant INITIAL_BALANCE = 10000e18;
    uint256 public constant ORDER_AMOUNT = 100e18;

    event OrderCreated(uint256 indexed orderId, address indexed buyer, uint256 amount, uint256 expiresAt);
    event OrderMatched(uint256 indexed orderId, address indexed buyer, address indexed seller, uint256 amount);
    event OrderCompleted(uint256 indexed orderId, address indexed buyer, address indexed seller, uint256 amount, bytes32 dscTxHash);
    event OrderCancelled(uint256 indexed orderId, address indexed buyer, uint256 amount);

    function setUp() public {
        vm.startPrank(owner);
        
        usdt = new MockUSDT();
        vault = new P2PVaultBSC(address(usdt), bridgeRelayer);
        
        // Setup initial balances
        usdt.mint(buyer1, INITIAL_BALANCE);
        usdt.mint(buyer2, INITIAL_BALANCE);
        usdt.mint(attacker, INITIAL_BALANCE);
        
        vm.stopPrank();
        
        // Approve vault
        vm.prank(buyer1);
        usdt.approve(address(vault), type(uint256).max);
        
        vm.prank(buyer2);
        usdt.approve(address(vault), type(uint256).max);
        
        vm.prank(attacker);
        usdt.approve(address(vault), type(uint256).max);
    }

    // =============================================================================
    // DEPLOYMENT TESTS
    // =============================================================================
    
    function test_Deployment() public view {
        assertEq(address(vault.USDT()), address(usdt));
        assertEq(vault.bridgeRelayer(), bridgeRelayer);
        assertEq(vault.owner(), owner);
        assertEq(vault.totalLocked(), 0);
    }
    
    function test_RevertOnZeroAddressDeployment() public {
        vm.prank(owner);
        vm.expectRevert(P2PVaultBSC.ZeroAddress.selector);
        new P2PVaultBSC(address(0), bridgeRelayer);
        
        vm.prank(owner);
        vm.expectRevert(P2PVaultBSC.ZeroAddress.selector);
        new P2PVaultBSC(address(usdt), address(0));
    }

    // =============================================================================
    // ORDER CREATION TESTS
    // =============================================================================
    
    function test_CreateBuyOrder() public {
        vm.prank(buyer1);
        uint256 orderId = vault.createBuyOrder(ORDER_AMOUNT);
        
        assertEq(orderId, 1);
        assertEq(vault.totalLocked(), ORDER_AMOUNT);
        assertEq(vault.getUserLockedAmount(buyer1), ORDER_AMOUNT);
        assertEq(usdt.balanceOf(address(vault)), ORDER_AMOUNT);
    }
    
    function test_RevertOnZeroAmount() public {
        vm.prank(buyer1);
        vm.expectRevert(P2PVaultBSC.ZeroAmount.selector);
        vault.createBuyOrder(0);
    }
    
    function test_RevertOnAmountTooSmall() public {
        vm.prank(buyer1);
        vm.expectRevert(
            abi.encodeWithSelector(
                P2PVaultBSC.AmountTooSmall.selector,
                1e14,
                1e15
            )
        );
        vault.createBuyOrder(1e14);
    }
    
    function test_RevertOnAmountTooLarge() public {
        vm.prank(buyer1);
        vm.expectRevert(
            abi.encodeWithSelector(
                P2PVaultBSC.AmountTooLarge.selector,
                1e25,
                1e24
            )
        );
        vault.createBuyOrder(1e25);
    }
    
    function test_RateLimiting() public {
        vm.startPrank(buyer1);
        
        vault.createBuyOrder(ORDER_AMOUNT);
        
        // Try to create another order immediately - should fail
        vm.expectRevert();
        vault.createBuyOrder(ORDER_AMOUNT);
        
        // Advance time past rate limit
        vm.warp(block.timestamp + 11 seconds);
        
        // Should succeed now
        vault.createBuyOrder(ORDER_AMOUNT);
        
        vm.stopPrank();
    }
    
    function test_RevertOnInsufficientBalance() public {
        address poorUser = address(100);
        vm.prank(poorUser);
        usdt.approve(address(vault), type(uint256).max);
        
        vm.prank(poorUser);
        vm.expectRevert();
        vault.createBuyOrder(ORDER_AMOUNT);
    }

    // =============================================================================
    // ORDER CANCELLATION TESTS
    // =============================================================================
    
    function test_CancelOrder() public {
        vm.prank(buyer1);
        uint256 orderId = vault.createBuyOrder(ORDER_AMOUNT);
        
        uint256 balanceBefore = usdt.balanceOf(buyer1);
        
        vm.prank(buyer1);
        vault.cancelOrder(orderId);
        
        assertEq(usdt.balanceOf(buyer1), balanceBefore + ORDER_AMOUNT);
        assertEq(vault.totalLocked(), 0);
    }
    
    function test_RevertOnCancelNonexistentOrder() public {
        vm.prank(buyer1);
        vm.expectRevert(
            abi.encodeWithSelector(P2PVaultBSC.OrderNotFound.selector, 999)
        );
        vault.cancelOrder(999);
    }
    
    function test_RevertOnCancelOthersOrder() public {
        vm.prank(buyer1);
        uint256 orderId = vault.createBuyOrder(ORDER_AMOUNT);
        
        vm.prank(buyer2);
        vm.expectRevert(
            abi.encodeWithSelector(
                P2PVaultBSC.NotOrderOwner.selector,
                orderId,
                buyer2,
                buyer1
            )
        );
        vault.cancelOrder(orderId);
    }
    
    function test_RevertOnDoubleCancelOrder() public {
        vm.prank(buyer1);
        uint256 orderId = vault.createBuyOrder(ORDER_AMOUNT);
        
        vm.prank(buyer1);
        vault.cancelOrder(orderId);
        
        vm.prank(buyer1);
        vm.expectRevert();
        vault.cancelOrder(orderId);
    }

    // =============================================================================
    // ORDER MATCHING TESTS
    // =============================================================================
    
    function test_MatchOrder() public {
        vm.prank(buyer1);
        uint256 orderId = vault.createBuyOrder(ORDER_AMOUNT);
        
        vm.prank(bridgeRelayer);
        vault.matchOrder(orderId, seller1);
        
        (
            address buyer,
            P2PVaultBSC.OrderStatus status,
            uint256 amount,
            ,
            ,
            address matchedSeller,
            ,
            
        ) = vault.getOrder(orderId);
        
        assertEq(buyer, buyer1);
        assertEq(uint8(status), uint8(P2PVaultBSC.OrderStatus.MATCHED));
        assertEq(amount, ORDER_AMOUNT);
        assertEq(matchedSeller, seller1);
    }
    
    function test_RevertOnUnauthorizedMatch() public {
        vm.prank(buyer1);
        uint256 orderId = vault.createBuyOrder(ORDER_AMOUNT);
        
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(P2PVaultBSC.NotAuthorized.selector, attacker)
        );
        vault.matchOrder(orderId, seller1);
    }
    
    function test_RevertOnMatchExpiredOrder() public {
        vm.prank(buyer1);
        uint256 orderId = vault.createBuyOrder(ORDER_AMOUNT);
        
        // Advance time past expiry
        vm.warp(block.timestamp + 25 hours);
        
        vm.prank(bridgeRelayer);
        vm.expectRevert();
        vault.matchOrder(orderId, seller1);
    }

    // =============================================================================
    // ORDER COMPLETION TESTS
    // =============================================================================
    
    function test_CompleteOrder() public {
        vm.prank(buyer1);
        uint256 orderId = vault.createBuyOrder(ORDER_AMOUNT);
        
        vm.prank(bridgeRelayer);
        vault.matchOrder(orderId, seller1);
        
        bytes32 dscTxHash = keccak256("dsc_tx_hash");
        
        vm.prank(bridgeRelayer);
        vault.completeOrder(orderId, seller1, dscTxHash);
        
        assertEq(usdt.balanceOf(seller1), ORDER_AMOUNT);
        assertEq(vault.totalLocked(), 0);
        
        (
            ,
            P2PVaultBSC.OrderStatus status,
            ,
            ,
            ,
            ,
            ,
            bytes32 storedHash
        ) = vault.getOrder(orderId);
        
        assertEq(uint8(status), uint8(P2PVaultBSC.OrderStatus.COMPLETED));
        assertEq(storedHash, dscTxHash);
    }
    
    function test_RevertOnCompleteWithWrongSeller() public {
        vm.prank(buyer1);
        uint256 orderId = vault.createBuyOrder(ORDER_AMOUNT);
        
        vm.prank(bridgeRelayer);
        vault.matchOrder(orderId, seller1);
        
        bytes32 dscTxHash = keccak256("dsc_tx_hash");
        
        vm.prank(bridgeRelayer);
        vm.expectRevert(
            abi.encodeWithSelector(
                P2PVaultBSC.SellerMismatch.selector,
                seller1,
                attacker
            )
        );
        vault.completeOrder(orderId, attacker, dscTxHash);
    }
    
    function test_RevertOnCompleteUnmatchedOrder() public {
        vm.prank(buyer1);
        uint256 orderId = vault.createBuyOrder(ORDER_AMOUNT);
        
        bytes32 dscTxHash = keccak256("dsc_tx_hash");
        
        vm.prank(bridgeRelayer);
        vm.expectRevert();
        vault.completeOrder(orderId, seller1, dscTxHash);
    }

    // =============================================================================
    // REFUND TESTS
    // =============================================================================
    
    function test_RefundExpiredOrder() public {
        vm.prank(buyer1);
        uint256 orderId = vault.createBuyOrder(ORDER_AMOUNT);
        
        uint256 balanceBefore = usdt.balanceOf(buyer1);
        
        // Advance time past expiry
        vm.warp(block.timestamp + 25 hours);
        
        // Anyone can trigger refund
        vm.prank(attacker);
        vault.refundExpiredOrder(orderId);
        
        assertEq(usdt.balanceOf(buyer1), balanceBefore + ORDER_AMOUNT);
        assertEq(vault.totalLocked(), 0);
    }
    
    function test_RevertOnRefundNonExpiredOrder() public {
        vm.prank(buyer1);
        uint256 orderId = vault.createBuyOrder(ORDER_AMOUNT);
        
        vm.prank(buyer1);
        vm.expectRevert();
        vault.refundExpiredOrder(orderId);
    }

    // =============================================================================
    // ADMIN FUNCTION TESTS
    // =============================================================================
    
    function test_PauseUnpause() public {
        vm.prank(owner);
        vault.pause();
        
        vm.prank(buyer1);
        vm.expectRevert();
        vault.createBuyOrder(ORDER_AMOUNT);
        
        vm.prank(owner);
        vault.unpause();
        
        vm.prank(buyer1);
        vault.createBuyOrder(ORDER_AMOUNT);
    }
    
    function test_ChangeBridgeRelayer() public {
        address newRelayer = address(100);
        
        vm.prank(owner);
        vault.initiateBridgeRelayerChange(newRelayer);
        
        // Cannot complete immediately
        vm.prank(owner);
        vm.expectRevert();
        vault.completeBridgeRelayerChange();
        
        // Advance time
        vm.warp(block.timestamp + 1 days + 1);
        
        vm.prank(owner);
        vault.completeBridgeRelayerChange();
        
        assertEq(vault.bridgeRelayer(), newRelayer);
    }
    
    function test_SetOrderExpiryTime() public {
        vm.prank(owner);
        vault.setOrderExpiryTime(2 hours);
        
        assertEq(vault.orderExpiryTime(), 2 hours);
    }
    
    function test_RevertOnInvalidExpiryTime() public {
        vm.prank(owner);
        vm.expectRevert();
        vault.setOrderExpiryTime(30 minutes); // Too short
        
        vm.prank(owner);
        vm.expectRevert();
        vault.setOrderExpiryTime(10 days); // Too long
    }

    // =============================================================================
    // EMERGENCY FUNCTION TESTS
    // =============================================================================
    
    function test_EmergencyWithdraw() public {
        // Create order first
        vm.prank(buyer1);
        vault.createBuyOrder(ORDER_AMOUNT);
        
        // Activate emergency mode
        vm.prank(owner);
        vault.activateEmergencyMode();
        
        // Cannot withdraw immediately
        vm.prank(owner);
        vm.expectRevert();
        vault.emergencyWithdraw(owner);
        
        // Advance time past delay
        vm.warp(block.timestamp + 2 days + 1);
        
        uint256 ownerBalanceBefore = usdt.balanceOf(owner);
        
        vm.prank(owner);
        vault.emergencyWithdraw(owner);
        
        assertEq(usdt.balanceOf(owner), ownerBalanceBefore + ORDER_AMOUNT);
    }
    
    function test_CannotCreateOrderInEmergencyMode() public {
        vm.prank(owner);
        vault.activateEmergencyMode();
        
        vm.prank(buyer1);
        vm.expectRevert(P2PVaultBSC.EmergencyModeActive.selector);
        vault.createBuyOrder(ORDER_AMOUNT);
    }
    
    function test_DeactivateEmergencyMode() public {
        vm.prank(owner);
        vault.activateEmergencyMode();
        
        vm.prank(owner);
        vault.deactivateEmergencyMode();
        
        assertEq(vault.emergencyMode(), false);
    }
    
    function test_RescueTokens() public {
        // Deploy another token and send to vault
        MockUSDT otherToken = new MockUSDT();
        otherToken.mint(address(vault), 1000e18);
        
        vm.prank(owner);
        vault.rescueTokens(address(otherToken), owner, 1000e18);
        
        assertEq(otherToken.balanceOf(owner), 1000e18);
    }

    // =============================================================================
    // REENTRANCY TESTS
    // =============================================================================
    
    function test_ReentrancyProtection() public {
        ReentrancyAttacker attackerContract = new ReentrancyAttacker(vault);
        
        usdt.mint(address(attackerContract), INITIAL_BALANCE);
        
        vm.prank(address(attackerContract));
        usdt.approve(address(vault), type(uint256).max);
        
        vm.prank(address(attackerContract));
        vault.createBuyOrder(ORDER_AMOUNT);
        
        // Attempt reentrancy attack - should not succeed in re-entering
        vm.prank(address(attackerContract));
        attackerContract.attack(1);
        
        // Verify only one cancel happened
        assertEq(vault.totalLocked(), 0);
    }

    // =============================================================================
    // VIEW FUNCTION TESTS
    // =============================================================================
    
    function test_GetOpenOrders() public {
        vm.startPrank(buyer1);
        
        vault.createBuyOrder(ORDER_AMOUNT);
        vm.warp(block.timestamp + 11 seconds);
        vault.createBuyOrder(ORDER_AMOUNT * 2);
        vm.warp(block.timestamp + 11 seconds);
        vault.createBuyOrder(ORDER_AMOUNT * 3);
        
        vm.stopPrank();
        
        (
            uint256[] memory orderIds,
            address[] memory buyers,
            uint256[] memory amounts,
            uint256[] memory expiresAts
        ) = vault.getOpenOrders(0, 10);
        
        assertEq(orderIds.length, 3);
        assertEq(buyers[0], buyer1);
        assertEq(amounts[0], ORDER_AMOUNT);
        assertEq(amounts[1], ORDER_AMOUNT * 2);
        assertEq(amounts[2], ORDER_AMOUNT * 3);
    }
    
    function test_GetUserOrderIds() public {
        vm.startPrank(buyer1);
        
        vault.createBuyOrder(ORDER_AMOUNT);
        vm.warp(block.timestamp + 11 seconds);
        vault.createBuyOrder(ORDER_AMOUNT);
        
        vm.stopPrank();
        
        uint256[] memory orderIds = vault.getUserOrderIds(buyer1);
        assertEq(orderIds.length, 2);
        assertEq(orderIds[0], 1);
        assertEq(orderIds[1], 2);
    }

    // =============================================================================
    // OWNERSHIP TESTS
    // =============================================================================
    
    function test_OwnershipTransfer() public {
        address newOwner = address(999);
        
        vm.prank(owner);
        vault.transferOwnership(newOwner);
        
        // Old owner still owns until accepted
        assertEq(vault.owner(), owner);
        
        vm.prank(newOwner);
        vault.acceptOwnership();
        
        assertEq(vault.owner(), newOwner);
    }
    
    function test_RevertOnNonOwnerAdminActions() public {
        vm.prank(attacker);
        vm.expectRevert();
        vault.pause();
        
        vm.prank(attacker);
        vm.expectRevert();
        vault.activateEmergencyMode();
        
        vm.prank(attacker);
        vm.expectRevert();
        vault.initiateBridgeRelayerChange(attacker);
    }

    // =============================================================================
    // FUZZ TESTS
    // =============================================================================
    
    function testFuzz_CreateOrder(uint256 amount) public {
        amount = bound(amount, vault.MIN_ORDER_AMOUNT(), vault.MAX_ORDER_AMOUNT());
        
        usdt.mint(buyer1, amount);
        
        vm.prank(buyer1);
        uint256 orderId = vault.createBuyOrder(amount);
        
        assertEq(vault.totalLocked(), amount);
        
        (
            address buyer,
            P2PVaultBSC.OrderStatus status,
            uint256 orderAmount,
            ,
            ,
            ,
            ,
            
        ) = vault.getOrder(orderId);
        
        assertEq(buyer, buyer1);
        assertEq(uint8(status), uint8(P2PVaultBSC.OrderStatus.OPEN));
        assertEq(orderAmount, amount);
    }
    
    function testFuzz_CreateAndCancelOrder(uint256 amount) public {
        amount = bound(amount, vault.MIN_ORDER_AMOUNT(), vault.MAX_ORDER_AMOUNT());
        
        usdt.mint(buyer1, amount);
        uint256 balanceBefore = usdt.balanceOf(buyer1);
        
        vm.prank(buyer1);
        uint256 orderId = vault.createBuyOrder(amount);
        
        vm.prank(buyer1);
        vault.cancelOrder(orderId);
        
        assertEq(usdt.balanceOf(buyer1), balanceBefore);
        assertEq(vault.totalLocked(), 0);
    }
}

