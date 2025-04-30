// access/AccessControlWithOwner.sol (V5 - Strict Implicit Owner Admin)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Assuming Errors.sol is in ../libraries/
import {Errors} from "../libraries/Errors.sol";

/**
 * @title AccessControlWithOwner (V5 - Strict Implicit Owner Admin)
 * @dev Provides role-based access control where the contract owner ALWAYS implicitly holds ADMIN_ROLE.
 *      ADMIN_ROLE is not stored in the roles mapping and cannot be granted or revoked.
 *      Other roles are explicitly managed via the _roles mapping and admin hierarchy.
 * @notice Owner's ADMIN_ROLE status is inherent and immutable.
 *         Storage layout (owner, _roles, _roleAdmin) MUST be respected by proxies.
 */
contract AccessControlWithOwner {

    // --- State Variables ---
    address public owner; // Slot 0: Holds ADMIN_ROLE implicitly.
    mapping(bytes32 => mapping(address => bool)) internal _roles; // Slot 1+: Explicit roles (non-ADMIN)
    mapping(bytes32 => bytes32) internal _roleAdmin; // Slot 2+: Admin roles (non-ADMIN)
    uint8 private _initializing; // Initialization guard

    // --- Role Constants ---
    bytes32 public constant ADMIN_ROLE        = keccak256("ADMIN_ROLE"); // Implicitly held by owner
    bytes32 public constant SUPPLIER_ROLE     = keccak256("SUPPLIER_ROLE");
    bytes32 public constant TRANSPORTER_ROLE  = keccak256("TRANSPORTER_ROLE");
    bytes32 public constant MANUFACTURER_ROLE = keccak256("MANUFACTURER_ROLE");
    bytes32 public constant WHOLESALER_ROLE   = keccak256("WHOLESALER_ROLE");
    bytes32 public constant DISTRIBUTOR_ROLE  = keccak256("DISTRIBUTOR_ROLE");
    bytes32 public constant CUSTOMER_ROLE     = keccak256("CUSTOMER_ROLE");

    // --- Events ---
    event Initialized(uint8 version);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event RoleAdminChanged(bytes32 indexed role, bytes32 indexed previousAdminRole, bytes32 indexed newAdminRole);
    event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);

    // --- Modifier ---
    modifier initializer() {
        require(_initializing == 0, "Initializer: contract is already initialized");
        _initializing = 1;
        _;
        _initializing = 2;
    }

    // --- Initialization ---
    /** @dev Sets the initial owner and default admin roles for manageable roles. */
    function _initializeOwner(address initialOwner) internal virtual initializer {
        require(initialOwner != address(0), "Init: Initial owner cannot be zero address");
        owner = initialOwner; // Implicitly grants ADMIN_ROLE
        _initializeRoleAdminsInternal();
        emit OwnershipTransferred(address(0), initialOwner);
        emit Initialized(2); // V5 logic pattern
    }

    // --- Role Management Core Logic ---
    /** @dev Grants a *manageable* `role` (NOT ADMIN_ROLE). Reverts if role is ADMIN_ROLE. */
    function _grantRole(bytes32 role, address account, address sender) internal virtual {
        if (role == ADMIN_ROLE) revert Errors.AccessControlCannotManageAdminRole();
        _checkGrantRevokePreconditions(role, account);
        _checkAdminAuthorization(role, sender);
        _setupRoleInternal(role, account, sender);
    }

    /** @dev Revokes a *manageable* `role` (NOT ADMIN_ROLE). Reverts if role is ADMIN_ROLE. */
    function _revokeRole(bytes32 role, address account, address sender) internal virtual {
        if (role == ADMIN_ROLE) revert Errors.AccessControlCannotManageAdminRole();
        _checkGrantRevokePreconditions(role, account);
        _checkAdminAuthorization(role, sender);
        _revokeRoleInternal(role, account, sender);
    }

    /** @dev Sets the admin role for a *manageable* `role` (NOT ADMIN_ROLE). Requires owner. */
    function _setRoleAdmin(bytes32 role, bytes32 newAdminRole, address sender) internal virtual {
        if (role == ADMIN_ROLE) revert Errors.AccessControlCannotManageAdminRole();
        if (sender != owner) revert Errors.AccessControlOwnerOnly();
        _setRoleAdminInternal(role, newAdminRole);
    }

    /** @dev Transfers ownership. ADMIN_ROLE transfers implicitly. */
    function _transferOwnership(address newOwner, address sender) internal virtual {
        address currentOwner = owner;
        if (sender != currentOwner) revert Errors.AccessControlOwnerOnly();
        if (newOwner == address(0)) revert Errors.AccessControlZeroAddress();
        owner = newOwner;
        emit OwnershipTransferred(currentOwner, newOwner);
    }

    // --- Internal Helpers ---
    /** @dev Sets default admin roles (owner manages others). */
    function _initializeRoleAdminsInternal() internal {
        _roleAdmin[SUPPLIER_ROLE] = ADMIN_ROLE;
        _roleAdmin[TRANSPORTER_ROLE] = ADMIN_ROLE;
        _roleAdmin[MANUFACTURER_ROLE] = ADMIN_ROLE;
        _roleAdmin[WHOLESALER_ROLE] = ADMIN_ROLE;
        _roleAdmin[DISTRIBUTOR_ROLE] = ADMIN_ROLE;
        _roleAdmin[CUSTOMER_ROLE] = ADMIN_ROLE;
    }

    /** @dev Grants role in state map. Assumes role != ADMIN_ROLE. */
    function _setupRoleInternal(bytes32 role, address account, address eventSender) internal {
        if (!_roles[role][account]) {
            _roles[role][account] = true;
            emit RoleGranted(role, account, eventSender);
        }
    }

    /** @dev Revokes role from state map. Assumes role != ADMIN_ROLE. */
    function _revokeRoleInternal(bytes32 role, address account, address eventSender) internal {
        if (_roles[role][account]) {
            _roles[role][account] = false;
            emit RoleRevoked(role, account, eventSender);
        }
    }

    /** @dev Sets role admin in state map. Assumes role != ADMIN_ROLE. */
    function _setRoleAdminInternal(bytes32 role, bytes32 newAdminRole) internal {
        bytes32 previousAdminRole = _roleAdmin[role];
        if (previousAdminRole != newAdminRole) {
            _roleAdmin[role] = newAdminRole;
            emit RoleAdminChanged(role, previousAdminRole, newAdminRole);
        }
    }

    // --- Internal Precondition and Authorization Checks ---
    /** @dev Checks account is not zero. */
    function _checkGrantRevokePreconditions(bytes32 /* role */, address account) internal pure {
        if (account == address(0)) revert Errors.AccessControlZeroAddress();
    }

    /** @dev Checks if sender can manage 'role'. Only called for non-ADMIN_ROLE. */
    function _checkAdminAuthorization(bytes32 role, address sender) internal view {
        bytes32 adminRoleRequired = _getRoleAdmin(role);
        if (adminRoleRequired == ADMIN_ROLE) {
            // If owner (ADMIN_ROLE) manages this role, sender must be owner.
            if (sender != owner) {
                revert Errors.AccessControlInvalidAdminRole(sender, ADMIN_ROLE);
            }
        } else {
            // Otherwise, check if sender has the specific required admin role.
             if (!_internalHasRole(adminRoleRequired, sender)) {
                 revert Errors.AccessControlInvalidAdminRole(sender, adminRoleRequired);
            }
        }
    }

    // --- Internal View Functions ---
    /** @dev Checks role possession (implicit ADMIN_ROLE for owner, explicit for others). */
    function _internalHasRole(bytes32 role, address account) internal view returns (bool) {
        if (role == ADMIN_ROLE) return account == owner;
        return _roles[role][account];
    }

    /** @dev Gets the admin role for 'role'. */
    function _getRoleAdmin(bytes32 role) internal view returns (bytes32) {
        if (role == ADMIN_ROLE) return ADMIN_ROLE; // Implicitly managed by owner
        bytes32 admin = _roleAdmin[role];
        return admin == bytes32(0) ? ADMIN_ROLE : admin; // Default to ADMIN_ROLE if unset
    }

    // --- Internal Require-Style Check Functions ---
    /** @dev Reverts if account lacks role. */
    function _checkRole(bytes32 role, address account) internal view virtual {
        if (!_internalHasRole(role, account)) {
            revert Errors.AccessControlMissingRole(account, role);
        }
    }

    /** @dev Reverts if msg.sender lacks role. */
    function _checkSenderRole(bytes32 role) internal view virtual {
        if (!_internalHasRole(role, msg.sender)) {
            revert Errors.AccessControlMissingRole(msg.sender, role);
        }
    }
}