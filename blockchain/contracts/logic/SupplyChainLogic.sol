// logic/SupplyChainLogic.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Errors} from "../libraries/Errors.sol";
import {AccessControlWithOwner} from "../access/AccessControlWithOwner.sol"; // Base contract
import {RawMaterial} from "../batches/RawMaterial.sol"; // Batch types
import {Medicine} from "../batches/Medicine.sol";

/**
 * @title SupplyChainLogic (Redesigned for Robustness)
 * @dev Implements supply chain actions and inherits AccessControlWithOwner for state/logic.
 *      Meant to be called via delegatecall from SupplyChainProxy.
 *      Initialization is handled by the inherited _initializeOwner function.
 */
contract SupplyChainLogic is AccessControlWithOwner {

    // --- Supply Chain State Variables (Same as before) ---
    struct TxnLog { /* ... fields ... */
        uint index; address actor; address involvedParty; bytes32 eventCode;
        int256 latitude; int256 longitude; uint timestamp;
        bytes32 dataHash; bytes32 previousLogHash;
    }
    mapping(address => TxnLog[]) public batchLogs;
    mapping(address => bytes32) public lastLogHashForBatch;
    mapping(address => bytes32) public batchType; // TYPE_RAW_MATERIAL or TYPE_MEDICINE

    // --- Constants (Same as before) ---
    // bytes32 private constant CTX_...
    // bytes32 private constant ARG_...
    // bytes32 private constant REASON_...
    // bytes32 private constant ACTION_...
    // bytes32 private constant TYPE_...
    // bytes32 private constant LOG_...
    // (Include all original constants here)
    bytes32 private constant CTX_INTENDED_MANUFACTURER = keccak256("intendedManufacturer");
    bytes32 private constant CTX_TRANSPORTER = keccak256("transporter");
    bytes32 private constant CTX_RECEIVER = keccak256("receiver");
    bytes32 private constant CTX_BATCH_ADDRESS = keccak256("batchAddress");
    bytes32 private constant CTX_RM_BATCH_ID_ARRAY = keccak256("rawMaterialBatchIdInArray");
    bytes32 private constant ARG_QUANTITY_POSITIVE = keccak256("QuantityMustBePositive");
    bytes32 private constant ARG_EXPIRY_FUTURE = keccak256("ExpiryDateMustBeInFuture");
    bytes32 private constant ARG_RM_ARRAY_EMPTY = keccak256("RequiresAtLeastOneRawMaterial");
    bytes32 private constant ARG_UNKNOWN_ROLE_NAME = keccak256("UnknownRoleNameProvided");
    bytes32 private constant REASON_MANUFACTURER_ROLE_MISSING = keccak256("IntendedManufacturerLacksRole");
    bytes32 private constant REASON_TRANSPORTER_ROLE_MISSING = keccak256("TransporterLacksRole");
    bytes32 private constant REASON_RECEIVER_ROLE_INVALID = keccak256("ReceiverRoleInvalidForStage");
    bytes32 private constant REASON_NOT_SUPPLIER = keccak256("CallerIsNotSupplier");
    bytes32 private constant REASON_NOT_OWNER = keccak256("CallerIsNotCurrentOwner");
    bytes32 private constant REASON_NOT_ADMIN_OR_SUPPLIER = keccak256("RequiresAdminOrSupplier");
    bytes32 private constant REASON_NOT_ADMIN_OR_OWNER = keccak256("RequiresAdminOrOwner");
    bytes32 private constant REASON_RM_NOT_RECEIVED = keccak256("RawMaterialNotReceived");
    bytes32 private constant REASON_RM_WRONG_MANUFACTURER = keccak256("RawMaterialWrongManufacturer");
    bytes32 private constant REASON_RM_INVALID_CONTRACT = keccak256("RawMaterialInvalidContract");
    bytes32 private constant REASON_RM_NOT_RM_TYPE = keccak256("AddressIsNotRawMaterialBatch");
    bytes32 private constant ACTION_INITIATE_TRANSFER = keccak256("initiateTransfer");
    bytes32 private constant ACTION_RECEIVE_PACKAGE = keccak256("receivePackage");
    bytes32 private constant ACTION_FINALIZE_BATCH = keccak256("finalizeMedicineBatch");
    bytes32 private constant ACTION_DESTROY_BATCH = keccak256("markBatchDestroyed");
    bytes32 private constant ACTION_GET_RM_DETAILS = keccak256("getRawMaterialDetails");
    bytes32 private constant ACTION_GET_MED_DETAILS = keccak256("getMedicineDetails");
    bytes32 private constant TYPE_RAW_MATERIAL = keccak256("RAW_MATERIAL");
    bytes32 private constant TYPE_MEDICINE = keccak256("MEDICINE");
    bytes32 private constant LOG_RM_CREATED = keccak256("RawMaterial Created");
    bytes32 private constant LOG_MED_CREATED = keccak256("Medicine Created");
    bytes32 private constant LOG_RM_TRANSFER = keccak256("RawMaterial Transfer Initiated");
    bytes32 private constant LOG_MED_TRANSFER = keccak256("Medicine Transfer Initiated");
    bytes32 private constant LOG_RM_RECEIVED = keccak256("RawMaterial Received");
    bytes32 private constant LOG_MED_RECEIVED = keccak256("Medicine Received");
    bytes32 private constant LOG_MED_FINALIZED = keccak256("Medicine Consumed/Sold");
    bytes32 private constant LOG_RM_DESTROYED = keccak256("RawMaterial Destroyed");
    bytes32 private constant LOG_MED_DESTROYED = keccak256("Medicine Destroyed");


    // --- Events (Inherits Access Control Events) ---
    event BatchCreated(bytes32 indexed batchType, address indexed batchAddress, address indexed creator, uint timestamp);
    event TransferInitiated(address indexed batchAddress, address indexed initiator, address indexed transporter, address receiver, uint timestamp);
    event PackageReceived(address indexed batchAddress, address indexed receiver, address indexed sender, uint timestamp);
    event BatchFinalized(address indexed batchAddress, address indexed finalOwner, uint timestamp);
    event BatchDestroyed(address indexed batchAddress, address indexed actor, bytes32 reasonCode, uint timestamp);
    event LogEntryCreated(address indexed batchAddress, uint indexed index, address indexed actor, bytes32 eventCode, uint timestamp, bytes32 currentLogHash );

    // --- Initialization ---
    /**
     * @dev Public initializer called ONLY ONCE by Proxy constructor via delegatecall.
     *      Delegates *entirely* to the inherited _initializeOwner function.
     * @param deployer The address to become the initial owner and admin.
     */
    function initialize(address deployer) external {
        // This function's SOLE purpose is to be the target of the proxy's
        // initialization delegatecall. It calls the internal function which
        // handles setting owner, role admins, and granting ADMIN_ROLE.
        _initializeOwner(deployer);
    }

    // --- Batch Creation Functions (Use Inherited Role Checks) ---
    function createRawMaterial( /* ... args ... */
        bytes32 _description, uint _quantity, address _intendedManufacturer,
        int256 _latitude, int256 _longitude
    ) external returns (address batchAddress) {
        _checkSenderRole(SUPPLIER_ROLE); // Check msg.sender via inherited function

        if (_intendedManufacturer == address(0)) revert Errors.SC_InvalidAddress(CTX_INTENDED_MANUFACTURER);
        if (_quantity == 0) revert Errors.SC_ArgumentError(ARG_QUANTITY_POSITIVE);
        // Use internalHasRole for checks on others
        if (!_internalHasRole(MANUFACTURER_ROLE, _intendedManufacturer)) {
             revert Errors.SC_RoleCheckFailed(_intendedManufacturer, MANUFACTURER_ROLE, REASON_MANUFACTURER_ROLE_MISSING);
         }

        // Deployment logic...
        RawMaterial batch = new RawMaterial(address(this), _description, _quantity, msg.sender, _intendedManufacturer);
        batchAddress = address(batch);
        if (batchAddress == address(0)) revert Errors.SC_BatchCreationFailed(TYPE_RAW_MATERIAL);

        // State Update & Logging...
        batchType[batchAddress] = TYPE_RAW_MATERIAL;
        bytes32 dataHash = keccak256(abi.encode(_description, _quantity, _intendedManufacturer));
        _logTransaction(batchAddress, msg.sender, _intendedManufacturer, LOG_RM_CREATED, _latitude, _longitude, dataHash);
        emit BatchCreated(TYPE_RAW_MATERIAL, batchAddress, msg.sender, block.timestamp);
    }

    function createMedicine( /* ... args ... */
        bytes32 _description, uint _quantity, address[] calldata _rawMaterialBatchIds,
        uint _expiryDate, int256 _latitude, int256 _longitude
    ) external returns (address batchAddress) {
        _checkSenderRole(MANUFACTURER_ROLE); // Check msg.sender

        if (_rawMaterialBatchIds.length == 0) revert Errors.SC_ArgumentError(ARG_RM_ARRAY_EMPTY);
        if (_quantity == 0) revert Errors.SC_ArgumentError(ARG_QUANTITY_POSITIVE);
        if (_expiryDate <= block.timestamp) revert Errors.SC_ArgumentError(ARG_EXPIRY_FUTURE);

        // Raw Material Input Validation... (Using _internalHasRole if needed)
        for (uint i = 0; i < _rawMaterialBatchIds.length; i++) {
            // ... existing checks ...
            // Example: Check if batch type is correct
             address rmAddr = _rawMaterialBatchIds[i];
             if (rmAddr == address(0)) revert Errors.SC_InvalidAddress(CTX_RM_BATCH_ID_ARRAY);
             if(batchType[rmAddr] != TYPE_RAW_MATERIAL) revert Errors.SC_RawMaterialValidationFailed(rmAddr, REASON_RM_NOT_RM_TYPE);
             try RawMaterial(rmAddr).getDetails() returns ( bytes32, uint, address, address intendedM, uint, RawMaterial.Status status, address, uint ) {
                 if (status != RawMaterial.Status.Received) revert Errors.SC_RawMaterialValidationFailed(rmAddr, REASON_RM_NOT_RECEIVED);
                 if (intendedM != msg.sender) revert Errors.SC_RawMaterialValidationFailed(rmAddr, REASON_RM_WRONG_MANUFACTURER);
             } catch (bytes memory lowLevelData) { revert Errors.SC_ExternalCallFailed(rmAddr, ACTION_GET_RM_DETAILS, lowLevelData); }
        }


        // Deployment logic...
        Medicine batch = new Medicine(address(this), _description, _quantity, _rawMaterialBatchIds, msg.sender, _expiryDate);
        batchAddress = address(batch);
        if (batchAddress == address(0)) revert Errors.SC_BatchCreationFailed(TYPE_MEDICINE);


        // State Update & Logging...
        batchType[batchAddress] = TYPE_MEDICINE;
        bytes32 dataHash = keccak256(abi.encode(_description, _quantity, _rawMaterialBatchIds, _expiryDate));
        _logTransaction(batchAddress, msg.sender, address(0), LOG_MED_CREATED, _latitude, _longitude, dataHash);
        emit BatchCreated(TYPE_MEDICINE, batchAddress, msg.sender, block.timestamp);
    }

    // --- Batch Lifecycle Functions (Use Inherited Role Checks) ---
    function initiateTransfer( /* ... args ... */
        address _batchAddress, address _transporter, address _receiver,
        int256 _latitude, int256 _longitude
    ) external {
        address sender = msg.sender; // Original caller
        // Argument Validation...
        if (_batchAddress == address(0)) revert Errors.SC_InvalidAddress(CTX_BATCH_ADDRESS);
        if (_transporter == address(0)) revert Errors.SC_InvalidAddress(CTX_TRANSPORTER);
        if (_receiver == address(0)) revert Errors.SC_InvalidAddress(CTX_RECEIVER);


        // Role/Type Validation (Use internalHasRole for checks on OTHERS)
        if (!_internalHasRole(TRANSPORTER_ROLE, _transporter)) {
            revert Errors.SC_RoleCheckFailed(_transporter, TRANSPORTER_ROLE, REASON_TRANSPORTER_ROLE_MISSING);
        }
        // ... rest of validation and logic using sender and _internalHasRole ...
        // (Keep original logic, just ensure role checks use base contract helpers)
        bytes32 _type = batchType[_batchAddress];
        if (_type == bytes32(0)) revert Errors.SC_BatchTypeUnknownOrActionFailed(_batchAddress, ACTION_INITIATE_TRANSFER);

        bytes32 eventDataHash = keccak256(abi.encode(_transporter, _receiver));
        bytes32 logCode;

        if (_type == TYPE_RAW_MATERIAL) {
            RawMaterial rm = RawMaterial(_batchAddress);
            if (rm.supplier() != sender) revert Errors.SC_UnauthorizedActor(sender, REASON_NOT_SUPPLIER); // Check sender directly
            if (rm.intendedManufacturer() != _receiver) revert Errors.SC_ReceiverMismatch(_batchAddress, rm.intendedManufacturer(), _receiver);
            if (!_internalHasRole(MANUFACTURER_ROLE, _receiver)) revert Errors.SC_RoleCheckFailed(_receiver, MANUFACTURER_ROLE, REASON_MANUFACTURER_ROLE_MISSING); // Check receiver role

            try rm.setInTransit(_transporter) { logCode = LOG_RM_TRANSFER; }
            catch (bytes memory lowLevelData) { revert Errors.SC_ExternalCallFailed(_batchAddress, ACTION_INITIATE_TRANSFER, lowLevelData); }
        } else { // TYPE_MEDICINE
            Medicine med = Medicine(_batchAddress);
            if (med.currentOwner() != sender) revert Errors.SC_UnauthorizedActor(sender, REASON_NOT_OWNER); // Check sender directly

            Medicine.Status currentStatus = med.status();
            Medicine.Status nextTransitStatus;
            if (currentStatus == Medicine.Status.Created) {
                _checkSenderRole(MANUFACTURER_ROLE); // Check sender role
                if (_internalHasRole(WHOLESALER_ROLE, _receiver)) { nextTransitStatus = Medicine.Status.InTransitToW; }
                else if (_internalHasRole(DISTRIBUTOR_ROLE, _receiver)) { nextTransitStatus = Medicine.Status.InTransitToD; }
                else { revert Errors.SC_InvalidReceiverRole(_receiver, bytes32(0)); } // Check receiver roles
            } else if (currentStatus == Medicine.Status.AtWholesaler) {
                 _checkSenderRole(WHOLESALER_ROLE); // Check sender role
                 if (!_internalHasRole(DISTRIBUTOR_ROLE, _receiver)) revert Errors.SC_RoleCheckFailed(_receiver, DISTRIBUTOR_ROLE, REASON_RECEIVER_ROLE_INVALID); // Check receiver role
                 nextTransitStatus = Medicine.Status.InTransitToD;
            } else if (currentStatus == Medicine.Status.AtDistributor) {
                  _checkSenderRole(DISTRIBUTOR_ROLE); // Check sender role
                  if (!_internalHasRole(CUSTOMER_ROLE, _receiver)) revert Errors.SC_RoleCheckFailed(_receiver, CUSTOMER_ROLE, REASON_RECEIVER_ROLE_INVALID); // Check receiver role
                 nextTransitStatus = Medicine.Status.InTransitToC;
            } else { revert Errors.SC_InvalidStateForAction(_batchAddress, uint8(currentStatus), ACTION_INITIATE_TRANSFER); }

            try med.setInTransit(nextTransitStatus, _transporter, _receiver) { logCode = LOG_MED_TRANSFER; }
            catch (bytes memory lowLevelData) { revert Errors.SC_ExternalCallFailed(_batchAddress, ACTION_INITIATE_TRANSFER, lowLevelData); }
        }
         // Logging & Event
        _logTransaction(_batchAddress, sender, _transporter, logCode, _latitude, _longitude, eventDataHash);
        emit TransferInitiated(_batchAddress, sender, _transporter, _receiver, block.timestamp);

    }

    function receivePackage( /* ... args ... */
         address _batchAddress, int256 _latitude, int256 _longitude
    ) external {
        address sender = msg.sender; // Original caller (the receiver)
        // Argument/Type Validation...
        if (_batchAddress == address(0)) revert Errors.SC_InvalidAddress(CTX_BATCH_ADDRESS);
        bytes32 _type = batchType[_batchAddress];
        if (_type == bytes32(0)) revert Errors.SC_BatchTypeUnknownOrActionFailed(_batchAddress, ACTION_RECEIVE_PACKAGE);

        // ... rest of validation and logic using sender and _checkSenderRole ...
        // (Keep original logic, ensure role checks use base contract helpers)
        bytes32 eventDataHash = keccak256(abi.encode("RECEIVE", sender));
        bytes32 logCode;
        address previousHolder = address(0);
        address transporter = address(0);

        if (_type == TYPE_RAW_MATERIAL) {
            RawMaterial rm = RawMaterial(_batchAddress);
            if (rm.intendedManufacturer() != sender) revert Errors.SC_ReceiverMismatch(_batchAddress, rm.intendedManufacturer(), sender);
            _checkSenderRole(MANUFACTURER_ROLE); // Check receiver (sender) role

            previousHolder = rm.supplier();
            transporter = rm.currentTransporter();

            try rm.setReceived() { logCode = LOG_RM_RECEIVED; }
            catch (bytes memory lowLevelData) { revert Errors.SC_ExternalCallFailed(_batchAddress, ACTION_RECEIVE_PACKAGE, lowLevelData); }
        } else { // TYPE_MEDICINE
            Medicine med = Medicine(_batchAddress);
             if (med.currentDestination() != sender) revert Errors.SC_ReceiverMismatch(_batchAddress, med.currentDestination(), sender);

            previousHolder = med.currentOwner();
            transporter = med.currentTransporter();
            Medicine.Status currentStatus = med.status();
            Medicine.Status nextStatus;
            bytes32 requiredReceiverRole; // Check sender against this role

            if (currentStatus == Medicine.Status.InTransitToW) { nextStatus = Medicine.Status.AtWholesaler; requiredReceiverRole = WHOLESALER_ROLE; }
            else if (currentStatus == Medicine.Status.InTransitToD) { nextStatus = Medicine.Status.AtDistributor; requiredReceiverRole = DISTRIBUTOR_ROLE; }
            else if (currentStatus == Medicine.Status.InTransitToC) { nextStatus = Medicine.Status.AtCustomer; requiredReceiverRole = CUSTOMER_ROLE; }
            else { revert Errors.SC_InvalidStateForAction(_batchAddress, uint8(currentStatus), ACTION_RECEIVE_PACKAGE); }

            _checkSenderRole(requiredReceiverRole); // Check receiver (sender) role

            try med.setReceived(nextStatus, sender) { logCode = LOG_MED_RECEIVED; }
            catch (bytes memory lowLevelData) { revert Errors.SC_ExternalCallFailed(_batchAddress, ACTION_RECEIVE_PACKAGE, lowLevelData); }
        }
         // Logging & Event
        _logTransaction(_batchAddress, sender, transporter, logCode, _latitude, _longitude, eventDataHash);
        emit PackageReceived(_batchAddress, sender, previousHolder, block.timestamp);

    }

    function finalizeMedicineBatch( /* ... args ... */
        address _batchAddress, int256 _latitude, int256 _longitude
    ) external {
        _checkSenderRole(CUSTOMER_ROLE); // Check msg.sender role

        if (_batchAddress == address(0)) revert Errors.SC_InvalidAddress(CTX_BATCH_ADDRESS);
        if (batchType[_batchAddress] != TYPE_MEDICINE) revert Errors.SC_BatchTypeUnknownOrActionFailed(_batchAddress, ACTION_FINALIZE_BATCH);

        Medicine med = Medicine(_batchAddress);
        if (med.currentOwner() != msg.sender) revert Errors.SC_UnauthorizedActor(msg.sender, REASON_NOT_OWNER);

        // Action
        try med.setConsumedOrSold() {
             bytes32 dataHash = keccak256(abi.encode("FINALIZED", msg.sender));
             _logTransaction(_batchAddress, msg.sender, address(0), LOG_MED_FINALIZED, _latitude, _longitude, dataHash);
             emit BatchFinalized(_batchAddress, msg.sender, block.timestamp);
        } catch (bytes memory lowLevelData) { revert Errors.SC_ExternalCallFailed(_batchAddress, ACTION_FINALIZE_BATCH, lowLevelData); }
    }

    function markBatchDestroyed( /* ... args ... */
        address _batchAddress, bytes32 _reasonCode, int256 _latitude, int256 _longitude
    ) external {
        address sender = msg.sender;
        if (_batchAddress == address(0)) revert Errors.SC_InvalidAddress(CTX_BATCH_ADDRESS);
        bytes32 _type = batchType[_batchAddress];
        if (_type == bytes32(0)) revert Errors.SC_BatchTypeUnknownOrActionFailed(_batchAddress, ACTION_DESTROY_BATCH);

        // Authorization (Check if sender is Admin OR appropriate batch owner/supplier)
        bool isAdmin = _internalHasRole(ADMIN_ROLE, sender); // Use internal check
        bytes32 dataHash = keccak256(abi.encode("DESTROYED", _reasonCode));
        bytes32 logCode;

        if (_type == TYPE_RAW_MATERIAL) {
            RawMaterial rm = RawMaterial(_batchAddress);
            if (!isAdmin && rm.supplier() != sender) { // Check if not admin AND not supplier
                revert Errors.SC_UnauthorizedActor(sender, REASON_NOT_ADMIN_OR_SUPPLIER);
            }
            try rm.setDestroyed(_reasonCode) { logCode = LOG_RM_DESTROYED; }
            catch (bytes memory lowLevelData) { revert Errors.SC_ExternalCallFailed(_batchAddress, ACTION_DESTROY_BATCH, lowLevelData); }
        } else { // TYPE_MEDICINE
            Medicine med = Medicine(_batchAddress);
            if (!isAdmin && med.currentOwner() != sender) { // Check if not admin AND not current owner
                revert Errors.SC_UnauthorizedActor(sender, REASON_NOT_ADMIN_OR_OWNER);
            }
            try med.setDestroyed(_reasonCode) { logCode = LOG_MED_DESTROYED; }
            catch (bytes memory lowLevelData) { revert Errors.SC_ExternalCallFailed(_batchAddress, ACTION_DESTROY_BATCH, lowLevelData); }
        }
        // Logging & Event
        _logTransaction(_batchAddress, sender, address(0), logCode, _latitude, _longitude, dataHash);
        emit BatchDestroyed(_batchAddress, sender, _reasonCode, block.timestamp);
    }

    // --- Role Management Wrappers (Public Interface) ---
    // These simply delegate to the internal functions inherited from AccessControlWithOwner.
    // Authorization checks happen inside those internal functions using msg.sender.

    function grantRole(bytes32 role, address account) external {
        _grantRole(role, account, msg.sender); // Delegate with sender context
    }

    function revokeRole(bytes32 role, address account) external {
        _revokeRole(role, account, msg.sender); // Delegate with sender context
    }

    function setRoleAdmin(bytes32 role, bytes32 adminRole) external {
        _setRoleAdmin(role, adminRole, msg.sender); // Delegate with sender context
    }

    function transferOwnership(address newOwner) external {
        _transferOwnership(newOwner, msg.sender); // Delegate with sender context
    }

    // --- Public Access Control View Functions ---
    // Expose role information publicly by calling inherited internal views.

    /** @notice Returns true if `account` has been granted `role`. */
    function hasRole(bytes32 role, address account) external view returns (bool) {
        return _internalHasRole(role, account); // Delegate to internal view
    }

    /** @notice Returns the admin role that controls `role`. */
    function getRoleAdmin(bytes32 role) external view returns (bytes32) {
        return _getRoleAdmin(role); // Delegate to internal view
    }

    // --- Internal Logging Function (Same as before) ---
    function _logTransaction( /* ... args ... */
        address _batchAddress, address _actor, address _involvedParty, bytes32 _eventCode,
        int256 _latitude, int256 _longitude, bytes32 _dataHash
    ) internal {
         bytes32 previousHash = lastLogHashForBatch[_batchAddress];
         TxnLog[] storage logs = batchLogs[_batchAddress];
         uint currentIndex = logs.length;
         bytes32 currentLogHash = keccak256(abi.encodePacked( // Use packed for hash efficiency
             currentIndex, _actor, _involvedParty, _eventCode,
             _latitude, _longitude, block.timestamp, _dataHash, previousHash
         ));
         logs.push(TxnLog(
             currentIndex, _actor, _involvedParty, _eventCode,
             _latitude, _longitude, block.timestamp, _dataHash, previousHash
         ));
         lastLogHashForBatch[_batchAddress] = currentLogHash;
         emit LogEntryCreated(_batchAddress, currentIndex, _actor, _eventCode, block.timestamp, currentLogHash);
    }

    // --- Internal View Functions for Batch Details (Same as before) ---
    // These are called by the Proxy's public view functions via staticcall.
    function getRawMaterialDetailsInternal(address _batchAddress) external view returns ( /* ... fields ... */
        bytes32 description, uint quantity, address supplier, address intendedManufacturer,
        uint creationTime, RawMaterial.Status status, address currentTransporter, uint lastUpdateTime
    ) {
        // Use low-level call with try/catch for robustness
        (bool success, bytes memory data) = _batchAddress.staticcall(abi.encodeWithSelector(RawMaterial.getDetails.selector));
        if(!success) {
             revert Errors.SC_ExternalCallFailed(_batchAddress, ACTION_GET_RM_DETAILS, data);
        }
        // Decode manually or assume RawMaterial returns the tuple directly if ABI matches
        (description, quantity, supplier, intendedManufacturer, creationTime, status, currentTransporter, lastUpdateTime) =
             abi.decode(data, (bytes32, uint, address, address, uint, RawMaterial.Status, address, uint));
         // return (description, quantity, supplier, intendedManufacturer, creationTime, status, currentTransporter, lastUpdateTime); // implicit return
    }

     function getMedicineDetailsInternal(address _batchAddress) external view returns ( /* ... fields ... */
        bytes32 description, uint quantity, address[] memory rawMaterialBatchIds, address manufacturer,
        uint creationTime, uint expiryDate, Medicine.Status status, address currentOwner,
        address currentTransporter, address currentDestination, uint lastUpdateTime
     ) {
        (bool success, bytes memory data) = _batchAddress.staticcall(abi.encodeWithSelector(Medicine.getDetails.selector));
         if(!success) {
             revert Errors.SC_ExternalCallFailed(_batchAddress, ACTION_GET_MED_DETAILS, data);
         }
         (description, quantity, rawMaterialBatchIds, manufacturer, creationTime, expiryDate, status, currentOwner, currentTransporter, currentDestination, lastUpdateTime) =
              abi.decode(data, (bytes32, uint, address[], address, uint, uint, Medicine.Status, address, address, address, uint));
         // return (...); // implicit return
     }

    function getTransactionHistoryInternal(address _batchAddress) external view returns (TxnLog[] memory) {
        // Existence check should happen in the proxy view function before calling this
        return batchLogs[_batchAddress];
    }

     /** @dev Gets role identifier hash from string. Reverts on unknown role. */
     function getRoleIdentifier(string calldata _roleName) external pure returns (bytes32) {
        bytes32 roleHash = keccak256(abi.encodePacked(_roleName));
        // Explicitly check against *all* known public roles
        if (roleHash == ADMIN_ROLE || roleHash == SUPPLIER_ROLE || roleHash == TRANSPORTER_ROLE ||
            roleHash == MANUFACTURER_ROLE || roleHash == WHOLESALER_ROLE || roleHash == DISTRIBUTOR_ROLE ||
            roleHash == CUSTOMER_ROLE)
        {
            return roleHash;
        }
        revert Errors.SC_ArgumentError(ARG_UNKNOWN_ROLE_NAME);
    }
    
    // Note: The public `owner` variable is inherited directly from AccessControlWithOwner
}