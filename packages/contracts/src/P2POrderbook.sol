// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IP2POrderbook} from "./interfaces/IP2POrderbook.sol";

/// @title P2POrderbook
/// @author P2P Exchange Team
/// @notice Stores maker intent for P2P cross-chain atomic swaps
/// @dev This contract only stores order metadata. Funds are locked in the Escrow contract.
contract P2POrderbook is IP2POrderbook, ReentrancyGuard, Pausable, Ownable {
    // =========================================================================
    // State Variables
    // =========================================================================

    /// @notice Mapping from order ID to Order struct
    mapping(uint256 => Order) public orders;

    /// @notice Total number of orders created (also serves as next order ID)
    uint256 public orderCount;

    /// @notice Minimum timelock duration in seconds (1 hour)
    uint256 public constant MIN_TIMELOCK = 3600;

    /// @notice Maximum timelock duration in seconds (30 days)
    uint256 public constant MAX_TIMELOCK = 30 days;

    // =========================================================================
    // Constructor
    // =========================================================================

    /// @notice Initializes the orderbook contract
    /// @param _owner The address that will own this contract
    constructor(address _owner) Ownable(_owner) {}

    // =========================================================================
    // External Functions
    // =========================================================================

    /// @notice Creates a new order in the orderbook
    /// @param sellToken The token the maker wants to sell (on source chain)
    /// @param sellAmount The amount of sellToken the maker wants to sell
    /// @param buyToken The token the maker wants to receive (on destination chain)
    /// @param buyAmount The amount of buyToken the maker wants to receive
    /// @param dstChainId The chain ID where the maker will receive buyToken
    /// @param hashLock The hash of the secret (H = keccak256(S))
    /// @param makerTimelock The timelock for the maker's escrow (should be > takerTimelock)
    /// @param takerTimelock The timelock for the taker's escrow
    /// @return orderId The ID of the created order
    function createOrder(
        address sellToken,
        uint256 sellAmount,
        address buyToken,
        uint256 buyAmount,
        uint256 dstChainId,
        bytes32 hashLock,
        uint256 makerTimelock,
        uint256 takerTimelock
    ) external nonReentrant whenNotPaused returns (uint256 orderId) {
        // Validate inputs
        if (sellAmount == 0 || buyAmount == 0) {
            revert InvalidAmount();
        }
        if (hashLock == bytes32(0)) {
            revert InvalidHashLock();
        }
        if (
            makerTimelock < MIN_TIMELOCK ||
            takerTimelock < MIN_TIMELOCK ||
            makerTimelock > MAX_TIMELOCK ||
            takerTimelock > MAX_TIMELOCK
        ) {
            revert InvalidTimelock();
        }
        // Maker timelock should be greater than taker timelock for safe atomic swap
        if (makerTimelock <= takerTimelock) {
            revert InvalidTimelock();
        }

        // Get current chain ID for srcChainId
        uint256 srcChainId = block.chainid;

        // Create order
        orderId = orderCount++;

        orders[orderId] = Order({
            maker: msg.sender,
            sellToken: sellToken,
            sellAmount: sellAmount,
            buyToken: buyToken,
            buyAmount: buyAmount,
            srcChainId: srcChainId,
            dstChainId: dstChainId,
            hashLock: hashLock,
            makerTimelock: makerTimelock,
            takerTimelock: takerTimelock,
            cancelled: false
        });

        emit OrderCreated(
            orderId,
            msg.sender,
            sellToken,
            sellAmount,
            buyToken,
            buyAmount,
            srcChainId,
            dstChainId,
            hashLock,
            makerTimelock,
            takerTimelock
        );
    }

    /// @notice Cancels an order (only before funds are locked)
    /// @param orderId The ID of the order to cancel
    function cancelOrder(uint256 orderId) external nonReentrant {
        Order storage order = orders[orderId];

        // Validate order exists
        if (order.maker == address(0)) {
            revert OrderNotFound();
        }

        // Only the maker can cancel
        if (order.maker != msg.sender) {
            revert NotOrderMaker();
        }

        // Cannot cancel already cancelled order
        if (order.cancelled) {
            revert OrderAlreadyCancelled();
        }

        // Mark as cancelled
        order.cancelled = true;

        emit OrderCancelled(orderId, msg.sender);
    }

    // =========================================================================
    // View Functions
    // =========================================================================

    /// @notice Returns order details
    /// @param orderId The ID of the order
    /// @return All order fields
    function getOrder(uint256 orderId) external view returns (Order memory) {
        return orders[orderId];
    }

    // =========================================================================
    // Admin Functions
    // =========================================================================

    /// @notice Pauses the contract (emergency stop)
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpauses the contract
    function unpause() external onlyOwner {
        _unpause();
    }
}

