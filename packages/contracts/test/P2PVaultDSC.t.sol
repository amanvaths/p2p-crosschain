// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/P2PVaultDSC.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock ERC20 for testing
contract MockDEP20 is ERC20 {
    constructor() ERC20("Mock DEP20 USDT", "DEP20") {}
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
    
    function decimals() public pure override returns (uint8) {
        return 18;
    }
}

// Malicious contract for reentrancy testing
contract DSCReentrancyAttacker {
    P2PVaultDSC public vault;
    uint256 public attackCount;
    
    constructor(P2PVaultDSC _vault) {
        vault = _vault;
    }
    
    function attack(uint256 orderId) external {
        vault.cancelSellOrder(orderId);
    }
    
    function tokensReceived(
        address,
        address,
        address,
        uint256,
        bytes calldata,
        bytes calldata
    ) external {
        attackCount++;
        if (attackCount < 3) {
            try vault.cancelSellOrder(1) {} catch {}
        }
    }
}

contract P2PVaultDSCTest is Test {
    P2PVaultDSC public vault;
    MockDEP20 public dep20;
    
    address public owner = address(1);
    address public bridgeRelayer = address(2);
    address public seller1 = address(3);
    address public seller2 = address(4);
    address public buyer1 = address(5);
    address public attacker = address(6);
    
    uint256 public constant INITIAL_BALANCE = 10000e18;
    uint256 public constant ORDER_AMOUNT = 100e18;

    event SellOrderCreated(uint256 indexed orderId, address indexed seller, uint256 amount, uint256 expiresAt);
    event DirectFillCreated(uint256 indexed dscOrderId, uint256 indexed bscOrderId, address indexed seller, address buyer, uint256 amount);
    event OrderMatched(uint256 indexed dscOrderId, uint256 indexed bscOrderId, address indexed seller, address buyer, uint256 amount);
    event OrderCompleted(uint256 indexed dscOrderId, uint256 indexed bscOrderId, address seller, address indexed buyer, uint256 amount, bytes32 bscTxHash);
    event OrderCancelled(uint256 indexed orderId, address indexed seller, uint256 amount);

    function setUp() public {
        vm.startPrank(owner);
        
        dep20 = new MockDEP20();
        vault = new P2PVaultDSC(address(dep20), bridgeRelayer);
        
        // Setup initial balances
        dep20.mint(seller1, INITIAL_BALANCE);
        dep20.mint(seller2, INITIAL_BALANCE);
        dep20.mint(attacker, INITIAL_BALANCE);
        
        vm.stopPrank();
        
        // Approve vault
        vm.prank(seller1);
        dep20.approve(address(vault), type(uint256).max);
        
        vm.prank(seller2);
        dep20.approve(address(vault), type(uint256).max);
        
        vm.prank(attacker);
        dep20.approve(address(vault), type(uint256).max);
    }

    // =============================================================================
    // DEPLOYMENT TESTS
    // =============================================================================
    
    function test_Deployment() public view {
        assertEq(address(vault.DEP20_USDT()), address(dep20));
        assertEq(vault.bridgeRelayer(), bridgeRelayer);
        assertEq(vault.owner(), owner);
        assertEq(vault.totalLocked(), 0);
    }
    
    function test_RevertOnZeroAddressDeployment() public {
        vm.prank(owner);
        vm.expectRevert(P2PVaultDSC.ZeroAddress.selector);
        new P2PVaultDSC(address(0), bridgeRelayer);
        
        vm.prank(owner);
        vm.expectRevert(P2PVaultDSC.ZeroAddress.selector);
        new P2PVaultDSC(address(dep20), address(0));
    }

    // =============================================================================
    // SELL ORDER CREATION TESTS
    // =============================================================================
    
    function test_CreateSellOrder() public {
        vm.prank(seller1);
        uint256 orderId = vault.createSellOrder(ORDER_AMOUNT);
        
        assertEq(orderId, 1);
        assertEq(vault.totalLocked(), ORDER_AMOUNT);
        assertEq(vault.getUserLockedAmount(seller1), ORDER_AMOUNT);
        assertEq(dep20.balanceOf(address(vault)), ORDER_AMOUNT);
    }
    
    function test_RevertOnZeroAmount() public {
        vm.prank(seller1);
        vm.expectRevert(P2PVaultDSC.ZeroAmount.selector);
        vault.createSellOrder(0);
    }
    
    function test_RevertOnAmountTooSmall() public {
        vm.prank(seller1);
        vm.expectRevert(
            abi.encodeWithSelector(
                P2PVaultDSC.AmountTooSmall.selector,
                1e14,
                1e15
            )
        );
        vault.createSellOrder(1e14);
    }
    
    function test_RevertOnAmountTooLarge() public {
        vm.prank(seller1);
        vm.expectRevert(
            abi.encodeWithSelector(
                P2PVaultDSC.AmountTooLarge.selector,
                1e25,
                1e24
            )
        );
        vault.createSellOrder(1e25);
    }
    
    function test_RateLimiting() public {
        vm.startPrank(seller1);
        
        vault.createSellOrder(ORDER_AMOUNT);
        
        // Try to create another order immediately - should fail
        vm.expectRevert();
        vault.createSellOrder(ORDER_AMOUNT);
        
        // Advance time past rate limit
        vm.warp(block.timestamp + 11 seconds);
        
        // Should succeed now
        vault.createSellOrder(ORDER_AMOUNT);
        
        vm.stopPrank();
    }

    // =============================================================================
    // DIRECT FILL TESTS
    // =============================================================================
    
    function test_FillBscBuyOrder() public {
        uint256 bscOrderId = 123;
        
        vm.prank(seller1);
        uint256 dscOrderId = vault.fillBscBuyOrder(bscOrderId, buyer1, ORDER_AMOUNT);
        
        assertEq(dscOrderId, 1);
        assertEq(vault.totalLocked(), ORDER_AMOUNT);
        assertTrue(vault.isBscOrderMatched(bscOrderId));
        assertEq(vault.getDscOrderForBscOrder(bscOrderId), dscOrderId);
        
        (
            address seller,
            P2PVaultDSC.OrderStatus status,
            P2PVaultDSC.OrderType orderType,
            uint256 amount,
            ,
            ,
            address matchedBuyer,
            uint256 matchedBscOrderId,
            ,
            
        ) = vault.getOrder(dscOrderId);
        
        assertEq(seller, seller1);
        assertEq(uint8(status), uint8(P2PVaultDSC.OrderStatus.MATCHED));
        assertEq(uint8(orderType), uint8(P2PVaultDSC.OrderType.DIRECT_FILL));
        assertEq(amount, ORDER_AMOUNT);
        assertEq(matchedBuyer, buyer1);
        assertEq(matchedBscOrderId, bscOrderId);
    }
    
    function test_RevertOnDoubleFillBscOrder() public {
        uint256 bscOrderId = 123;
        
        vm.prank(seller1);
        vault.fillBscBuyOrder(bscOrderId, buyer1, ORDER_AMOUNT);
        
        // Try to fill same BSC order again
        vm.prank(seller2);
        vm.expectRevert(
            abi.encodeWithSelector(P2PVaultDSC.BscOrderAlreadyMatched.selector, bscOrderId)
        );
        vault.fillBscBuyOrder(bscOrderId, buyer1, ORDER_AMOUNT);
    }
    
    function test_RevertOnInvalidBscOrderId() public {
        vm.prank(seller1);
        vm.expectRevert(P2PVaultDSC.InvalidBscOrderId.selector);
        vault.fillBscBuyOrder(0, buyer1, ORDER_AMOUNT);
    }

    // =============================================================================
    // ORDER CANCELLATION TESTS
    // =============================================================================
    
    function test_CancelSellOrder() public {
        vm.prank(seller1);
        uint256 orderId = vault.createSellOrder(ORDER_AMOUNT);
        
        uint256 balanceBefore = dep20.balanceOf(seller1);
        
        vm.prank(seller1);
        vault.cancelSellOrder(orderId);
        
        assertEq(dep20.balanceOf(seller1), balanceBefore + ORDER_AMOUNT);
        assertEq(vault.totalLocked(), 0);
    }
    
    function test_RevertOnCancelNonexistentOrder() public {
        vm.prank(seller1);
        vm.expectRevert(
            abi.encodeWithSelector(P2PVaultDSC.OrderNotFound.selector, 999)
        );
        vault.cancelSellOrder(999);
    }
    
    function test_RevertOnCancelOthersOrder() public {
        vm.prank(seller1);
        uint256 orderId = vault.createSellOrder(ORDER_AMOUNT);
        
        vm.prank(seller2);
        vm.expectRevert(
            abi.encodeWithSelector(
                P2PVaultDSC.NotOrderOwner.selector,
                orderId,
                seller2,
                seller1
            )
        );
        vault.cancelSellOrder(orderId);
    }
    
    function test_RevertOnCancelMatchedOrder() public {
        vm.prank(seller1);
        uint256 orderId = vault.createSellOrder(ORDER_AMOUNT);
        
        vm.prank(bridgeRelayer);
        vault.matchSellOrder(orderId, 1, buyer1);
        
        vm.prank(seller1);
        vm.expectRevert();
        vault.cancelSellOrder(orderId);
    }

    // =============================================================================
    // ORDER MATCHING TESTS
    // =============================================================================
    
    function test_MatchSellOrder() public {
        vm.prank(seller1);
        uint256 dscOrderId = vault.createSellOrder(ORDER_AMOUNT);
        
        uint256 bscOrderId = 123;
        
        vm.prank(bridgeRelayer);
        vault.matchSellOrder(dscOrderId, bscOrderId, buyer1);
        
        (
            ,
            P2PVaultDSC.OrderStatus status,
            ,
            ,
            ,
            ,
            address matchedBuyer,
            uint256 matchedBscOrderId,
            ,
            
        ) = vault.getOrder(dscOrderId);
        
        assertEq(uint8(status), uint8(P2PVaultDSC.OrderStatus.MATCHED));
        assertEq(matchedBuyer, buyer1);
        assertEq(matchedBscOrderId, bscOrderId);
        assertTrue(vault.isBscOrderMatched(bscOrderId));
    }
    
    function test_RevertOnUnauthorizedMatch() public {
        vm.prank(seller1);
        uint256 orderId = vault.createSellOrder(ORDER_AMOUNT);
        
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(P2PVaultDSC.NotAuthorized.selector, attacker)
        );
        vault.matchSellOrder(orderId, 1, buyer1);
    }
    
    function test_RevertOnMatchExpiredOrder() public {
        vm.prank(seller1);
        uint256 orderId = vault.createSellOrder(ORDER_AMOUNT);
        
        // Advance time past expiry
        vm.warp(block.timestamp + 25 hours);
        
        vm.prank(bridgeRelayer);
        vm.expectRevert();
        vault.matchSellOrder(orderId, 1, buyer1);
    }

    // =============================================================================
    // ORDER COMPLETION TESTS
    // =============================================================================
    
    function test_CompleteOrder() public {
        vm.prank(seller1);
        uint256 dscOrderId = vault.createSellOrder(ORDER_AMOUNT);
        
        uint256 bscOrderId = 123;
        
        vm.prank(bridgeRelayer);
        vault.matchSellOrder(dscOrderId, bscOrderId, buyer1);
        
        bytes32 bscTxHash = keccak256("bsc_tx_hash");
        
        vm.prank(bridgeRelayer);
        vault.completeOrder(dscOrderId, buyer1, bscTxHash);
        
        assertEq(dep20.balanceOf(buyer1), ORDER_AMOUNT);
        assertEq(vault.totalLocked(), 0);
        
        (
            ,
            P2PVaultDSC.OrderStatus status,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            bytes32 storedHash
        ) = vault.getOrder(dscOrderId);
        
        assertEq(uint8(status), uint8(P2PVaultDSC.OrderStatus.COMPLETED));
        assertEq(storedHash, bscTxHash);
    }
    
    function test_CompleteDirectFillOrder() public {
        uint256 bscOrderId = 123;
        
        vm.prank(seller1);
        uint256 dscOrderId = vault.fillBscBuyOrder(bscOrderId, buyer1, ORDER_AMOUNT);
        
        bytes32 bscTxHash = keccak256("bsc_tx_hash");
        
        vm.prank(bridgeRelayer);
        vault.completeOrder(dscOrderId, buyer1, bscTxHash);
        
        assertEq(dep20.balanceOf(buyer1), ORDER_AMOUNT);
    }
    
    function test_RevertOnCompleteWithWrongBuyer() public {
        vm.prank(seller1);
        uint256 dscOrderId = vault.createSellOrder(ORDER_AMOUNT);
        
        vm.prank(bridgeRelayer);
        vault.matchSellOrder(dscOrderId, 123, buyer1);
        
        bytes32 bscTxHash = keccak256("bsc_tx_hash");
        
        vm.prank(bridgeRelayer);
        vm.expectRevert(
            abi.encodeWithSelector(
                P2PVaultDSC.BuyerMismatch.selector,
                buyer1,
                attacker
            )
        );
        vault.completeOrder(dscOrderId, attacker, bscTxHash);
    }

    // =============================================================================
    // REFUND TESTS
    // =============================================================================
    
    function test_RefundExpiredSellOrder() public {
        vm.prank(seller1);
        uint256 orderId = vault.createSellOrder(ORDER_AMOUNT);
        
        uint256 balanceBefore = dep20.balanceOf(seller1);
        
        // Advance time past expiry
        vm.warp(block.timestamp + 25 hours);
        
        // Anyone can trigger refund
        vm.prank(attacker);
        vault.refundExpiredOrder(orderId);
        
        assertEq(dep20.balanceOf(seller1), balanceBefore + ORDER_AMOUNT);
        assertEq(vault.totalLocked(), 0);
    }
    
    function test_RefundExpiredDirectFill() public {
        uint256 bscOrderId = 123;
        
        vm.prank(seller1);
        uint256 dscOrderId = vault.fillBscBuyOrder(bscOrderId, buyer1, ORDER_AMOUNT);
        
        uint256 balanceBefore = dep20.balanceOf(seller1);
        
        // Advance time past direct fill expiry (1 hour)
        vm.warp(block.timestamp + 2 hours);
        
        vault.refundExpiredOrder(dscOrderId);
        
        assertEq(dep20.balanceOf(seller1), balanceBefore + ORDER_AMOUNT);
        
        // BSC order should be unmarked
        assertFalse(vault.isBscOrderMatched(bscOrderId));
    }
    
    function test_RevertOnRefundNonExpiredOrder() public {
        vm.prank(seller1);
        uint256 orderId = vault.createSellOrder(ORDER_AMOUNT);
        
        vm.prank(seller1);
        vm.expectRevert();
        vault.refundExpiredOrder(orderId);
    }

    // =============================================================================
    // REVERT MATCHED ORDER TESTS
    // =============================================================================
    
    function test_RevertMatchedSellOrder() public {
        vm.prank(seller1);
        uint256 dscOrderId = vault.createSellOrder(ORDER_AMOUNT);
        
        uint256 bscOrderId = 123;
        
        vm.prank(bridgeRelayer);
        vault.matchSellOrder(dscOrderId, bscOrderId, buyer1);
        
        vm.prank(bridgeRelayer);
        vault.revertMatchedOrder(dscOrderId);
        
        (
            ,
            P2PVaultDSC.OrderStatus status,
            ,
            ,
            ,
            ,
            address matchedBuyer,
            uint256 matchedBscOrderId,
            ,
            
        ) = vault.getOrder(dscOrderId);
        
        assertEq(uint8(status), uint8(P2PVaultDSC.OrderStatus.OPEN));
        assertEq(matchedBuyer, address(0));
        assertEq(matchedBscOrderId, 0);
        assertFalse(vault.isBscOrderMatched(bscOrderId));
    }
    
    function test_RevertMatchedDirectFill() public {
        uint256 bscOrderId = 123;
        
        vm.prank(seller1);
        uint256 dscOrderId = vault.fillBscBuyOrder(bscOrderId, buyer1, ORDER_AMOUNT);
        
        vm.prank(bridgeRelayer);
        vault.revertMatchedOrder(dscOrderId);
        
        // Direct fills cannot be reverted to OPEN, they get expired
        (
            ,
            ,
            ,
            ,
            ,
            uint256 expiresAt,
            ,
            ,
            ,
            
        ) = vault.getOrder(dscOrderId);
        
        assertEq(expiresAt, block.timestamp);
        assertFalse(vault.isBscOrderMatched(bscOrderId));
    }

    // =============================================================================
    // ADMIN FUNCTION TESTS
    // =============================================================================
    
    function test_PauseUnpause() public {
        vm.prank(owner);
        vault.pause();
        
        vm.prank(seller1);
        vm.expectRevert();
        vault.createSellOrder(ORDER_AMOUNT);
        
        vm.prank(owner);
        vault.unpause();
        
        vm.prank(seller1);
        vault.createSellOrder(ORDER_AMOUNT);
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

    // =============================================================================
    // EMERGENCY FUNCTION TESTS
    // =============================================================================
    
    function test_EmergencyWithdraw() public {
        // Create order first
        vm.prank(seller1);
        vault.createSellOrder(ORDER_AMOUNT);
        
        // Activate emergency mode
        vm.prank(owner);
        vault.activateEmergencyMode();
        
        // Cannot withdraw immediately
        vm.prank(owner);
        vm.expectRevert();
        vault.emergencyWithdraw(owner);
        
        // Advance time past delay
        vm.warp(block.timestamp + 2 days + 1);
        
        uint256 ownerBalanceBefore = dep20.balanceOf(owner);
        
        vm.prank(owner);
        vault.emergencyWithdraw(owner);
        
        assertEq(dep20.balanceOf(owner), ownerBalanceBefore + ORDER_AMOUNT);
    }
    
    function test_CannotCreateOrderInEmergencyMode() public {
        vm.prank(owner);
        vault.activateEmergencyMode();
        
        vm.prank(seller1);
        vm.expectRevert(P2PVaultDSC.EmergencyModeActive.selector);
        vault.createSellOrder(ORDER_AMOUNT);
    }
    
    function test_RescueTokens() public {
        // Deploy another token and send to vault
        MockDEP20 otherToken = new MockDEP20();
        otherToken.mint(address(vault), 1000e18);
        
        vm.prank(owner);
        vault.rescueTokens(address(otherToken), owner, 1000e18);
        
        assertEq(otherToken.balanceOf(owner), 1000e18);
    }

    // =============================================================================
    // REENTRANCY TESTS
    // =============================================================================
    
    function test_ReentrancyProtection() public {
        DSCReentrancyAttacker attackerContract = new DSCReentrancyAttacker(vault);
        
        dep20.mint(address(attackerContract), INITIAL_BALANCE);
        
        vm.prank(address(attackerContract));
        dep20.approve(address(vault), type(uint256).max);
        
        vm.prank(address(attackerContract));
        vault.createSellOrder(ORDER_AMOUNT);
        
        // Attempt reentrancy attack
        vm.prank(address(attackerContract));
        attackerContract.attack(1);
        
        // Verify only one cancel happened
        assertEq(vault.totalLocked(), 0);
    }

    // =============================================================================
    // VIEW FUNCTION TESTS
    // =============================================================================
    
    function test_GetOpenSellOrders() public {
        vm.startPrank(seller1);
        
        vault.createSellOrder(ORDER_AMOUNT);
        vm.warp(block.timestamp + 11 seconds);
        vault.createSellOrder(ORDER_AMOUNT * 2);
        vm.warp(block.timestamp + 11 seconds);
        vault.createSellOrder(ORDER_AMOUNT * 3);
        
        vm.stopPrank();
        
        (
            uint256[] memory orderIds,
            address[] memory sellers,
            uint256[] memory amounts,
            uint256[] memory expiresAts
        ) = vault.getOpenSellOrders(0, 10);
        
        assertEq(orderIds.length, 3);
        assertEq(sellers[0], seller1);
        assertEq(amounts[0], ORDER_AMOUNT);
        assertEq(amounts[1], ORDER_AMOUNT * 2);
        assertEq(amounts[2], ORDER_AMOUNT * 3);
    }
    
    function test_GetUserOrderIds() public {
        vm.startPrank(seller1);
        
        vault.createSellOrder(ORDER_AMOUNT);
        vm.warp(block.timestamp + 11 seconds);
        vault.createSellOrder(ORDER_AMOUNT);
        
        vm.stopPrank();
        
        uint256[] memory orderIds = vault.getUserOrderIds(seller1);
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
    
    function testFuzz_CreateSellOrder(uint256 amount) public {
        amount = bound(amount, vault.MIN_ORDER_AMOUNT(), vault.MAX_ORDER_AMOUNT());
        
        dep20.mint(seller1, amount);
        
        vm.prank(seller1);
        uint256 orderId = vault.createSellOrder(amount);
        
        assertEq(vault.totalLocked(), amount);
        
        (
            address seller,
            P2PVaultDSC.OrderStatus status,
            ,
            uint256 orderAmount,
            ,
            ,
            ,
            ,
            ,
            
        ) = vault.getOrder(orderId);
        
        assertEq(seller, seller1);
        assertEq(uint8(status), uint8(P2PVaultDSC.OrderStatus.OPEN));
        assertEq(orderAmount, amount);
    }
    
    function testFuzz_CreateAndCancelSellOrder(uint256 amount) public {
        amount = bound(amount, vault.MIN_ORDER_AMOUNT(), vault.MAX_ORDER_AMOUNT());
        
        dep20.mint(seller1, amount);
        uint256 balanceBefore = dep20.balanceOf(seller1);
        
        vm.prank(seller1);
        uint256 orderId = vault.createSellOrder(amount);
        
        vm.prank(seller1);
        vault.cancelSellOrder(orderId);
        
        assertEq(dep20.balanceOf(seller1), balanceBefore);
        assertEq(vault.totalLocked(), 0);
    }
    
    function testFuzz_DirectFillAndComplete(uint256 amount, uint256 bscOrderId) public {
        amount = bound(amount, vault.MIN_ORDER_AMOUNT(), vault.MAX_ORDER_AMOUNT());
        bscOrderId = bound(bscOrderId, 1, type(uint256).max);
        
        dep20.mint(seller1, amount);
        
        vm.prank(seller1);
        uint256 dscOrderId = vault.fillBscBuyOrder(bscOrderId, buyer1, amount);
        
        bytes32 bscTxHash = keccak256(abi.encodePacked(bscOrderId));
        
        vm.prank(bridgeRelayer);
        vault.completeOrder(dscOrderId, buyer1, bscTxHash);
        
        assertEq(dep20.balanceOf(buyer1), amount);
        assertEq(vault.totalLocked(), 0);
    }
}

