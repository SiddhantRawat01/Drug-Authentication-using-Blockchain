// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Forward declare enums used in errors to avoid full contract imports in the library
import {RawMaterial} from "../batches/RawMaterial.sol";
import {Medicine} from "../batches/Medicine.sol";

/**
 * @title Errors
 * @dev Centralized library for custom error definitions used across the supply chain system.
 * @notice Using bytes32 for context/reasons and uint8 for enums where applicable for gas efficiency.
 */
library Errors {
    // --- Access Control Errors ---
    error AccessControlBadAdminRole(bytes32 role);
    error AccessControlMissingRole(address account, bytes32 role);
    error AccessControlInvalidAdminRole(address account, bytes32 role);
    error AccessControlOwnerOnly();
    error AccessControlZeroAddress();
    error AccessControlCannotRevokeAdmin();
    error AccessControlCannotGrantRoleToSelf();
    error AccessControlAlreadyInitialized();
    error AccessControlCannotManageAdminRole();

    // --- Supply Chain Core Errors ---
    error SC_InvalidAddress(bytes32 context); // e.g., context = keccak256("intendedManufacturer")
    error SC_RoleCheckFailed(address target, bytes32 role, bytes32 reason); // e.g., reason = keccak256("Intended manufacturer lacks role")
    error SC_BatchCreationFailed(bytes32 batchType); // e.g., batchType = keccak256("RawMaterial")
    error SC_RawMaterialValidationFailed(address rmAddress, bytes32 reason);
    error SC_UnauthorizedActor(address actor, bytes32 reason);
    error SC_InvalidStateForAction(
        address batchAddress,
        uint8 currentStatus,
        bytes32 action
    ); // Use uint8 for enum, bytes32 for action identifier
    error SC_ReceiverMismatch(
        address batchAddress,
        address expected,
        address actual
    );
    error SC_InvalidReceiverRole(address receiver, bytes32 expectedRole);
    error SC_BatchTypeUnknownOrActionFailed(
        address batchAddress,
        bytes32 action
    );
    error SC_ArgumentError(bytes32 reason);
    error SC_ExternalCallFailed(
        address target,
        bytes32 action,
        bytes errorData
    ); // Include low-level error data if available
    error SC_HistoryUnavailable(address batchAddress);
    error SC_DelegateCallFailed(bytes32 context); // Context for delegate call failure (e.g., "initialize", "fallback")

    // --- Supply Chain Proxy Errors ---
    error PROXY_InvalidLogicAddress(); // If logic address is zero
    error PROXY_LogicAddressHasNoCode(); // If logic address is not a contract
    error PROXY_Initialize_DelegateCall_Failed(); // Generic delegatecall failure
    error PROXY_Initialize_Unexpected_Return_Data(); // If initialize returns data
    error PROXY_Owner_Mismatch_Post_Init(address expectedOwner, address actualOwner); // If owner state isn't set correctly
    error PROXY_AdminRole_Grant_Failed_Post_Init(address owner); // If owner lacks ADMIN_ROLE after init
    error Proxy_LogicAddressZero();
    error Proxy_LogicNoCode();
    error Proxy_InitFailed();
    error Proxy_OwnerMismatch();
    error Proxy_HasRoleFailed();
    error Proxy_DeployerNotAdmin();
    // --- Batch Contract Errors ---
    error Batch_UnauthorizedCaller(address caller, address expected);
    error Batch_InvalidStateForAction(uint8 current, uint8 required); // Use uint8 for enums
    error Batch_AlreadyDestroyed();
    error Med_InvalidStateTransition(uint8 current, uint8 target); // Use uint8 for enums
    error Med_AlreadyDestroyedOrFinalized();

    bytes32 internal constant CTX_LOGIC_CONTRACT = keccak256("logicContractAddress");
    // --- Coordinate Errors ---
    // Omitted detailed coordinate validation errors for brevity, but could be added
    // error SC_InvalidCoordinateValue(int256 value, bytes32 coordinateType);
}
