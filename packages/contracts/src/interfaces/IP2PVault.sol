// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IP2PVaultBSC
 * @notice Interface for P2P Vault on BSC Chain
 */
interface IP2PVaultBSC {
    // Enums
    enum OrderStatus { NONE, OPEN, MATCHED, COMPLETED, CANCELLED, EXPIRED, REFUNDED }
    
    // Events
    event OrderCreated(uint256 indexed orderId, address indexed buyer, uint256 amount, uint256 expiresAt);
    event OrderMatched(uint256 indexed orderId, address indexed buyer, address indexed seller, uint256 amount);
    event OrderCompleted(uint256 indexed orderId, address indexed buyer, address indexed seller, uint256 amount, bytes32 dscTxHash);
    event OrderCancelled(uint256 indexed orderId, address indexed buyer, uint256 amount);
    event OrderRefunded(uint256 indexed orderId, address indexed buyer, uint256 amount);
    event EmergencyModeActivated(uint256 timestamp);
    event EmergencyModeDeactivated();
    event EmergencyWithdrawal(address indexed token, address indexed to, uint256 amount);
    
    // User Functions
    function createBuyOrder(uint256 amount) external returns (uint256 orderId);
    function cancelOrder(uint256 orderId) external;
    function refundExpiredOrder(uint256 orderId) external;
    
    // Bridge Relayer Functions
    function matchOrder(uint256 orderId, address seller) external;
    function completeOrder(uint256 orderId, address seller, bytes32 dscTxHash) external;
    function revertMatchedOrder(uint256 orderId) external;
    
    // View Functions
    function getOrder(uint256 orderId) external view returns (
        address buyer,
        OrderStatus status,
        uint256 amount,
        uint256 createdAt,
        uint256 expiresAt,
        address matchedSeller,
        uint256 matchedAt,
        bytes32 dscTxHash
    );
    function getUserOrderIds(address user) external view returns (uint256[] memory);
    function getUserLockedAmount(address user) external view returns (uint256);
    function getOrderCount() external view returns (uint256);
    function totalLocked() external view returns (uint256);
    
    // Admin Functions
    function pause() external;
    function unpause() external;
    function activateEmergencyMode() external;
    function deactivateEmergencyMode() external;
    function emergencyWithdraw(address to) external;
}

/**
 * @title IP2PVaultDSC
 * @notice Interface for P2P Vault on DSC Chain
 */
interface IP2PVaultDSC {
    // Enums
    enum OrderStatus { NONE, OPEN, MATCHED, COMPLETED, CANCELLED, EXPIRED, REFUNDED }
    enum OrderType { SELL, DIRECT_FILL }
    
    // Events
    event SellOrderCreated(uint256 indexed orderId, address indexed seller, uint256 amount, uint256 expiresAt);
    event DirectFillCreated(uint256 indexed dscOrderId, uint256 indexed bscOrderId, address indexed seller, address buyer, uint256 amount);
    event OrderMatched(uint256 indexed dscOrderId, uint256 indexed bscOrderId, address indexed seller, address buyer, uint256 amount);
    event OrderCompleted(uint256 indexed dscOrderId, uint256 indexed bscOrderId, address seller, address indexed buyer, uint256 amount, bytes32 bscTxHash);
    event OrderCancelled(uint256 indexed orderId, address indexed seller, uint256 amount);
    event OrderRefunded(uint256 indexed orderId, address indexed seller, uint256 amount);
    event EmergencyModeActivated(uint256 timestamp);
    event EmergencyModeDeactivated();
    event EmergencyWithdrawal(address indexed token, address indexed to, uint256 amount);
    
    // User Functions
    function createSellOrder(uint256 amount) external returns (uint256 orderId);
    function fillBscBuyOrder(uint256 bscOrderId, address buyer, uint256 amount) external returns (uint256 orderId);
    function cancelSellOrder(uint256 orderId) external;
    function refundExpiredOrder(uint256 orderId) external;
    
    // Bridge Relayer Functions
    function matchSellOrder(uint256 dscOrderId, uint256 bscOrderId, address buyer) external;
    function completeOrder(uint256 dscOrderId, address buyer, bytes32 bscTxHash) external;
    function revertMatchedOrder(uint256 dscOrderId) external;
    
    // View Functions
    function getOrder(uint256 orderId) external view returns (
        address seller,
        OrderStatus status,
        OrderType orderType,
        uint256 amount,
        uint256 createdAt,
        uint256 expiresAt,
        address matchedBuyer,
        uint256 matchedBscOrderId,
        uint256 matchedAt,
        bytes32 bscTxHash
    );
    function getUserOrderIds(address user) external view returns (uint256[] memory);
    function getUserLockedAmount(address user) external view returns (uint256);
    function getOrderCount() external view returns (uint256);
    function isBscOrderMatched(uint256 bscOrderId) external view returns (bool);
    function getDscOrderForBscOrder(uint256 bscOrderId) external view returns (uint256);
    function totalLocked() external view returns (uint256);
    
    // Admin Functions
    function pause() external;
    function unpause() external;
    function activateEmergencyMode() external;
    function deactivateEmergencyMode() external;
    function emergencyWithdraw(address to) external;
}
