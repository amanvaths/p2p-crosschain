// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title P2PVaultDSCv2
 * @author P2P Exchange Team
 * @notice Advanced P2P Vault on DSC with partial fills and instant matching
 * 
 * NEW FEATURES:
 * - Partial order fills
 * - Same wallet allowed (for testing)
 * - Fill BSC buy orders OR create sell orders
 * - Instant cross-chain matching by relayer
 * - No rate limiting for faster trading
 */

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

contract P2PVaultDSCv2 is ReentrancyGuard, Pausable, Ownable2Step {
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
    
    IERC20 public immutable DEP20_USDT;
    
    uint256 private _orderCounter;
    uint256 public totalLocked;
    
    // Access control
    address public bridgeRelayer;
    
    // Order status enum
    enum OrderStatus { NONE, OPEN, PARTIALLY_FILLED, COMPLETED, CANCELLED }
    
    // Order type enum  
    enum OrderType { SELL, FILL_BSC_BUY }
    
    // Order structure with partial fill support
    struct Order {
        address user;            // Order creator
        OrderStatus status;
        OrderType orderType;
        uint256 amount;          // Total order amount
        uint256 filledAmount;    // Amount already filled
        uint256 createdAt;
        uint256 expiresAt;
        uint256 linkedBscOrderId; // For FILL_BSC_BUY type
        address linkedBscBuyer;   // For FILL_BSC_BUY type
    }
    
    // Fill record for tracking
    struct Fill {
        uint256 bscOrderId;      // Matching BSC order
        address counterparty;    // Who received funds
        uint256 amount;          // Fill amount
        uint256 timestamp;
        bytes32 bscTxHash;       // Proof from BSC
    }
    
    // Mappings
    mapping(uint256 => Order) private _orders;
    mapping(uint256 => Fill[]) private _orderFills;
    mapping(address => uint256[]) private _userOrderIds;
    mapping(address => uint256) private _userLockedAmount;
    
    // Track linked BSC orders
    mapping(uint256 => uint256) private _bscOrderToDscOrder;
    mapping(uint256 => mapping(uint256 => bool)) private _bscOrderFillUsed;

    // =============================================================================
    // EVENTS
    // =============================================================================
    
    event OrderCreated(
        uint256 indexed orderId,
        address indexed user,
        OrderType orderType,
        uint256 amount,
        uint256 linkedBscOrderId,
        uint256 expiresAt
    );
    
    event OrderFilled(
        uint256 indexed dscOrderId,
        uint256 indexed bscOrderId,
        address indexed recipient,
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
        uint256 indexed dscOrderId,
        address indexed recipient,
        uint256 amount,
        bytes32 bscTxHash
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
    error BscOrderAlreadyLinked();
    error InvalidBscOrderId();

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
        address _dep20Usdt, 
        address _bridgeRelayer
    ) Ownable(msg.sender) {
        if (_dep20Usdt == address(0) || _bridgeRelayer == address(0)) revert ZeroAddress();
        DEP20_USDT = IERC20(_dep20Usdt);
        bridgeRelayer = _bridgeRelayer;
    }

    // =============================================================================
    // USER FUNCTIONS
    // =============================================================================
    
    /**
     * @notice Create a SELL order - Lock DEP20 to sell for BEP20
     * @param amount Amount of DEP20 to lock
     * @return orderId The created order ID
     */
    function createSellOrder(uint256 amount) 
        external 
        nonReentrant 
        whenNotPaused 
        validAmount(amount)
        returns (uint256 orderId) 
    {
        if (DEP20_USDT.balanceOf(msg.sender) < amount) revert InsufficientBalance();
        
        orderId = ++_orderCounter;
        
        _orders[orderId] = Order({
            user: msg.sender,
            status: OrderStatus.OPEN,
            orderType: OrderType.SELL,
            amount: amount,
            filledAmount: 0,
            createdAt: block.timestamp,
            expiresAt: block.timestamp + ORDER_EXPIRY_TIME,
            linkedBscOrderId: 0,
            linkedBscBuyer: address(0)
        });
        
        _userOrderIds[msg.sender].push(orderId);
        _userLockedAmount[msg.sender] += amount;
        totalLocked += amount;
        
        DEP20_USDT.safeTransferFrom(msg.sender, address(this), amount);
        
        emit OrderCreated(orderId, msg.sender, OrderType.SELL, amount, 0, block.timestamp + ORDER_EXPIRY_TIME);
    }
    
    /**
     * @notice Fill an existing BSC buy order - Lock DEP20 to fill a buy order
     * @param bscOrderId The order ID on BSC chain
     * @param bscBuyer The buyer address on BSC
     * @param amount Amount of DEP20 to send
     * @return orderId The created DSC order ID
     */
    function fillBscBuyOrder(
        uint256 bscOrderId,
        address bscBuyer,
        uint256 amount
    ) 
        external 
        nonReentrant 
        whenNotPaused 
        validAmount(amount)
        returns (uint256 orderId) 
    {
        if (bscBuyer == address(0)) revert ZeroAddress();
        if (bscOrderId == 0) revert InvalidBscOrderId();
        if (DEP20_USDT.balanceOf(msg.sender) < amount) revert InsufficientBalance();
        
        // Note: We allow multiple fills for the same BSC order (partial fills)
        
        orderId = ++_orderCounter;
        
        _orders[orderId] = Order({
            user: msg.sender,
            status: OrderStatus.OPEN, // Open until relayer confirms
            orderType: OrderType.FILL_BSC_BUY,
            amount: amount,
            filledAmount: 0,
            createdAt: block.timestamp,
            expiresAt: block.timestamp + ORDER_EXPIRY_TIME,
            linkedBscOrderId: bscOrderId,
            linkedBscBuyer: bscBuyer
        });
        
        _userOrderIds[msg.sender].push(orderId);
        _userLockedAmount[msg.sender] += amount;
        totalLocked += amount;
        
        // Link BSC order
        if (_bscOrderToDscOrder[bscOrderId] == 0) {
            _bscOrderToDscOrder[bscOrderId] = orderId;
        }
        
        DEP20_USDT.safeTransferFrom(msg.sender, address(this), amount);
        
        emit OrderCreated(orderId, msg.sender, OrderType.FILL_BSC_BUY, amount, bscOrderId, block.timestamp + ORDER_EXPIRY_TIME);
    }
    
    /**
     * @notice Cancel an open order and refund remaining DEP20
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
        
        // Clear BSC order link if applicable
        if (order.linkedBscOrderId > 0 && _bscOrderToDscOrder[order.linkedBscOrderId] == orderId) {
            delete _bscOrderToDscOrder[order.linkedBscOrderId];
        }
        
        order.status = OrderStatus.CANCELLED;
        _userLockedAmount[msg.sender] -= refundAmount;
        totalLocked -= refundAmount;
        
        if (refundAmount > 0) {
            DEP20_USDT.safeTransfer(msg.sender, refundAmount);
        }
        
        emit OrderCancelled(orderId, msg.sender, refundAmount);
    }

    // =============================================================================
    // BRIDGE RELAYER FUNCTIONS
    // =============================================================================
    
    /**
     * @notice Fill a sell order (partial or full) and release DEP20 to buyer
     * @dev Called by relayer when BSC side is confirmed
     * @param dscOrderId Sell order ID on DSC
     * @param bscOrderId Buy order ID on BSC (for tracking)
     * @param buyer Address to receive DEP20
     * @param amount Amount to fill
     * @param bscTxHash Transaction hash from BSC as proof
     */
    function fillAndRelease(
        uint256 dscOrderId,
        uint256 bscOrderId,
        address buyer,
        uint256 amount,
        bytes32 bscTxHash
    ) external onlyBridgeRelayer nonReentrant validAmount(amount) {
        if (buyer == address(0)) revert ZeroAddress();
        if (_bscOrderFillUsed[dscOrderId][bscOrderId]) revert BscOrderAlreadyLinked();
        
        Order storage order = _orders[dscOrderId];
        
        if (order.status == OrderStatus.NONE) revert OrderNotFound();
        if (order.status != OrderStatus.OPEN && order.status != OrderStatus.PARTIALLY_FILLED) {
            revert InvalidOrderStatus();
        }
        if (block.timestamp > order.expiresAt) revert OrderExpired();
        
        uint256 remainingAmount = order.amount - order.filledAmount;
        if (amount > remainingAmount) revert FillAmountExceedsRemaining();
        
        // Mark BSC order as used for this DSC order
        _bscOrderFillUsed[dscOrderId][bscOrderId] = true;
        
        // Update order
        order.filledAmount += amount;
        bool isComplete = order.filledAmount == order.amount;
        order.status = isComplete ? OrderStatus.COMPLETED : OrderStatus.PARTIALLY_FILLED;
        
        // Record fill
        _orderFills[dscOrderId].push(Fill({
            bscOrderId: bscOrderId,
            counterparty: buyer,
            amount: amount,
            timestamp: block.timestamp,
            bscTxHash: bscTxHash
        }));
        
        // Update totals
        _userLockedAmount[order.user] -= amount;
        totalLocked -= amount;
        
        // Release DEP20 to buyer
        DEP20_USDT.safeTransfer(buyer, amount);
        
        emit OrderFilled(dscOrderId, bscOrderId, buyer, amount, !isComplete);
        emit FundsReleased(dscOrderId, buyer, amount, bscTxHash);
        
        if (isComplete) {
            emit OrderCompleted(dscOrderId, order.user, order.amount, _orderFills[dscOrderId].length);
        }
    }
    
    /**
     * @notice Complete a FILL_BSC_BUY order - release DEP20 to BSC buyer
     * @dev Called by relayer after confirming BSC side released BEP20
     * @param dscOrderId The DSC fill order ID
     * @param bscTxHash Transaction hash from BSC as proof
     */
    function completeFillOrder(
        uint256 dscOrderId,
        bytes32 bscTxHash
    ) external onlyBridgeRelayer nonReentrant {
        Order storage order = _orders[dscOrderId];
        
        if (order.status == OrderStatus.NONE) revert OrderNotFound();
        if (order.orderType != OrderType.FILL_BSC_BUY) revert InvalidOrderStatus();
        if (order.status != OrderStatus.OPEN) revert InvalidOrderStatus();
        
        uint256 amount = order.amount;
        address buyer = order.linkedBscBuyer;
        address seller = order.user;
        uint256 bscOrderId = order.linkedBscOrderId;
        
        // Update order
        order.status = OrderStatus.COMPLETED;
        order.filledAmount = amount;
        
        // Record fill
        _orderFills[dscOrderId].push(Fill({
            bscOrderId: bscOrderId,
            counterparty: buyer,
            amount: amount,
            timestamp: block.timestamp,
            bscTxHash: bscTxHash
        }));
        
        // Update totals
        _userLockedAmount[seller] -= amount;
        totalLocked -= amount;
        
        // Release DEP20 to BSC buyer
        DEP20_USDT.safeTransfer(buyer, amount);
        
        emit OrderFilled(dscOrderId, bscOrderId, buyer, amount, false);
        emit FundsReleased(dscOrderId, buyer, amount, bscTxHash);
        emit OrderCompleted(dscOrderId, seller, amount, 1);
    }
    
    /**
     * @notice Batch complete multiple fill orders
     */
    function batchCompleteFillOrders(
        uint256[] calldata dscOrderIds,
        bytes32[] calldata bscTxHashes
    ) external onlyBridgeRelayer nonReentrant {
        require(dscOrderIds.length == bscTxHashes.length, "Array length mismatch");
        
        for (uint256 i = 0; i < dscOrderIds.length; i++) {
            _completeFillOrderInternal(dscOrderIds[i], bscTxHashes[i]);
        }
    }
    
    function _completeFillOrderInternal(uint256 dscOrderId, bytes32 bscTxHash) internal {
        Order storage order = _orders[dscOrderId];
        
        if (order.status == OrderStatus.NONE) return;
        if (order.orderType != OrderType.FILL_BSC_BUY) return;
        if (order.status != OrderStatus.OPEN) return;
        
        uint256 amount = order.amount;
        address buyer = order.linkedBscBuyer;
        address seller = order.user;
        uint256 bscOrderId = order.linkedBscOrderId;
        
        order.status = OrderStatus.COMPLETED;
        order.filledAmount = amount;
        
        _orderFills[dscOrderId].push(Fill({
            bscOrderId: bscOrderId,
            counterparty: buyer,
            amount: amount,
            timestamp: block.timestamp,
            bscTxHash: bscTxHash
        }));
        
        _userLockedAmount[seller] -= amount;
        totalLocked -= amount;
        
        DEP20_USDT.safeTransfer(buyer, amount);
        
        emit OrderFilled(dscOrderId, bscOrderId, buyer, amount, false);
        emit FundsReleased(dscOrderId, buyer, amount, bscTxHash);
        emit OrderCompleted(dscOrderId, seller, amount, 1);
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
        uint256 linkedBscOrderId,
        address linkedBscBuyer,
        uint256 fillCount
    ) {
        Order storage order = _orders[orderId];
        return (
            order.amount - order.filledAmount,
            order.createdAt,
            order.linkedBscOrderId,
            order.linkedBscBuyer,
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
    
    function getDscOrderForBscOrder(uint256 bscOrderId) external view returns (uint256) {
        return _bscOrderToDscOrder[bscOrderId];
    }
    
    /**
     * @notice Get all open sell orders (for relayer matching)
     */
    function getOpenSellOrders(uint256 offset, uint256 limit) external view returns (
        uint256[] memory orderIds,
        address[] memory users,
        uint256[] memory amounts,
        uint256[] memory remainingAmounts,
        uint256[] memory expiresAts
    ) {
        // Count open sell orders
        uint256 count = 0;
        for (uint256 i = 1; i <= _orderCounter; i++) {
            Order storage o = _orders[i];
            if (o.orderType == OrderType.SELL 
                && (o.status == OrderStatus.OPEN || o.status == OrderStatus.PARTIALLY_FILLED)
                && block.timestamp <= o.expiresAt) {
                count++;
            }
        }
        
        uint256 start = offset > count ? count : offset;
        uint256 resultSize = count > start ? count - start : 0;
        if (resultSize > limit) resultSize = limit;
        
        orderIds = new uint256[](resultSize);
        users = new address[](resultSize);
        amounts = new uint256[](resultSize);
        remainingAmounts = new uint256[](resultSize);
        expiresAts = new uint256[](resultSize);
        
        uint256 idx = 0;
        uint256 skipped = 0;
        for (uint256 i = 1; i <= _orderCounter && idx < resultSize; i++) {
            Order storage o = _orders[i];
            if (o.orderType == OrderType.SELL 
                && (o.status == OrderStatus.OPEN || o.status == OrderStatus.PARTIALLY_FILLED)
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
    
    /**
     * @notice Get all pending fill orders (BSC buy fills waiting for completion)
     */
    function getPendingFillOrders(uint256 offset, uint256 limit) external view returns (
        uint256[] memory orderIds,
        address[] memory sellers,
        address[] memory buyers,
        uint256[] memory amounts,
        uint256[] memory bscOrderIds
    ) {
        // Count pending fill orders
        uint256 count = 0;
        for (uint256 i = 1; i <= _orderCounter; i++) {
            Order storage o = _orders[i];
            if (o.orderType == OrderType.FILL_BSC_BUY 
                && o.status == OrderStatus.OPEN
                && block.timestamp <= o.expiresAt) {
                count++;
            }
        }
        
        uint256 start = offset > count ? count : offset;
        uint256 resultSize = count > start ? count - start : 0;
        if (resultSize > limit) resultSize = limit;
        
        orderIds = new uint256[](resultSize);
        sellers = new address[](resultSize);
        buyers = new address[](resultSize);
        amounts = new uint256[](resultSize);
        bscOrderIds = new uint256[](resultSize);
        
        uint256 idx = 0;
        uint256 skipped = 0;
        for (uint256 i = 1; i <= _orderCounter && idx < resultSize; i++) {
            Order storage o = _orders[i];
            if (o.orderType == OrderType.FILL_BSC_BUY 
                && o.status == OrderStatus.OPEN
                && block.timestamp <= o.expiresAt) {
                if (skipped < offset) {
                    skipped++;
                } else {
                    orderIds[idx] = i;
                    sellers[idx] = o.user;
                    buyers[idx] = o.linkedBscBuyer;
                    amounts[idx] = o.amount;
                    bscOrderIds[idx] = o.linkedBscOrderId;
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
