// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IP2PEscrowHTLC} from "./interfaces/IP2PEscrowHTLC.sol";

/// @title P2PEscrowHTLC
/// @author P2P Exchange Team
/// @notice Hash Time-Locked Contract (HTLC) for P2P cross-chain atomic swaps
/// @dev Implements a secure escrow with hash locks and time locks
contract P2PEscrowHTLC is IP2PEscrowHTLC, ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    // =========================================================================
    // State Variables
    // =========================================================================

    /// @notice Mapping from lock ID to Lock struct
    mapping(bytes32 => Lock) public locks;

    /// @notice Minimum timelock duration in seconds (1 hour)
    uint256 public constant MIN_TIMELOCK = 3600;

    /// @notice Maximum timelock duration in seconds (30 days)
    uint256 public constant MAX_TIMELOCK = 30 days;

    // =========================================================================
    // Constructor
    // =========================================================================

    /// @notice Initializes the escrow contract
    /// @param _owner The address that will own this contract
    constructor(address _owner) Ownable(_owner) {}

    // =========================================================================
    // External Functions
    // =========================================================================

    /// @notice Locks tokens in escrow with a hash lock and time lock
    /// @param orderId The associated order ID from the orderbook
    /// @param recipient The address that can claim with the secret
    /// @param token The ERC20 token address to lock
    /// @param amount The amount of tokens to lock
    /// @param hashLock The hash of the secret (H = keccak256(S))
    /// @param timelock The Unix timestamp after which funds can be refunded
    /// @return lockId The unique identifier for this lock
    function lock(
        uint256 orderId,
        address recipient,
        address token,
        uint256 amount,
        bytes32 hashLock,
        uint256 timelock
    ) external nonReentrant whenNotPaused returns (bytes32 lockId) {
        // Validate inputs
        if (amount == 0) {
            revert InvalidAmount();
        }
        if (hashLock == bytes32(0)) {
            revert InvalidHashLock();
        }
        if (recipient == address(0)) {
            revert InvalidAmount(); // Using InvalidAmount for zero address
        }

        // Validate timelock is in the future and within bounds
        uint256 timelockDuration = timelock - block.timestamp;
        if (
            timelock <= block.timestamp ||
            timelockDuration < MIN_TIMELOCK ||
            timelockDuration > MAX_TIMELOCK
        ) {
            revert InvalidTimelock();
        }

        // Generate lock ID
        lockId = getLockId(orderId, msg.sender, hashLock);

        // Ensure lock doesn't already exist
        if (locks[lockId].depositor != address(0)) {
            revert LockAlreadyExists();
        }

        // Effects: Store lock data first (checks-effects-interactions)
        locks[lockId] = Lock({
            orderId: orderId,
            depositor: msg.sender,
            recipient: recipient,
            token: token,
            amount: amount,
            hashLock: hashLock,
            timelock: timelock,
            claimed: false,
            refunded: false
        });

        // Interactions: Transfer tokens from depositor to this contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit Locked(
            lockId,
            orderId,
            msg.sender,
            recipient,
            token,
            amount,
            hashLock,
            timelock
        );
    }

    /// @notice Claims locked tokens by providing the secret
    /// @dev The secret S must hash to the stored hashLock H
    /// @param lockId The unique identifier for the lock
    /// @param secret The secret that hashes to the hashLock (S where H = keccak256(S))
    function claim(bytes32 lockId, bytes32 secret) external nonReentrant {
        Lock storage lockData = locks[lockId];

        // Validate lock exists
        if (lockData.depositor == address(0)) {
            revert LockNotFound();
        }

        // Validate not already claimed
        if (lockData.claimed) {
            revert AlreadyClaimed();
        }

        // Validate not already refunded
        if (lockData.refunded) {
            revert AlreadyRefunded();
        }

        // Validate timelock hasn't expired (can only claim before timelock)
        if (block.timestamp >= lockData.timelock) {
            revert TimelockExpired();
        }

        // Validate secret - this is the critical HTLC check
        // The secret must hash to the stored hashLock
        if (keccak256(abi.encodePacked(secret)) != lockData.hashLock) {
            revert InvalidSecret();
        }

        // Cache values before state change
        address recipient = lockData.recipient;
        address token = lockData.token;
        uint256 amount = lockData.amount;
        bytes32 hashLock = lockData.hashLock;
        uint256 orderId = lockData.orderId;

        // Effects: Mark as claimed
        lockData.claimed = true;

        // Interactions: Transfer tokens to recipient
        IERC20(token).safeTransfer(recipient, amount);

        // Note: The secret is visible in the transaction calldata
        // This allows the counterparty to extract it and claim on the other chain
        emit Claimed(lockId, orderId, recipient, hashLock);
    }

    /// @notice Refunds locked tokens after timelock expires
    /// @param lockId The unique identifier for the lock
    function refund(bytes32 lockId) external nonReentrant {
        Lock storage lockData = locks[lockId];

        // Validate lock exists
        if (lockData.depositor == address(0)) {
            revert LockNotFound();
        }

        // Validate not already claimed
        if (lockData.claimed) {
            revert AlreadyClaimed();
        }

        // Validate not already refunded
        if (lockData.refunded) {
            revert AlreadyRefunded();
        }

        // Validate timelock has expired (can only refund after timelock)
        if (block.timestamp < lockData.timelock) {
            revert TimelockNotExpired();
        }

        // Cache values before state change
        address depositor = lockData.depositor;
        address token = lockData.token;
        uint256 amount = lockData.amount;
        bytes32 hashLock = lockData.hashLock;
        uint256 orderId = lockData.orderId;

        // Effects: Mark as refunded
        lockData.refunded = true;

        // Interactions: Transfer tokens back to depositor
        IERC20(token).safeTransfer(depositor, amount);

        emit Refunded(lockId, orderId, depositor, hashLock);
    }

    // =========================================================================
    // View Functions
    // =========================================================================

    /// @notice Computes a lock ID from its components
    /// @param orderId The associated order ID
    /// @param depositor The address that deposited funds
    /// @param hashLock The hash lock
    /// @return The computed lock ID
    function getLockId(
        uint256 orderId,
        address depositor,
        bytes32 hashLock
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(orderId, depositor, hashLock));
    }

    /// @notice Computes a hash lock from a secret
    /// @param secret The secret value
    /// @return The keccak256 hash of the secret
    function computeHashLock(bytes32 secret) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(secret));
    }

    /// @notice Gets full lock details
    /// @param lockId The lock ID
    /// @return The Lock struct
    function getLock(bytes32 lockId) external view returns (Lock memory) {
        return locks[lockId];
    }

    /// @notice Checks if a lock can be claimed
    /// @param lockId The lock ID
    /// @return True if the lock exists and hasn't been claimed/refunded and timelock hasn't expired
    function canClaim(bytes32 lockId) external view returns (bool) {
        Lock storage lockData = locks[lockId];
        return
            lockData.depositor != address(0) &&
            !lockData.claimed &&
            !lockData.refunded &&
            block.timestamp < lockData.timelock;
    }

    /// @notice Checks if a lock can be refunded
    /// @param lockId The lock ID
    /// @return True if the lock exists and hasn't been claimed/refunded and timelock has expired
    function canRefund(bytes32 lockId) external view returns (bool) {
        Lock storage lockData = locks[lockId];
        return
            lockData.depositor != address(0) &&
            !lockData.claimed &&
            !lockData.refunded &&
            block.timestamp >= lockData.timelock;
    }

    // =========================================================================
    // Admin Functions
    // =========================================================================

    /// @notice Pauses the contract (emergency stop - only affects new locks)
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpauses the contract
    function unpause() external onlyOwner {
        _unpause();
    }
}

