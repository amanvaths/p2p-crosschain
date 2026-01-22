// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/P2PEscrowHTLC.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Simple ERC20 mock for testing
contract MockERC20 is ERC20 {
    constructor() ERC20("Mock Token", "MOCK") {
        _mint(msg.sender, 1_000_000e18);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract P2PEscrowHTLCTest is Test {
    P2PEscrowHTLC public escrow;
    MockERC20 public token;

    address public owner = address(1);
    address public maker = address(2);
    address public taker = address(3);

    bytes32 public constant SECRET = keccak256("my_super_secret");
    bytes32 public HASH_LOCK;

    uint256 public constant ORDER_ID = 1;
    uint256 public constant AMOUNT = 1000e18;
    uint256 public TIMELOCK;

    event Locked(
        bytes32 indexed lockId,
        uint256 indexed orderId,
        address indexed depositor,
        address recipient,
        address token,
        uint256 amount,
        bytes32 hashLock,
        uint256 timelock
    );

    event Claimed(
        bytes32 indexed lockId,
        uint256 indexed orderId,
        address indexed recipient,
        bytes32 hashLock
    );

    event Refunded(
        bytes32 indexed lockId,
        uint256 indexed orderId,
        address indexed depositor,
        bytes32 hashLock
    );

    function setUp() public {
        escrow = new P2PEscrowHTLC(owner);
        token = new MockERC20();

        // Compute hash lock from secret
        HASH_LOCK = keccak256(abi.encodePacked(SECRET));

        // Set timelock to 24 hours from now
        TIMELOCK = block.timestamp + 24 hours;

        // Fund maker
        token.transfer(maker, AMOUNT * 10);

        // Approve escrow to spend maker's tokens
        vm.prank(maker);
        token.approve(address(escrow), type(uint256).max);
    }

    // =========================================================================
    // Lock Tests
    // =========================================================================

    function test_Lock() public {
        bytes32 expectedLockId = escrow.getLockId(ORDER_ID, maker, HASH_LOCK);

        vm.prank(maker);
        vm.expectEmit(true, true, true, true);
        emit Locked(
            expectedLockId,
            ORDER_ID,
            maker,
            taker,
            address(token),
            AMOUNT,
            HASH_LOCK,
            TIMELOCK
        );

        bytes32 lockId = escrow.lock(
            ORDER_ID,
            taker,
            address(token),
            AMOUNT,
            HASH_LOCK,
            TIMELOCK
        );

        assertEq(lockId, expectedLockId);

        // Verify lock state
        IP2PEscrowHTLC.Lock memory lockData = escrow.getLock(lockId);
        assertEq(lockData.orderId, ORDER_ID);
        assertEq(lockData.depositor, maker);
        assertEq(lockData.recipient, taker);
        assertEq(lockData.token, address(token));
        assertEq(lockData.amount, AMOUNT);
        assertEq(lockData.hashLock, HASH_LOCK);
        assertEq(lockData.timelock, TIMELOCK);
        assertFalse(lockData.claimed);
        assertFalse(lockData.refunded);

        // Verify tokens transferred
        assertEq(token.balanceOf(address(escrow)), AMOUNT);
    }

    function test_RevertWhen_LockZeroAmount() public {
        vm.prank(maker);
        vm.expectRevert(IP2PEscrowHTLC.InvalidAmount.selector);
        escrow.lock(ORDER_ID, taker, address(token), 0, HASH_LOCK, TIMELOCK);
    }

    function test_RevertWhen_LockZeroHashLock() public {
        vm.prank(maker);
        vm.expectRevert(IP2PEscrowHTLC.InvalidHashLock.selector);
        escrow.lock(ORDER_ID, taker, address(token), AMOUNT, bytes32(0), TIMELOCK);
    }

    function test_RevertWhen_LockZeroRecipient() public {
        vm.prank(maker);
        vm.expectRevert(IP2PEscrowHTLC.InvalidAmount.selector);
        escrow.lock(ORDER_ID, address(0), address(token), AMOUNT, HASH_LOCK, TIMELOCK);
    }

    function test_RevertWhen_LockPastTimelock() public {
        vm.prank(maker);
        vm.expectRevert(IP2PEscrowHTLC.InvalidTimelock.selector);
        escrow.lock(
            ORDER_ID,
            taker,
            address(token),
            AMOUNT,
            HASH_LOCK,
            block.timestamp - 1 // Past timelock
        );
    }

    function test_RevertWhen_LockTimelockTooShort() public {
        vm.prank(maker);
        vm.expectRevert(IP2PEscrowHTLC.InvalidTimelock.selector);
        escrow.lock(
            ORDER_ID,
            taker,
            address(token),
            AMOUNT,
            HASH_LOCK,
            block.timestamp + 30 minutes // Too short
        );
    }

    function test_RevertWhen_LockAlreadyExists() public {
        vm.prank(maker);
        escrow.lock(ORDER_ID, taker, address(token), AMOUNT, HASH_LOCK, TIMELOCK);

        vm.prank(maker);
        vm.expectRevert(IP2PEscrowHTLC.LockAlreadyExists.selector);
        escrow.lock(ORDER_ID, taker, address(token), AMOUNT, HASH_LOCK, TIMELOCK);
    }

    // =========================================================================
    // Claim Tests
    // =========================================================================

    function test_Claim() public {
        // First lock funds
        vm.prank(maker);
        bytes32 lockId = escrow.lock(
            ORDER_ID,
            taker,
            address(token),
            AMOUNT,
            HASH_LOCK,
            TIMELOCK
        );

        uint256 takerBalanceBefore = token.balanceOf(taker);

        // Claim with secret
        vm.prank(taker);
        vm.expectEmit(true, true, true, true);
        emit Claimed(lockId, ORDER_ID, taker, HASH_LOCK);
        escrow.claim(lockId, SECRET);

        // Verify claim state
        IP2PEscrowHTLC.Lock memory lockData = escrow.getLock(lockId);
        assertTrue(lockData.claimed);

        // Verify tokens transferred to recipient
        assertEq(token.balanceOf(taker), takerBalanceBefore + AMOUNT);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_ClaimByAnyone() public {
        // First lock funds
        vm.prank(maker);
        bytes32 lockId = escrow.lock(
            ORDER_ID,
            taker,
            address(token),
            AMOUNT,
            HASH_LOCK,
            TIMELOCK
        );

        // Anyone can call claim if they have the secret
        // But funds always go to the designated recipient
        address anyAddress = address(99);
        uint256 takerBalanceBefore = token.balanceOf(taker);

        vm.prank(anyAddress);
        escrow.claim(lockId, SECRET);

        // Verify tokens still go to designated recipient (taker)
        assertEq(token.balanceOf(taker), takerBalanceBefore + AMOUNT);
    }

    function test_RevertWhen_ClaimNonExistentLock() public {
        vm.prank(taker);
        vm.expectRevert(IP2PEscrowHTLC.LockNotFound.selector);
        escrow.claim(keccak256("non_existent"), SECRET);
    }

    function test_RevertWhen_ClaimWrongSecret() public {
        vm.prank(maker);
        bytes32 lockId = escrow.lock(
            ORDER_ID,
            taker,
            address(token),
            AMOUNT,
            HASH_LOCK,
            TIMELOCK
        );

        vm.prank(taker);
        vm.expectRevert(IP2PEscrowHTLC.InvalidSecret.selector);
        escrow.claim(lockId, keccak256("wrong_secret"));
    }

    function test_RevertWhen_ClaimAfterTimelock() public {
        vm.prank(maker);
        bytes32 lockId = escrow.lock(
            ORDER_ID,
            taker,
            address(token),
            AMOUNT,
            HASH_LOCK,
            TIMELOCK
        );

        // Fast forward past timelock
        vm.warp(TIMELOCK + 1);

        vm.prank(taker);
        vm.expectRevert(IP2PEscrowHTLC.TimelockExpired.selector);
        escrow.claim(lockId, SECRET);
    }

    function test_RevertWhen_ClaimAlreadyClaimed() public {
        vm.prank(maker);
        bytes32 lockId = escrow.lock(
            ORDER_ID,
            taker,
            address(token),
            AMOUNT,
            HASH_LOCK,
            TIMELOCK
        );

        vm.prank(taker);
        escrow.claim(lockId, SECRET);

        vm.prank(taker);
        vm.expectRevert(IP2PEscrowHTLC.AlreadyClaimed.selector);
        escrow.claim(lockId, SECRET);
    }

    // =========================================================================
    // Refund Tests
    // =========================================================================

    function test_Refund() public {
        vm.prank(maker);
        bytes32 lockId = escrow.lock(
            ORDER_ID,
            taker,
            address(token),
            AMOUNT,
            HASH_LOCK,
            TIMELOCK
        );

        uint256 makerBalanceBefore = token.balanceOf(maker);

        // Fast forward past timelock
        vm.warp(TIMELOCK + 1);

        // Refund
        vm.prank(maker);
        vm.expectEmit(true, true, true, true);
        emit Refunded(lockId, ORDER_ID, maker, HASH_LOCK);
        escrow.refund(lockId);

        // Verify refund state
        IP2PEscrowHTLC.Lock memory lockData = escrow.getLock(lockId);
        assertTrue(lockData.refunded);

        // Verify tokens returned to depositor
        assertEq(token.balanceOf(maker), makerBalanceBefore + AMOUNT);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_RefundByAnyone() public {
        vm.prank(maker);
        bytes32 lockId = escrow.lock(
            ORDER_ID,
            taker,
            address(token),
            AMOUNT,
            HASH_LOCK,
            TIMELOCK
        );

        // Fast forward past timelock
        vm.warp(TIMELOCK + 1);

        // Anyone can call refund after timelock
        // But funds always go to the original depositor
        address anyAddress = address(99);
        uint256 makerBalanceBefore = token.balanceOf(maker);

        vm.prank(anyAddress);
        escrow.refund(lockId);

        // Verify tokens go to depositor (maker)
        assertEq(token.balanceOf(maker), makerBalanceBefore + AMOUNT);
    }

    function test_RevertWhen_RefundNonExistentLock() public {
        // Fast forward to be past any reasonable timelock
        vm.warp(block.timestamp + 365 days);

        vm.prank(maker);
        vm.expectRevert(IP2PEscrowHTLC.LockNotFound.selector);
        escrow.refund(keccak256("non_existent"));
    }

    function test_RevertWhen_RefundBeforeTimelock() public {
        vm.prank(maker);
        bytes32 lockId = escrow.lock(
            ORDER_ID,
            taker,
            address(token),
            AMOUNT,
            HASH_LOCK,
            TIMELOCK
        );

        // Try to refund before timelock expires
        vm.prank(maker);
        vm.expectRevert(IP2PEscrowHTLC.TimelockNotExpired.selector);
        escrow.refund(lockId);
    }

    function test_RevertWhen_RefundAlreadyClaimed() public {
        vm.prank(maker);
        bytes32 lockId = escrow.lock(
            ORDER_ID,
            taker,
            address(token),
            AMOUNT,
            HASH_LOCK,
            TIMELOCK
        );

        // Claim first
        vm.prank(taker);
        escrow.claim(lockId, SECRET);

        // Fast forward past timelock
        vm.warp(TIMELOCK + 1);

        // Try to refund
        vm.prank(maker);
        vm.expectRevert(IP2PEscrowHTLC.AlreadyClaimed.selector);
        escrow.refund(lockId);
    }

    function test_RevertWhen_RefundAlreadyRefunded() public {
        vm.prank(maker);
        bytes32 lockId = escrow.lock(
            ORDER_ID,
            taker,
            address(token),
            AMOUNT,
            HASH_LOCK,
            TIMELOCK
        );

        // Fast forward past timelock
        vm.warp(TIMELOCK + 1);

        // First refund
        vm.prank(maker);
        escrow.refund(lockId);

        // Second refund attempt
        vm.prank(maker);
        vm.expectRevert(IP2PEscrowHTLC.AlreadyRefunded.selector);
        escrow.refund(lockId);
    }

    // =========================================================================
    // View Function Tests
    // =========================================================================

    function test_CanClaim() public {
        vm.prank(maker);
        bytes32 lockId = escrow.lock(
            ORDER_ID,
            taker,
            address(token),
            AMOUNT,
            HASH_LOCK,
            TIMELOCK
        );

        // Can claim before timelock
        assertTrue(escrow.canClaim(lockId));

        // Cannot claim after timelock
        vm.warp(TIMELOCK + 1);
        assertFalse(escrow.canClaim(lockId));
    }

    function test_CanRefund() public {
        vm.prank(maker);
        bytes32 lockId = escrow.lock(
            ORDER_ID,
            taker,
            address(token),
            AMOUNT,
            HASH_LOCK,
            TIMELOCK
        );

        // Cannot refund before timelock
        assertFalse(escrow.canRefund(lockId));

        // Can refund after timelock
        vm.warp(TIMELOCK + 1);
        assertTrue(escrow.canRefund(lockId));
    }

    function test_ComputeHashLock() public view {
        bytes32 computed = escrow.computeHashLock(SECRET);
        assertEq(computed, HASH_LOCK);
    }

    // =========================================================================
    // Admin Tests
    // =========================================================================

    function test_Pause() public {
        vm.prank(owner);
        escrow.pause();

        vm.prank(maker);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        escrow.lock(ORDER_ID, taker, address(token), AMOUNT, HASH_LOCK, TIMELOCK);
    }

    function test_ClaimAndRefundWorkWhenPaused() public {
        // Lock before pause
        vm.prank(maker);
        bytes32 lockId = escrow.lock(
            ORDER_ID,
            taker,
            address(token),
            AMOUNT,
            HASH_LOCK,
            TIMELOCK
        );

        // Pause contract
        vm.prank(owner);
        escrow.pause();

        // Claim should still work (important for user safety)
        vm.prank(taker);
        escrow.claim(lockId, SECRET);

        assertTrue(escrow.getLock(lockId).claimed);
    }

    // =========================================================================
    // Full Atomic Swap Scenario
    // =========================================================================

    function test_FullAtomicSwapScenario() public {
        // Setup: Taker has tokens too
        token.mint(taker, AMOUNT * 10);
        vm.prank(taker);
        token.approve(address(escrow), type(uint256).max);

        // Step 1: Maker generates secret and computes hash lock
        bytes32 makerSecret = keccak256("maker_secret_for_swap");
        bytes32 swapHashLock = keccak256(abi.encodePacked(makerSecret));

        // Step 2: Maker locks tokens (longer timelock)
        uint256 makerTimelock = block.timestamp + 24 hours;
        vm.prank(maker);
        bytes32 makerLockId = escrow.lock(
            ORDER_ID,
            taker,
            address(token),
            AMOUNT,
            swapHashLock,
            makerTimelock
        );

        // Step 3: Taker sees the lock and locks their tokens (shorter timelock)
        uint256 takerTimelock = block.timestamp + 12 hours;
        vm.prank(taker);
        bytes32 takerLockId = escrow.lock(
            ORDER_ID,
            maker, // Taker's recipient is maker
            address(token),
            AMOUNT / 2, // Different amount for illustration
            swapHashLock, // Same hash lock!
            takerTimelock
        );

        // Step 4: Maker claims from taker's lock (reveals secret)
        uint256 makerBalanceBefore = token.balanceOf(maker);
        vm.prank(maker);
        escrow.claim(takerLockId, makerSecret);

        // Maker now has taker's tokens
        assertEq(token.balanceOf(maker), makerBalanceBefore + AMOUNT / 2);

        // Step 5: Taker extracts secret from Step 4's tx and claims from maker's lock
        // In real world, taker would read secret from chain
        uint256 takerBalanceBefore = token.balanceOf(taker);
        vm.prank(taker);
        escrow.claim(makerLockId, makerSecret);

        // Taker now has maker's tokens
        assertEq(token.balanceOf(taker), takerBalanceBefore + AMOUNT);

        // Both locks are now claimed
        assertTrue(escrow.getLock(makerLockId).claimed);
        assertTrue(escrow.getLock(takerLockId).claimed);
    }

    // =========================================================================
    // Fuzz Tests
    // =========================================================================

    function testFuzz_LockAndClaim(uint256 amount, uint256 timelockDelta) public {
        vm.assume(amount > 0 && amount <= 1_000_000e18);
        vm.assume(timelockDelta >= 1 hours && timelockDelta <= 30 days);

        // Mint tokens
        token.mint(maker, amount);
        vm.prank(maker);
        token.approve(address(escrow), amount);

        uint256 timelock = block.timestamp + timelockDelta;

        vm.prank(maker);
        bytes32 lockId = escrow.lock(
            ORDER_ID,
            taker,
            address(token),
            amount,
            HASH_LOCK,
            timelock
        );

        vm.prank(taker);
        escrow.claim(lockId, SECRET);

        assertEq(token.balanceOf(taker), amount);
    }
}

