// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IP2POrderbook
/// @notice Interface for the P2P Orderbook contract
interface IP2POrderbook {
    // =========================================================================
    // Structs
    // =========================================================================

    struct Order {
        address maker;
        address sellToken;
        uint256 sellAmount;
        address buyToken;
        uint256 buyAmount;
        uint256 srcChainId;
        uint256 dstChainId;
        bytes32 hashLock;
        uint256 makerTimelock;
        uint256 takerTimelock;
        bool cancelled;
    }

    // =========================================================================
    // Events
    // =========================================================================

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

    // =========================================================================
    // Errors
    // =========================================================================

    error InvalidAmount();
    error InvalidTimelock();
    error InvalidHashLock();
    error OrderNotFound();
    error NotOrderMaker();
    error OrderAlreadyCancelled();

    // =========================================================================
    // Functions
    // =========================================================================

    function createOrder(
        address sellToken,
        uint256 sellAmount,
        address buyToken,
        uint256 buyAmount,
        uint256 dstChainId,
        bytes32 hashLock,
        uint256 makerTimelock,
        uint256 takerTimelock
    ) external returns (uint256 orderId);

    function cancelOrder(uint256 orderId) external;

    function orders(uint256 orderId) external view returns (
        address maker,
        address sellToken,
        uint256 sellAmount,
        address buyToken,
        uint256 buyAmount,
        uint256 srcChainId,
        uint256 dstChainId,
        bytes32 hashLock,
        uint256 makerTimelock,
        uint256 takerTimelock,
        bool cancelled
    );

    function orderCount() external view returns (uint256);
}

