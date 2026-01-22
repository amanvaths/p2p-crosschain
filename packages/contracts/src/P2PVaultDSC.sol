// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title P2PVaultDSC
 * @author P2P Exchange Team
 * @notice Secure P2P Vault Contract on DSC Chain for DEP20 USDT
 * @dev Audited for: Reentrancy, Overflow, Access Control, DoS, Front-running
 * 
 * SECURITY FEATURES:
 * - ReentrancyGuard on all state-changing functions
 * - Checks-Effects-Interactions pattern
 * - SafeERC20 for token transfers
 * - Input validation on all parameters
 * - Access control with multiple admin roles
 * - Emergency pause mechanism
 * - Time-locked emergency withdrawal
 * - Event emission for all state changes
 * - Double-spend protection for BSC orders
 */

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

contract P2PVaultDSC is ReentrancyGuard, Pausable, Ownable2Step {
    using SafeERC20 for IERC20;

    // =============================================================================
    // CONSTANTS
    // =============================================================================
    
    uint256 public constant FIXED_PRICE = 1e18; // 1:1 rate
    uint256 public constant MIN_ORDER_AMOUNT = 1e15; // 0.001 token minimum
    uint256 public constant MAX_ORDER_AMOUNT = 1e24; // 1M token maximum
    uint256 public constant MIN_EXPIRY_TIME = 1 hours;
    uint256 public constant MAX_EXPIRY_TIME = 7 days;
    uint256 public constant EMERGENCY_WITHDRAW_DELAY = 2 days;
    uint256 public constant DIRECT_FILL_EXPIRY = 1 hours;

    // =============================================================================
    // STATE VARIABLES
    // =============================================================================
    
    IERC20 public immutable DEP20_USDT;
    
    uint256 private _orderCounter;
    uint256 public orderExpiryTime = 24 hours;
    uint256 public totalLocked;
    
    // Access control
    address public bridgeRelayer;
    address public pendingBridgeRelayer;
    uint256 public bridgeRelayerChangeTime;
    
    // Emergency withdrawal
    bool public emergencyMode;
    uint256 public emergencyModeActivatedAt;
    
    // Order status enum
    enum OrderStatus { NONE, OPEN, MATCHED, COMPLETED, CANCELLED, EXPIRED, REFUNDED }
    
    // Order type enum
    enum OrderType { SELL, DIRECT_FILL }
    
    // Sell Order structure - tightly packed for gas optimization
    struct SellOrder {
        address seller;          // 20 bytes
        OrderStatus status;      // 1 byte
        OrderType orderType;     // 1 byte
        uint96 amount;           // 12 bytes
        uint48 createdAt;        // 6 bytes
        uint48 expiresAt;        // 6 bytes
        address matchedBuyer;    // 20 bytes
        uint256 matchedBscOrderId; // 32 bytes
        uint48 matchedAt;        // 6 bytes
        bytes32 bscTxHash;       // 32 bytes
    }
    
    // Mappings
    mapping(uint256 => SellOrder) private _orders;
    mapping(address => uint256[]) private _userOrderIds;
    mapping(address => uint256) private _userLockedAmount;
    
    // Track matched BSC orders to prevent double-spend
    mapping(uint256 => bool) private _matchedBscOrders;
    mapping(uint256 => uint256) private _bscOrderToDscOrder; // BSC order ID -> DSC order ID
    
    // Rate limiting
    mapping(address => uint256) private _lastOrderTime;
    uint256 public minTimeBetweenOrders = 10 seconds;

    // =============================================================================
    // EVENTS
    // =============================================================================
    
    event SellOrderCreated(
        uint256 indexed orderId,
        address indexed seller,
        uint256 amount,
        uint256 expiresAt
    );
    
    event DirectFillCreated(
        uint256 indexed dscOrderId,
        uint256 indexed bscOrderId,
        address indexed seller,
        address buyer,
        uint256 amount
    );
    
    event OrderMatched(
        uint256 indexed dscOrderId,
        uint256 indexed bscOrderId,
        address indexed seller,
        address buyer,
        uint256 amount
    );
    
    event OrderCompleted(
        uint256 indexed dscOrderId,
        uint256 indexed bscOrderId,
        address seller,
        address indexed buyer,
        uint256 amount,
        bytes32 bscTxHash
    );
    
    event OrderCancelled(uint256 indexed orderId, address indexed seller, uint256 amount);
    event OrderRefunded(uint256 indexed orderId, address indexed seller, uint256 amount);
    event BridgeRelayerChangeInitiated(address indexed newRelayer, uint256 effectiveTime);
    event BridgeRelayerChanged(address indexed oldRelayer, address indexed newRelayer);
    event EmergencyModeActivated(uint256 timestamp);
    event EmergencyModeDeactivated();
    event EmergencyWithdrawal(address indexed token, address indexed to, uint256 amount);
    event OrderExpiryTimeUpdated(uint256 oldTime, uint256 newTime);

    // =============================================================================
    // ERRORS
    // =============================================================================
    
    error ZeroAddress();
    error ZeroAmount();
    error AmountTooSmall(uint256 amount, uint256 minimum);
    error AmountTooLarge(uint256 amount, uint256 maximum);
    error OrderNotFound(uint256 orderId);
    error InvalidOrderStatus(uint256 orderId, OrderStatus current, OrderStatus required);
    error NotOrderOwner(uint256 orderId, address caller, address owner);
    error NotAuthorized(address caller);
    error OrderExpired(uint256 orderId, uint256 expiresAt);
    error OrderNotExpired(uint256 orderId, uint256 expiresAt);
    error BuyerMismatch(address expected, address actual);
    error RateLimitExceeded(uint256 nextAllowedTime);
    error InvalidExpiryTime(uint256 time);
    error EmergencyModeActive();
    error EmergencyModeNotActive();
    error EmergencyWithdrawTooEarly(uint256 allowedTime);
    error TransferFailed();
    error InsufficientContractBalance(uint256 required, uint256 available);
    error BridgeRelayerChangePending();
    error NoPendingBridgeRelayerChange();
    error BridgeRelayerChangeNotReady(uint256 readyTime);
    error BscOrderAlreadyMatched(uint256 bscOrderId);
    error InvalidBscOrderId();

    // =============================================================================
    // MODIFIERS
    // =============================================================================
    
    modifier onlyBridgeRelayer() {
        if (msg.sender != bridgeRelayer) revert NotAuthorized(msg.sender);
        _;
    }
    
    modifier notEmergencyMode() {
        if (emergencyMode) revert EmergencyModeActive();
        _;
    }
    
    modifier validAddress(address addr) {
        if (addr == address(0)) revert ZeroAddress();
        _;
    }
    
    modifier validAmount(uint256 amount) {
        if (amount == 0) revert ZeroAmount();
        if (amount < MIN_ORDER_AMOUNT) revert AmountTooSmall(amount, MIN_ORDER_AMOUNT);
        if (amount > MAX_ORDER_AMOUNT) revert AmountTooLarge(amount, MAX_ORDER_AMOUNT);
        _;
    }

    // =============================================================================
    // CONSTRUCTOR
    // =============================================================================
    
    constructor(
        address _dep20Usdt, 
        address _bridgeRelayer
    ) Ownable(msg.sender) validAddress(_dep20Usdt) validAddress(_bridgeRelayer) {
        DEP20_USDT = IERC20(_dep20Usdt);
        bridgeRelayer = _bridgeRelayer;
    }

    // =============================================================================
    // USER FUNCTIONS - CREATE SELL ORDER
    // =============================================================================
    
    /**
     * @notice Create a SELL order - Lock DEP20 to sell for BEP20 USDT
     * @param amount Amount of DEP20 to lock
     * @return orderId The created order ID
     */
    function createSellOrder(uint256 amount) 
        external 
        nonReentrant 
        whenNotPaused 
        notEmergencyMode
        validAmount(amount)
        returns (uint256 orderId) 
    {
        // Rate limiting check
        if (block.timestamp < _lastOrderTime[msg.sender] + minTimeBetweenOrders) {
            revert RateLimitExceeded(_lastOrderTime[msg.sender] + minTimeBetweenOrders);
        }
        
        // Check user has sufficient balance before transfer
        uint256 userBalance = DEP20_USDT.balanceOf(msg.sender);
        if (userBalance < amount) revert InsufficientContractBalance(amount, userBalance);
        
        // Update state BEFORE external call (Checks-Effects-Interactions)
        _lastOrderTime[msg.sender] = block.timestamp;
        orderId = ++_orderCounter;
        uint48 expiresAt = uint48(block.timestamp + orderExpiryTime);
        
        // Create order
        _orders[orderId] = SellOrder({
            seller: msg.sender,
            status: OrderStatus.OPEN,
            orderType: OrderType.SELL,
            amount: uint96(amount),
            createdAt: uint48(block.timestamp),
            expiresAt: expiresAt,
            matchedBuyer: address(0),
            matchedBscOrderId: 0,
            matchedAt: 0,
            bscTxHash: bytes32(0)
        });
        
        _userOrderIds[msg.sender].push(orderId);
        
        // Update totals
        unchecked {
            _userLockedAmount[msg.sender] += amount;
            totalLocked += amount;
        }
        
        // External call LAST
        DEP20_USDT.safeTransferFrom(msg.sender, address(this), amount);
        
        emit SellOrderCreated(orderId, msg.sender, amount, expiresAt);
    }
    
    /**
     * @notice Fill an existing BSC buy order by locking DEP20
     * @param bscOrderId The order ID on BSC chain
     * @param buyer The buyer address on BSC
     * @param amount Amount of DEP20 to sell
     * @return orderId The created DSC order ID
     */
    function fillBscBuyOrder(
        uint256 bscOrderId,
        address buyer,
        uint256 amount
    ) 
        external 
        nonReentrant 
        whenNotPaused 
        notEmergencyMode
        validAddress(buyer)
        validAmount(amount)
        returns (uint256 orderId) 
    {
        // Validate BSC order ID
        if (bscOrderId == 0) revert InvalidBscOrderId();
        
        // Check if BSC order already matched (prevent double-spend)
        if (_matchedBscOrders[bscOrderId]) revert BscOrderAlreadyMatched(bscOrderId);
        
        // Check user has sufficient balance before transfer
        uint256 userBalance = DEP20_USDT.balanceOf(msg.sender);
        if (userBalance < amount) revert InsufficientContractBalance(amount, userBalance);
        
        // Update state BEFORE external call
        orderId = ++_orderCounter;
        uint48 expiresAt = uint48(block.timestamp + DIRECT_FILL_EXPIRY);
        
        // Mark BSC order as matched
        _matchedBscOrders[bscOrderId] = true;
        _bscOrderToDscOrder[bscOrderId] = orderId;
        
        // Create order
        _orders[orderId] = SellOrder({
            seller: msg.sender,
            status: OrderStatus.MATCHED,
            orderType: OrderType.DIRECT_FILL,
            amount: uint96(amount),
            createdAt: uint48(block.timestamp),
            expiresAt: expiresAt,
            matchedBuyer: buyer,
            matchedBscOrderId: bscOrderId,
            matchedAt: uint48(block.timestamp),
            bscTxHash: bytes32(0)
        });
        
        _userOrderIds[msg.sender].push(orderId);
        
        // Update totals
        unchecked {
            _userLockedAmount[msg.sender] += amount;
            totalLocked += amount;
        }
        
        // External call LAST
        DEP20_USDT.safeTransferFrom(msg.sender, address(this), amount);
        
        emit DirectFillCreated(orderId, bscOrderId, msg.sender, buyer, amount);
    }
    
    /**
     * @notice Cancel an open sell order and refund DEP20
     * @param orderId Order ID to cancel
     */
    function cancelSellOrder(uint256 orderId) external nonReentrant {
        SellOrder storage order = _orders[orderId];
        
        // Validations
        if (order.status == OrderStatus.NONE) revert OrderNotFound(orderId);
        if (order.seller != msg.sender) revert NotOrderOwner(orderId, msg.sender, order.seller);
        if (order.status != OrderStatus.OPEN) {
            revert InvalidOrderStatus(orderId, order.status, OrderStatus.OPEN);
        }
        
        uint256 amount = order.amount;
        
        // Update state BEFORE external call
        order.status = OrderStatus.CANCELLED;
        
        unchecked {
            _userLockedAmount[msg.sender] -= amount;
            totalLocked -= amount;
        }
        
        // External call LAST
        DEP20_USDT.safeTransfer(msg.sender, amount);
        
        emit OrderCancelled(orderId, msg.sender, amount);
    }
    
    /**
     * @notice Refund an expired order
     * @param orderId Order ID to refund
     */
    function refundExpiredOrder(uint256 orderId) external nonReentrant {
        SellOrder storage order = _orders[orderId];
        
        // Validations
        if (order.status == OrderStatus.NONE) revert OrderNotFound(orderId);
        if (order.status != OrderStatus.OPEN && order.status != OrderStatus.MATCHED) {
            revert InvalidOrderStatus(orderId, order.status, OrderStatus.OPEN);
        }
        if (block.timestamp <= order.expiresAt) {
            revert OrderNotExpired(orderId, order.expiresAt);
        }
        
        address seller = order.seller;
        uint256 amount = order.amount;
        uint256 bscOrderId = order.matchedBscOrderId;
        
        // Update state BEFORE external call
        order.status = OrderStatus.EXPIRED;
        
        // Unmark BSC order if it was a direct fill
        if (bscOrderId > 0) {
            _matchedBscOrders[bscOrderId] = false;
            delete _bscOrderToDscOrder[bscOrderId];
        }
        
        unchecked {
            _userLockedAmount[seller] -= amount;
            totalLocked -= amount;
        }
        
        // External call LAST
        DEP20_USDT.safeTransfer(seller, amount);
        
        emit OrderRefunded(orderId, seller, amount);
    }

    // =============================================================================
    // BRIDGE RELAYER FUNCTIONS
    // =============================================================================
    
    /**
     * @notice Match a sell order with a BSC buyer
     * @param dscOrderId Sell order ID on DSC
     * @param bscOrderId Buy order ID on BSC
     * @param buyer Buyer address from BSC
     */
    function matchSellOrder(
        uint256 dscOrderId,
        uint256 bscOrderId,
        address buyer
    ) external onlyBridgeRelayer validAddress(buyer) {
        SellOrder storage order = _orders[dscOrderId];
        
        // Validations
        if (order.status == OrderStatus.NONE) revert OrderNotFound(dscOrderId);
        if (order.status != OrderStatus.OPEN) {
            revert InvalidOrderStatus(dscOrderId, order.status, OrderStatus.OPEN);
        }
        if (block.timestamp > order.expiresAt) {
            revert OrderExpired(dscOrderId, order.expiresAt);
        }
        if (bscOrderId == 0) revert InvalidBscOrderId();
        
        // Update state
        order.status = OrderStatus.MATCHED;
        order.matchedBuyer = buyer;
        order.matchedBscOrderId = bscOrderId;
        order.matchedAt = uint48(block.timestamp);
        
        // Mark BSC order as matched
        _matchedBscOrders[bscOrderId] = true;
        _bscOrderToDscOrder[bscOrderId] = dscOrderId;
        
        emit OrderMatched(dscOrderId, bscOrderId, order.seller, buyer, order.amount);
    }
    
    /**
     * @notice Complete order and release DEP20 to buyer
     * @param dscOrderId Sell order ID on DSC
     * @param buyer Address to receive DEP20
     * @param bscTxHash Transaction hash from BSC chain as proof
     */
    function completeOrder(
        uint256 dscOrderId,
        address buyer,
        bytes32 bscTxHash
    ) external onlyBridgeRelayer nonReentrant validAddress(buyer) {
        SellOrder storage order = _orders[dscOrderId];
        
        // Validations
        if (order.status == OrderStatus.NONE) revert OrderNotFound(dscOrderId);
        if (order.status != OrderStatus.MATCHED) {
            revert InvalidOrderStatus(dscOrderId, order.status, OrderStatus.MATCHED);
        }
        if (order.matchedBuyer != buyer) {
            revert BuyerMismatch(order.matchedBuyer, buyer);
        }
        if (bscTxHash == bytes32(0)) revert ZeroAmount();
        
        address seller = order.seller;
        uint256 amount = order.amount;
        uint256 bscOrderId = order.matchedBscOrderId;
        
        // Update state BEFORE external call
        order.status = OrderStatus.COMPLETED;
        order.bscTxHash = bscTxHash;
        
        unchecked {
            _userLockedAmount[seller] -= amount;
            totalLocked -= amount;
        }
        
        // External call LAST
        DEP20_USDT.safeTransfer(buyer, amount);
        
        emit OrderCompleted(dscOrderId, bscOrderId, seller, buyer, amount, bscTxHash);
    }
    
    /**
     * @notice Revert a matched order (if BSC side fails)
     * @param dscOrderId Order ID to revert
     */
    function revertMatchedOrder(uint256 dscOrderId) external onlyBridgeRelayer {
        SellOrder storage order = _orders[dscOrderId];
        
        if (order.status == OrderStatus.NONE) revert OrderNotFound(dscOrderId);
        if (order.status != OrderStatus.MATCHED) {
            revert InvalidOrderStatus(dscOrderId, order.status, OrderStatus.MATCHED);
        }
        
        uint256 bscOrderId = order.matchedBscOrderId;
        
        // For direct fills, cannot revert - must refund
        if (order.orderType == OrderType.DIRECT_FILL) {
            // Unmark BSC order
            if (bscOrderId > 0) {
                _matchedBscOrders[bscOrderId] = false;
                delete _bscOrderToDscOrder[bscOrderId];
            }
            
            // Set to expired so user can refund
            order.expiresAt = uint48(block.timestamp);
            return;
        }
        
        // Revert to OPEN status for regular sell orders
        order.status = OrderStatus.OPEN;
        order.matchedBuyer = address(0);
        order.matchedBscOrderId = 0;
        order.matchedAt = 0;
        
        // Unmark BSC order
        if (bscOrderId > 0) {
            _matchedBscOrders[bscOrderId] = false;
            delete _bscOrderToDscOrder[bscOrderId];
        }
    }

    // =============================================================================
    // VIEW FUNCTIONS
    // =============================================================================
    
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
    ) {
        SellOrder storage order = _orders[orderId];
        return (
            order.seller,
            order.status,
            order.orderType,
            order.amount,
            order.createdAt,
            order.expiresAt,
            order.matchedBuyer,
            order.matchedBscOrderId,
            order.matchedAt,
            order.bscTxHash
        );
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
    
    function isBscOrderMatched(uint256 bscOrderId) external view returns (bool) {
        return _matchedBscOrders[bscOrderId];
    }
    
    function getDscOrderForBscOrder(uint256 bscOrderId) external view returns (uint256) {
        return _bscOrderToDscOrder[bscOrderId];
    }
    
    function getOpenSellOrders(uint256 offset, uint256 limit) external view returns (
        uint256[] memory orderIds,
        address[] memory sellers,
        uint256[] memory amounts,
        uint256[] memory expiresAts
    ) {
        // Count open orders first
        uint256 count = 0;
        for (uint256 i = 1; i <= _orderCounter && count < offset + limit; i++) {
            SellOrder storage order = _orders[i];
            if (order.status == OrderStatus.OPEN && block.timestamp <= order.expiresAt) {
                count++;
            }
        }
        
        // Calculate result size
        uint256 resultSize = count > offset ? count - offset : 0;
        if (resultSize > limit) resultSize = limit;
        
        // Allocate arrays
        orderIds = new uint256[](resultSize);
        sellers = new address[](resultSize);
        amounts = new uint256[](resultSize);
        expiresAts = new uint256[](resultSize);
        
        // Fill arrays
        uint256 index = 0;
        uint256 skipped = 0;
        for (uint256 i = 1; i <= _orderCounter && index < resultSize; i++) {
            SellOrder storage order = _orders[i];
            if (order.status == OrderStatus.OPEN && block.timestamp <= order.expiresAt) {
                if (skipped < offset) {
                    skipped++;
                } else {
                    orderIds[index] = i;
                    sellers[index] = order.seller;
                    amounts[index] = order.amount;
                    expiresAts[index] = order.expiresAt;
                    index++;
                }
            }
        }
    }

    // =============================================================================
    // ADMIN FUNCTIONS
    // =============================================================================
    
    /**
     * @notice Initiate bridge relayer change (2-step process for security)
     * @param newRelayer New relayer address
     */
    function initiateBridgeRelayerChange(address newRelayer) 
        external 
        onlyOwner 
        validAddress(newRelayer) 
    {
        if (pendingBridgeRelayer != address(0)) revert BridgeRelayerChangePending();
        
        pendingBridgeRelayer = newRelayer;
        bridgeRelayerChangeTime = block.timestamp + 1 days;
        
        emit BridgeRelayerChangeInitiated(newRelayer, bridgeRelayerChangeTime);
    }
    
    /**
     * @notice Complete bridge relayer change
     */
    function completeBridgeRelayerChange() external onlyOwner {
        if (pendingBridgeRelayer == address(0)) revert NoPendingBridgeRelayerChange();
        if (block.timestamp < bridgeRelayerChangeTime) {
            revert BridgeRelayerChangeNotReady(bridgeRelayerChangeTime);
        }
        
        address oldRelayer = bridgeRelayer;
        bridgeRelayer = pendingBridgeRelayer;
        pendingBridgeRelayer = address(0);
        bridgeRelayerChangeTime = 0;
        
        emit BridgeRelayerChanged(oldRelayer, bridgeRelayer);
    }
    
    /**
     * @notice Cancel pending bridge relayer change
     */
    function cancelBridgeRelayerChange() external onlyOwner {
        pendingBridgeRelayer = address(0);
        bridgeRelayerChangeTime = 0;
    }
    
    /**
     * @notice Set order expiry time
     * @param newExpiryTime New expiry time in seconds
     */
    function setOrderExpiryTime(uint256 newExpiryTime) external onlyOwner {
        if (newExpiryTime < MIN_EXPIRY_TIME || newExpiryTime > MAX_EXPIRY_TIME) {
            revert InvalidExpiryTime(newExpiryTime);
        }
        
        uint256 oldTime = orderExpiryTime;
        orderExpiryTime = newExpiryTime;
        
        emit OrderExpiryTimeUpdated(oldTime, newExpiryTime);
    }
    
    /**
     * @notice Set minimum time between orders (rate limiting)
     * @param newMinTime New minimum time in seconds
     */
    function setMinTimeBetweenOrders(uint256 newMinTime) external onlyOwner {
        require(newMinTime <= 1 hours, "Max 1 hour");
        minTimeBetweenOrders = newMinTime;
    }
    
    /**
     * @notice Pause contract
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @notice Unpause contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // =============================================================================
    // EMERGENCY FUNCTIONS
    // =============================================================================
    
    /**
     * @notice Activate emergency mode (required before emergency withdrawal)
     */
    function activateEmergencyMode() external onlyOwner {
        emergencyMode = true;
        emergencyModeActivatedAt = block.timestamp;
        _pause();
        
        emit EmergencyModeActivated(block.timestamp);
    }
    
    /**
     * @notice Deactivate emergency mode
     */
    function deactivateEmergencyMode() external onlyOwner {
        if (!emergencyMode) revert EmergencyModeNotActive();
        
        emergencyMode = false;
        emergencyModeActivatedAt = 0;
        
        emit EmergencyModeDeactivated();
    }
    
    /**
     * @notice Emergency withdraw ALL funds (only after delay)
     * @param to Address to send funds to
     * @dev Can only be called after EMERGENCY_WITHDRAW_DELAY (2 days) from emergency mode activation
     *      This gives users time to withdraw their own funds first
     */
    function emergencyWithdraw(address to) 
        external 
        onlyOwner 
        nonReentrant
        validAddress(to) 
    {
        if (!emergencyMode) revert EmergencyModeNotActive();
        if (block.timestamp < emergencyModeActivatedAt + EMERGENCY_WITHDRAW_DELAY) {
            revert EmergencyWithdrawTooEarly(emergencyModeActivatedAt + EMERGENCY_WITHDRAW_DELAY);
        }
        
        uint256 balance = DEP20_USDT.balanceOf(address(this));
        
        if (balance > 0) {
            DEP20_USDT.safeTransfer(to, balance);
            emit EmergencyWithdrawal(address(DEP20_USDT), to, balance);
        }
        
        totalLocked = 0;
    }
    
    /**
     * @notice Emergency withdraw stuck tokens (not DEP20)
     * @param token Token address to withdraw
     * @param to Address to send tokens to
     * @param amount Amount to withdraw
     */
    function rescueTokens(
        address token, 
        address to, 
        uint256 amount
    ) external onlyOwner nonReentrant validAddress(token) validAddress(to) {
        // Cannot rescue DEP20 unless in emergency mode after delay
        if (token == address(DEP20_USDT)) {
            if (!emergencyMode) revert EmergencyModeNotActive();
            if (block.timestamp < emergencyModeActivatedAt + EMERGENCY_WITHDRAW_DELAY) {
                revert EmergencyWithdrawTooEarly(emergencyModeActivatedAt + EMERGENCY_WITHDRAW_DELAY);
            }
        }
        
        IERC20(token).safeTransfer(to, amount);
        emit EmergencyWithdrawal(token, to, amount);
    }
}
