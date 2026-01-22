// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/P2POrderbook.sol";

contract P2POrderbookTest is Test {
    P2POrderbook public orderbook;

    address public owner = address(1);
    address public maker = address(2);
    address public taker = address(3);
    address public sellToken = address(4);
    address public buyToken = address(5);

    bytes32 public constant HASH_LOCK = keccak256("test_secret");
    uint256 public constant SELL_AMOUNT = 1000e18;
    uint256 public constant BUY_AMOUNT = 500e18;
    uint256 public constant DST_CHAIN_ID = 84532; // Base Sepolia
    uint256 public constant MAKER_TIMELOCK = 24 hours;
    uint256 public constant TAKER_TIMELOCK = 12 hours;

    event OrderCreated(
        uint256 indexed orderId,
        address indexed maker,
        address sellToken,
        uint256 sellAmount,
        address buyToken,
        uint256 buyAmount,
        uint256 srcChainId,
        uint256 dstChainId,
        bytes32 hashLock,
        uint256 makerTimelock,
        uint256 takerTimelock
    );

    event OrderCancelled(uint256 indexed orderId, address indexed maker);

    function setUp() public {
        orderbook = new P2POrderbook(owner);
    }

    // =========================================================================
    // Create Order Tests
    // =========================================================================

    function test_CreateOrder() public {
        vm.prank(maker);

        vm.expectEmit(true, true, false, true);
        emit OrderCreated(
            0,
            maker,
            sellToken,
            SELL_AMOUNT,
            buyToken,
            BUY_AMOUNT,
            block.chainid,
            DST_CHAIN_ID,
            HASH_LOCK,
            MAKER_TIMELOCK,
            TAKER_TIMELOCK
        );

        uint256 orderId = orderbook.createOrder(
            sellToken,
            SELL_AMOUNT,
            buyToken,
            BUY_AMOUNT,
            DST_CHAIN_ID,
            HASH_LOCK,
            MAKER_TIMELOCK,
            TAKER_TIMELOCK
        );

        assertEq(orderId, 0);
        assertEq(orderbook.orderCount(), 1);

        IP2POrderbook.Order memory order = orderbook.getOrder(orderId);
        assertEq(order.maker, maker);
        assertEq(order.sellToken, sellToken);
        assertEq(order.sellAmount, SELL_AMOUNT);
        assertEq(order.buyToken, buyToken);
        assertEq(order.buyAmount, BUY_AMOUNT);
        assertEq(order.srcChainId, block.chainid);
        assertEq(order.dstChainId, DST_CHAIN_ID);
        assertEq(order.hashLock, HASH_LOCK);
        assertEq(order.makerTimelock, MAKER_TIMELOCK);
        assertEq(order.takerTimelock, TAKER_TIMELOCK);
        assertEq(order.cancelled, false);
    }

    function test_CreateMultipleOrders() public {
        vm.startPrank(maker);

        uint256 orderId1 = orderbook.createOrder(
            sellToken,
            SELL_AMOUNT,
            buyToken,
            BUY_AMOUNT,
            DST_CHAIN_ID,
            HASH_LOCK,
            MAKER_TIMELOCK,
            TAKER_TIMELOCK
        );

        bytes32 hashLock2 = keccak256("test_secret_2");
        uint256 orderId2 = orderbook.createOrder(
            sellToken,
            SELL_AMOUNT * 2,
            buyToken,
            BUY_AMOUNT * 2,
            DST_CHAIN_ID,
            hashLock2,
            MAKER_TIMELOCK,
            TAKER_TIMELOCK
        );

        vm.stopPrank();

        assertEq(orderId1, 0);
        assertEq(orderId2, 1);
        assertEq(orderbook.orderCount(), 2);
    }

    function test_RevertWhen_ZeroSellAmount() public {
        vm.prank(maker);

        vm.expectRevert(IP2POrderbook.InvalidAmount.selector);
        orderbook.createOrder(
            sellToken,
            0, // Invalid: zero amount
            buyToken,
            BUY_AMOUNT,
            DST_CHAIN_ID,
            HASH_LOCK,
            MAKER_TIMELOCK,
            TAKER_TIMELOCK
        );
    }

    function test_RevertWhen_ZeroBuyAmount() public {
        vm.prank(maker);

        vm.expectRevert(IP2POrderbook.InvalidAmount.selector);
        orderbook.createOrder(
            sellToken,
            SELL_AMOUNT,
            buyToken,
            0, // Invalid: zero amount
            DST_CHAIN_ID,
            HASH_LOCK,
            MAKER_TIMELOCK,
            TAKER_TIMELOCK
        );
    }

    function test_RevertWhen_ZeroHashLock() public {
        vm.prank(maker);

        vm.expectRevert(IP2POrderbook.InvalidHashLock.selector);
        orderbook.createOrder(
            sellToken,
            SELL_AMOUNT,
            buyToken,
            BUY_AMOUNT,
            DST_CHAIN_ID,
            bytes32(0), // Invalid: zero hash
            MAKER_TIMELOCK,
            TAKER_TIMELOCK
        );
    }

    function test_RevertWhen_MakerTimelockTooShort() public {
        vm.prank(maker);

        vm.expectRevert(IP2POrderbook.InvalidTimelock.selector);
        orderbook.createOrder(
            sellToken,
            SELL_AMOUNT,
            buyToken,
            BUY_AMOUNT,
            DST_CHAIN_ID,
            HASH_LOCK,
            30 minutes, // Invalid: too short
            15 minutes
        );
    }

    function test_RevertWhen_TakerTimelockTooShort() public {
        vm.prank(maker);

        vm.expectRevert(IP2POrderbook.InvalidTimelock.selector);
        orderbook.createOrder(
            sellToken,
            SELL_AMOUNT,
            buyToken,
            BUY_AMOUNT,
            DST_CHAIN_ID,
            HASH_LOCK,
            MAKER_TIMELOCK,
            30 minutes // Invalid: too short
        );
    }

    function test_RevertWhen_MakerTimelockNotGreaterThanTaker() public {
        vm.prank(maker);

        vm.expectRevert(IP2POrderbook.InvalidTimelock.selector);
        orderbook.createOrder(
            sellToken,
            SELL_AMOUNT,
            buyToken,
            BUY_AMOUNT,
            DST_CHAIN_ID,
            HASH_LOCK,
            12 hours, // Same as taker
            12 hours
        );
    }

    // =========================================================================
    // Cancel Order Tests
    // =========================================================================

    function test_CancelOrder() public {
        vm.prank(maker);
        uint256 orderId = orderbook.createOrder(
            sellToken,
            SELL_AMOUNT,
            buyToken,
            BUY_AMOUNT,
            DST_CHAIN_ID,
            HASH_LOCK,
            MAKER_TIMELOCK,
            TAKER_TIMELOCK
        );

        vm.prank(maker);
        vm.expectEmit(true, true, false, true);
        emit OrderCancelled(orderId, maker);
        orderbook.cancelOrder(orderId);

        IP2POrderbook.Order memory order = orderbook.getOrder(orderId);
        assertTrue(order.cancelled);
    }

    function test_RevertWhen_CancelNonExistentOrder() public {
        vm.prank(maker);
        vm.expectRevert(IP2POrderbook.OrderNotFound.selector);
        orderbook.cancelOrder(999);
    }

    function test_RevertWhen_CancelNotMaker() public {
        vm.prank(maker);
        uint256 orderId = orderbook.createOrder(
            sellToken,
            SELL_AMOUNT,
            buyToken,
            BUY_AMOUNT,
            DST_CHAIN_ID,
            HASH_LOCK,
            MAKER_TIMELOCK,
            TAKER_TIMELOCK
        );

        vm.prank(taker); // Not the maker
        vm.expectRevert(IP2POrderbook.NotOrderMaker.selector);
        orderbook.cancelOrder(orderId);
    }

    function test_RevertWhen_CancelAlreadyCancelled() public {
        vm.startPrank(maker);
        uint256 orderId = orderbook.createOrder(
            sellToken,
            SELL_AMOUNT,
            buyToken,
            BUY_AMOUNT,
            DST_CHAIN_ID,
            HASH_LOCK,
            MAKER_TIMELOCK,
            TAKER_TIMELOCK
        );

        orderbook.cancelOrder(orderId);

        vm.expectRevert(IP2POrderbook.OrderAlreadyCancelled.selector);
        orderbook.cancelOrder(orderId);
        vm.stopPrank();
    }

    // =========================================================================
    // Admin Tests
    // =========================================================================

    function test_Pause() public {
        vm.prank(owner);
        orderbook.pause();

        vm.prank(maker);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        orderbook.createOrder(
            sellToken,
            SELL_AMOUNT,
            buyToken,
            BUY_AMOUNT,
            DST_CHAIN_ID,
            HASH_LOCK,
            MAKER_TIMELOCK,
            TAKER_TIMELOCK
        );
    }

    function test_Unpause() public {
        vm.prank(owner);
        orderbook.pause();

        vm.prank(owner);
        orderbook.unpause();

        vm.prank(maker);
        uint256 orderId = orderbook.createOrder(
            sellToken,
            SELL_AMOUNT,
            buyToken,
            BUY_AMOUNT,
            DST_CHAIN_ID,
            HASH_LOCK,
            MAKER_TIMELOCK,
            TAKER_TIMELOCK
        );

        assertEq(orderId, 0);
    }

    function test_RevertWhen_PauseNotOwner() public {
        vm.prank(maker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, maker));
        orderbook.pause();
    }

    // =========================================================================
    // Fuzz Tests
    // =========================================================================

    function testFuzz_CreateOrder(
        uint256 sellAmount,
        uint256 buyAmount,
        uint256 makerTimelock,
        uint256 takerTimelock
    ) public {
        vm.assume(sellAmount > 0);
        vm.assume(buyAmount > 0);
        vm.assume(takerTimelock >= 1 hours && takerTimelock <= 30 days);
        vm.assume(makerTimelock > takerTimelock && makerTimelock <= 30 days);

        vm.prank(maker);
        uint256 orderId = orderbook.createOrder(
            sellToken,
            sellAmount,
            buyToken,
            buyAmount,
            DST_CHAIN_ID,
            HASH_LOCK,
            makerTimelock,
            takerTimelock
        );

        IP2POrderbook.Order memory order = orderbook.getOrder(orderId);
        assertEq(order.sellAmount, sellAmount);
        assertEq(order.buyAmount, buyAmount);
        assertEq(order.makerTimelock, makerTimelock);
        assertEq(order.takerTimelock, takerTimelock);
    }
}

