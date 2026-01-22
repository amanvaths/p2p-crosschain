// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IP2PEscrowHTLC
/// @notice Interface for the P2P Escrow HTLC contract
interface IP2PEscrowHTLC {
    // =========================================================================
    // Structs
    // =========================================================================

    struct Lock {
        uint256 orderId;
        address depositor;
        address recipient;
        address token;
        uint256 amount;
        bytes32 hashLock;
        uint256 timelock;
        bool claimed;
        bool refunded;
    }

    // =========================================================================
    // Events
    // =========================================================================

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

    // =========================================================================
    // Errors
    // =========================================================================

    error InvalidAmount();
    error InvalidTimelock();
    error InvalidHashLock();
    error InvalidSecret();
    error LockNotFound();
    error LockAlreadyExists();
    error NotDepositor();
    error NotRecipient();
    error TimelockNotExpired();
    error TimelockExpired();
    error AlreadyClaimed();
    error AlreadyRefunded();
    error TransferFailed();

    // =========================================================================
    // Functions
    // =========================================================================

    function lock(
        uint256 orderId,
        address recipient,
        address token,
        uint256 amount,
        bytes32 hashLock,
        uint256 timelock
    ) external returns (bytes32 lockId);

    function claim(bytes32 lockId, bytes32 secret) external;

    function refund(bytes32 lockId) external;

    function locks(bytes32 lockId) external view returns (
        uint256 orderId,
        address depositor,
        address recipient,
        address token,
        uint256 amount,
        bytes32 hashLock,
        uint256 timelock,
        bool claimed,
        bool refunded
    );

    function getLockId(
        uint256 orderId,
        address depositor,
        bytes32 hashLock
    ) external pure returns (bytes32);

    function computeHashLock(bytes32 secret) external pure returns (bytes32);
}

