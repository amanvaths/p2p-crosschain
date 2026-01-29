// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title P2PVaultBSCv2
 * @author P2P Exchange Team
 * @notice Advanced P2P Vault on BSC with partial fills and instant matching
 * 
 * NEW FEATURES:
 * - Partial order fills
 * - Same wallet allowed (for testing)
 * - Direct fill from DSC sell orders
 * - Instant cross-chain matching by relayer
 * - No rate limiting for faster trading
 */

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

contract P2PVaultBSCv2 is ReentrancyGuard, Pausable, Ownable2Step {
    using SafeERC20 for IERC20;

    // =============================================================================
    // CONSTANTS
    // =============================================================================
    
    uint256 public constant MIN_ORDER_AMOUNT = 1e15; // 0.001 token minimum
    uint256 public constant MAX_ORDER_AMOUNT = 1e24; // 1M token maximum
    uint256 public constant ORDER_EXPIRY_TIME = 24 hours;

    // =============================================================================
    // STATE VARIABLES
    // =============================================================================
    
    IERC20 public immutable USDT;
    
    uint256 private _orderCounter;
    uint256 public totalLocked;
    
    // Access control
    address public bridgeRelayer;
    
    // Order status enum
    enum OrderStatus { NONE, OPEN, PARTIALLY_FILLED, COMPLETED, CANCELLED }
    
    // Order type enum  
    enum OrderType { BUY, SELL_INTENT }
    
    // Order structure with partial fill support
    struct Order {
        address user;            // 20 bytes - order creator
        OrderStatus status;      // 1 byte
        OrderType orderType;     // 1 byte
        uint256 amount;          // Total order amount
        uint256 filledAmount;    // Amount already filled
        uint256 createdAt;       // Timestamp
        uint256 expiresAt;       // Expiry timestamp
    }
    
    // Fill record for tracking
    struct Fill {
        uint256 dscOrderId;      // Matching DSC order
        address counterparty;    // Who filled
        uint256 amount;          // Fill amount
        uint256 timestamp;       // When filled
        bytes32 dscTxHash;       // Proof from DSC
    }
    
    // Mappings
    mapping(uint256 => Order) private _orders;
    mapping(uint256 => Fill[]) private _orderFills;
    mapping(address => uint256[]) private _userOrderIds;
    mapping(address => uint256) private _userLockedAmount;
    
    // Track matched DSC orders
    mapping(uint256 => mapping(uint256 => bool)) private _dscOrderFillUsed; // bscOrderId => dscOrderId => used

    // =============================================================================
    // EVENTS
    // =============================================================================
    
    event OrderCreated(
        uint256 indexed orderId,
        address indexed user,
        OrderType orderType,
        uint256 amount,
        uint256 expiresAt
    );
    
    event OrderFilled(
        uint256 indexed bscOrderId,
        uint256 indexed dscOrderId,
        address indexed filler,
        uint256 amount,
        bool isPartial
    );
    
    event OrderCompleted(
        uint256 indexed orderId,
        address indexed user,
        uint256 totalAmount,
        uint256 fillCount
    );
    
    event OrderCancelled(
        uint256 indexed orderId,
        address indexed user,
        uint256 refundAmount
    );
    
    event FundsReleased(
        uint256 indexed bscOrderId,
        address indexed recipient,
        uint256 amount,
        bytes32 dscTxHash
    );

    // =============================================================================
    // ERRORS
    // =============================================================================
    
    error ZeroAddress();
    error ZeroAmount();
    error AmountTooSmall();
    error AmountTooLarge();
    error OrderNotFound();
    error InvalidOrderStatus();
    error NotOrderOwner();
    error NotAuthorized();
    error OrderExpired();
    error InsufficientBalance();
    error FillAmountExceedsRemaining();
    error DscOrderAlreadyUsed();
    error InvalidDscOrderId();

    // =============================================================================
    // MODIFIERS
    // =============================================================================
    
    modifier onlyBridgeRelayer() {
        if (msg.sender != bridgeRelayer) revert NotAuthorized();
        _;
    }
    
    modifier validAmount(uint256 amount) {
        if (amount == 0) revert ZeroAmount();
        if (amount < MIN_ORDER_AMOUNT) revert AmountTooSmall();
        if (amount > MAX_ORDER_AMOUNT) revert AmountTooLarge();
        _;
    }

    // =============================================================================
    // CONSTRUCTOR
    // =============================================================================
    
    constructor(
        address _usdt, 
        address _bridgeRelayer
    ) Ownable(msg.sender) {
        if (_usdt == address(0) || _bridgeRelayer == address(0)) revert ZeroAddress();
        USDT = IERC20(_usdt);
        bridgeRelayer = _bridgeRelayer;
    }

    // =============================================================================
    // USER FUNCTIONS
    // =============================================================================
    
    /**
     * @notice Create a BUY order - Lock BEP20 USDT to buy DEP20
     * @param amount Amount of USDT to lock
     * @return orderId The created order ID
     */
    function createBuyOrder(uint256 amount) 
        external 
        nonReentrant 
        whenNotPaused 
        validAmount(amount)
        returns (uint256 orderId) 
    {
        // Check balance
        if (USDT.balanceOf(msg.sender) < amount) revert InsufficientBalance();
        
        // Create order
        orderId = ++_orderCounter;
        
        _orders[orderId] = Order({
            user: msg.sender,
            status: OrderStatus.OPEN,
            orderType: OrderType.BUY,
            amount: amount,
            filledAmount: 0,
            createdAt: block.timestamp,
            expiresAt: block.timestamp + ORDER_EXPIRY_TIME
        });
        
        _userOrderIds[msg.sender].push(orderId);
        _userLockedAmount[msg.sender] += amount;
        totalLocked += amount;
        
        // Transfer tokens
        USDT.safeTransferFrom(msg.sender, address(this), amount);
        
        emit OrderCreated(orderId, msg.sender, OrderType.BUY, amount, block.timestamp + ORDER_EXPIRY_TIME);
    }
    
    /**
     * @notice Cancel an open/partial order and refund remaining USDT
     * @param orderId Order ID to cancel
     */
    function cancelOrder(uint256 orderId) external nonReentrant {
        Order storage order = _orders[orderId];
        
        if (order.status == OrderStatus.NONE) revert OrderNotFound();
        if (order.user != msg.sender) revert NotOrderOwner();
        if (order.status != OrderStatus.OPEN && order.status != OrderStatus.PARTIALLY_FILLED) {
            revert InvalidOrderStatus();
        }
        
        uint256 refundAmount = order.amount - order.filledAmount;
        
        // Update state
        order.status = OrderStatus.CANCELLED;
        _userLockedAmount[msg.sender] -= refundAmount;
        totalLocked -= refundAmount;
        
        // Refund
        if (refundAmount > 0) {
            USDT.safeTransfer(msg.sender, refundAmount);
        }
        
        emit OrderCancelled(orderId, msg.sender, refundAmount);
    }

    // =============================================================================
    // BRIDGE RELAYER FUNCTIONS
    // =============================================================================
    
    /**
     * @notice Fill a buy order (partial or full) and release BEP20 to seller
     * @dev Called by relayer when DSC side is confirmed
     * @param bscOrderId Buy order ID on BSC
     * @param dscOrderId Sell order ID on DSC (for tracking)
     * @param seller Address to receive BEP20 (the DSC seller)
     * @param amount Amount to fill
     * @param dscTxHash Transaction hash from DSC as proof
     */
    function fillAndRelease(
        uint256 bscOrderId,
        uint256 dscOrderId,
        address seller,
        uint256 amount,
        bytes32 dscTxHash
    ) external onlyBridgeRelayer nonReentrant validAmount(amount) {
        if (seller == address(0)) revert ZeroAddress();
        if (dscOrderId == 0) revert InvalidDscOrderId();
        if (_dscOrderFillUsed[bscOrderId][dscOrderId]) revert DscOrderAlreadyUsed();
        
        Order storage order = _orders[bscOrderId];
        
        if (order.status == OrderStatus.NONE) revert OrderNotFound();
        if (order.status != OrderStatus.OPEN && order.status != OrderStatus.PARTIALLY_FILLED) {
            revert InvalidOrderStatus();
        }
        if (block.timestamp > order.expiresAt) revert OrderExpired();
        
        uint256 remainingAmount = order.amount - order.filledAmount;
        if (amount > remainingAmount) revert FillAmountExceedsRemaining();
        
        // Mark DSC order as used for this BSC order
        _dscOrderFillUsed[bscOrderId][dscOrderId] = true;
        
        // Update order
        order.filledAmount += amount;
        bool isComplete = order.filledAmount == order.amount;
        
        if (isComplete) {
            order.status = OrderStatus.COMPLETED;
        } else {
            order.status = OrderStatus.PARTIALLY_FILLED;
        }
        
        // Record fill
        _orderFills[bscOrderId].push(Fill({
            dscOrderId: dscOrderId,
            counterparty: seller,
            amount: amount,
            timestamp: block.timestamp,
            dscTxHash: dscTxHash
        }));
        
        // Update totals
        _userLockedAmount[order.user] -= amount;
        totalLocked -= amount;
        
        // Release BEP20 to seller
        USDT.safeTransfer(seller, amount);
        
        emit OrderFilled(bscOrderId, dscOrderId, seller, amount, !isComplete);
        emit FundsReleased(bscOrderId, seller, amount, dscTxHash);
        
        if (isComplete) {
            emit OrderCompleted(bscOrderId, order.user, order.amount, _orderFills[bscOrderId].length);
        }
    }
    
    /**
     * @notice Batch fill multiple orders at once (gas efficient)
     */
    function batchFillAndRelease(
        uint256[] calldata bscOrderIds,
        uint256[] calldata dscOrderIds,
        address[] calldata sellers,
        uint256[] calldata amounts,
        bytes32[] calldata dscTxHashes
    ) external onlyBridgeRelayer nonReentrant {
        require(bscOrderIds.length == dscOrderIds.length, "Array length mismatch");
        require(bscOrderIds.length == sellers.length, "Array length mismatch");
        require(bscOrderIds.length == amounts.length, "Array length mismatch");
        require(bscOrderIds.length == dscTxHashes.length, "Array length mismatch");
        
        for (uint256 i = 0; i < bscOrderIds.length; i++) {
            _fillAndReleaseInternal(
                bscOrderIds[i],
                dscOrderIds[i],
                sellers[i],
                amounts[i],
                dscTxHashes[i]
            );
        }
    }
    
    function _fillAndReleaseInternal(
        uint256 bscOrderId,
        uint256 dscOrderId,
        address seller,
        uint256 amount,
        bytes32 dscTxHash
    ) internal {
        if (seller == address(0) || dscOrderId == 0 || amount == 0) return;
        if (_dscOrderFillUsed[bscOrderId][dscOrderId]) return;
        
        Order storage order = _orders[bscOrderId];
        if (order.status == OrderStatus.NONE) return;
        if (order.status != OrderStatus.OPEN && order.status != OrderStatus.PARTIALLY_FILLED) return;
        if (block.timestamp > order.expiresAt) return;
        
        uint256 remainingAmount = order.amount - order.filledAmount;
        if (amount > remainingAmount) amount = remainingAmount;
        
        _dscOrderFillUsed[bscOrderId][dscOrderId] = true;
        
        order.filledAmount += amount;
        bool isComplete = order.filledAmount == order.amount;
        order.status = isComplete ? OrderStatus.COMPLETED : OrderStatus.PARTIALLY_FILLED;
        
        _orderFills[bscOrderId].push(Fill({
            dscOrderId: dscOrderId,
            counterparty: seller,
            amount: amount,
            timestamp: block.timestamp,
            dscTxHash: dscTxHash
        }));
        
        _userLockedAmount[order.user] -= amount;
        totalLocked -= amount;
        
        USDT.safeTransfer(seller, amount);
        
        emit OrderFilled(bscOrderId, dscOrderId, seller, amount, !isComplete);
        emit FundsReleased(bscOrderId, seller, amount, dscTxHash);
        
        if (isComplete) {
            emit OrderCompleted(bscOrderId, order.user, order.amount, _orderFills[bscOrderId].length);
        }
    }

    // =============================================================================
    // VIEW FUNCTIONS
    // =============================================================================
    
    function getOrder(uint256 orderId) external view returns (
        address user,
        OrderStatus status,
        OrderType orderType,
        uint256 amount,
        uint256 filledAmount,
        uint256 expiresAt
    ) {
        Order storage order = _orders[orderId];
        return (
            order.user,
            order.status,
            order.orderType,
            order.amount,
            order.filledAmount,
            order.expiresAt
        );
    }
    
    function getOrderDetails(uint256 orderId) external view returns (
        uint256 remainingAmount,
        uint256 createdAt,
        uint256 fillCount
    ) {
        Order storage order = _orders[orderId];
        return (
            order.amount - order.filledAmount,
            order.createdAt,
            _orderFills[orderId].length
        );
    }
    
    function getOrderFills(uint256 orderId) external view returns (Fill[] memory) {
        return _orderFills[orderId];
    }
    
    function getUserOrderIds(address user) external view returns (uint256[] memory) {
        return _userOrderIds[user];
    }
    
    function getUserLockedAmount(address user) external view returns (uint256) {
        return _userLockedAmount[user];
    }
    
    function getOrderCount() external view returns (uint256) {
        return _orderCounter;
    }
    
    function isDscOrderUsed(uint256 bscOrderId, uint256 dscOrderId) external view returns (bool) {
        return _dscOrderFillUsed[bscOrderId][dscOrderId];
    }
    
    /**
     * @notice Get all open orders (for relayer)
     */
    function getOpenOrders(uint256 offset, uint256 limit) external view returns (
        uint256[] memory orderIds,
        address[] memory users,
        uint256[] memory amounts,
        uint256[] memory remainingAmounts,
        uint256[] memory expiresAts
    ) {
        // Count open orders
        uint256 count = 0;
        for (uint256 i = 1; i <= _orderCounter; i++) {
            Order storage o = _orders[i];
            if ((o.status == OrderStatus.OPEN || o.status == OrderStatus.PARTIALLY_FILLED) 
                && block.timestamp <= o.expiresAt) {
                count++;
            }
        }
        
        // Calculate result size
        uint256 start = offset > count ? count : offset;
        uint256 resultSize = count > start ? count - start : 0;
        if (resultSize > limit) resultSize = limit;
        
        // Allocate arrays
        orderIds = new uint256[](resultSize);
        users = new address[](resultSize);
        amounts = new uint256[](resultSize);
        remainingAmounts = new uint256[](resultSize);
        expiresAts = new uint256[](resultSize);
        
        // Fill arrays
        uint256 idx = 0;
        uint256 skipped = 0;
        for (uint256 i = 1; i <= _orderCounter && idx < resultSize; i++) {
            Order storage o = _orders[i];
            if ((o.status == OrderStatus.OPEN || o.status == OrderStatus.PARTIALLY_FILLED) 
                && block.timestamp <= o.expiresAt) {
                if (skipped < offset) {
                    skipped++;
                } else {
                    orderIds[idx] = i;
                    users[idx] = o.user;
                    amounts[idx] = o.amount;
                    remainingAmounts[idx] = o.amount - o.filledAmount;
                    expiresAts[idx] = o.expiresAt;
                    idx++;
                }
            }
        }
    }

    // =============================================================================
    // ADMIN FUNCTIONS
    // =============================================================================
    
    function setBridgeRelayer(address newRelayer) external onlyOwner {
        if (newRelayer == address(0)) revert ZeroAddress();
        bridgeRelayer = newRelayer;
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(0) || to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
    }
}
