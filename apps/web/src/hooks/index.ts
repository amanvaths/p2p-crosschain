// =============================================================================
// P2P Exchange - Hooks Index
// =============================================================================

// Vault Hooks (Main Contract Interactions)
export {
  // BSC Vault (Buy Orders)
  useCreateBuyOrder,
  useCancelBscOrder,
  useBscOrder,
  useBscOpenOrders,
  useUserBscOrders,
  
  // DSC Vault (Sell Orders / Fill Orders)
  useFillBscOrder,
  useCreateSellOrder,
  useCancelDscOrder,
  useDscOrder,
  useDscOpenOrders,
  useGetDscOrderForBscOrder,
  useUserDscOrders,
  useAllUserOrders,
  
  // Combined
  useP2POrders,
  
  // Types
  type BscOrder,
  type DscOrder,
  type UserOrderWithStatus,
} from './useP2PVault';

// Order Signing (EIP-712)
export {
  useOrderSigning,
  type SignedOrder,
} from './useOrderSigning';

// Bridge Execution
export {
  useBridgeExecution,
  BridgeStatus,
  type BridgeState,
} from './useBridgeExecution';

// Token Approval
export { useTokenApproval } from './useTokenApproval';

// Database Hooks
export {
  useDbOrders,
  useDbHistory,
  useDbStats,
  useDbUser,
  useCreateOrder as useCreateDbOrder,
} from './useDatabase';

// Integration Hook (combines all functionality)
export {
  useP2PIntegration,
  type UIOrder,
  type TransactionState,
} from './useP2PIntegration';

// Legacy hooks (for backward compatibility)
export { useOrders } from './useOrders';
