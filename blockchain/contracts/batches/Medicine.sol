// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Errors } from "../libraries/Errors.sol";

/**
 * @title Medicine (Simplified Batch Contract)
 * @dev Data container for medicine batches. State managed strictly by SupplyChainLogic via delegatecall.
 */
contract Medicine {
    // --- Types ---
    // Public enum accessible via Medicine.Status
    enum Status { Created, InTransitToW, AtWholesaler, InTransitToD, AtDistributor, InTransitToC, AtCustomer, ConsumedOrSold, Destroyed } // uint8

    // --- State ---
    address public immutable batchId;
    address public immutable supplyChainContract; // Authorized state modifier (SupplyChainProxy address)
    bytes32 public immutable description;
    uint public immutable quantity;
    address[] public rawMaterialBatchIds;
    address public immutable manufacturer;
    uint public immutable creationTime;
    uint public immutable expiryDate;

    Status public status; // public getter
    address public currentOwner;
    address public currentTransporter;
    address public currentDestination;
    uint public lastUpdateTime;

    // --- Events ---
    event StatusChanged(Status newStatus, uint timestamp);
    event OwnershipTransferred(address indexed from, address indexed to, uint timestamp);
    event TransporterAssigned(address indexed transporter, address indexed destination, uint timestamp);
    event BatchDestroyed(bytes32 reasonCode, uint timestamp); // Use bytes32 for reason
    event BatchFinalized(uint timestamp);

    // --- Modifiers ---
    modifier onlySupplyChain() {
        if (msg.sender != supplyChainContract) {
            revert Errors.Batch_UnauthorizedCaller(msg.sender, supplyChainContract);
        }
        _;
    }

    // --- Constructor ---
    constructor(
        address _supplyChainContract, // Address of the SupplyChainProxy
        bytes32 _description,
        uint _quantity,
        address[] memory _rawMaterialBatchIds, // SC validates non-empty
        address _manufacturer, // SC validates non-zero
        uint _expiryDate // SC validates future date
    ) {
        if (_supplyChainContract == address(0)) revert Errors.AccessControlZeroAddress();
        // quantity > 0 check done by SC

        batchId = address(this);
        supplyChainContract = _supplyChainContract;
        description = _description;
        quantity = _quantity;
        rawMaterialBatchIds = _rawMaterialBatchIds;
        manufacturer = _manufacturer;
        expiryDate = _expiryDate;
        creationTime = block.timestamp;

        status = Status.Created;
        currentOwner = _manufacturer; // Initial owner
        lastUpdateTime = block.timestamp;

        emit StatusChanged(status, lastUpdateTime);
        emit OwnershipTransferred(address(0), currentOwner, lastUpdateTime);
    }

    // --- State Transitions (ONLY callable by SupplyChain contract proxy) ---

    /**
     * @dev Sets the batch status to an InTransit state.
     * @notice Relies on SC to provide valid next status, transporter, destination and ensure valid start state.
     */
    function setInTransit(Status _nextStatus, address _transporter, address _destination) external onlySupplyChain {
        // Basic state check (must be in a 'resting' state like Created, AtWholesaler, AtDistributor)
        if (status != Status.Created && status != Status.AtWholesaler && status != Status.AtDistributor) {
            // Use a more specific error indicating an invalid starting state for transit
            revert Errors.Med_InvalidStateTransition(uint8(status), uint8(_nextStatus));
        }
        // Minimal check: ensure _nextStatus is actually an InTransit status for safety. Could be removed if SC guarantees it.
        if (_nextStatus != Status.InTransitToW && _nextStatus != Status.InTransitToD && _nextStatus != Status.InTransitToC) {
            revert Errors.Med_InvalidStateTransition(uint8(status), uint8(_nextStatus)); // Invalid target state for this function
        }
        // Assume SC validated the specific transition logic (e.g., Created -> InTransitToW is valid)

        status = _nextStatus;
        currentTransporter = _transporter;
        currentDestination = _destination;
        lastUpdateTime = block.timestamp;
        emit TransporterAssigned(_transporter, _destination, lastUpdateTime);
        emit StatusChanged(status, lastUpdateTime);
    }

    /**
     * @dev Sets the batch status upon confirmed receipt.
     * @notice Relies on SC to provide valid next status, ensure receiver matches destination, and ensure valid start state.
     */
    function setReceived(Status _nextStatus, address _receiver) external onlySupplyChain {
        // Basic state check (must be in a 'transit' state)
        if (status != Status.InTransitToW && status != Status.InTransitToD && status != Status.InTransitToC) {
             revert Errors.Med_InvalidStateTransition(uint8(status), uint8(_nextStatus)); // Invalid start state for receiving
        }
         // Minimal check: ensure _nextStatus is actually an "At" status. Could be removed if SC guarantees it.
        if (_nextStatus != Status.AtWholesaler && _nextStatus != Status.AtDistributor && _nextStatus != Status.AtCustomer) {
            revert Errors.Med_InvalidStateTransition(uint8(status), uint8(_nextStatus)); // Invalid target state for this function
        }
        // Assume SC validated the specific transition logic (e.g., InTransitToW -> AtWholesaler is valid)
        // Assume SC validated receiver == currentDestination

        address previousOwner = currentOwner;
        status = _nextStatus;
        currentOwner = _receiver; // Ownership transfers
        currentTransporter = address(0);
        currentDestination = address(0);
        lastUpdateTime = block.timestamp;

        emit OwnershipTransferred(previousOwner, currentOwner, lastUpdateTime);
        emit StatusChanged(status, lastUpdateTime);
    }

    /**
     * @dev Sets the final ConsumedOrSold status. Requires AtCustomer state.
     */
    function setConsumedOrSold() external onlySupplyChain {
        if (status != Status.AtCustomer) {
            // Use Batch_InvalidStateForAction as it's a general requirement check
            revert Errors.Batch_InvalidStateForAction(uint8(status), uint8(Status.AtCustomer));
        }
        status = Status.ConsumedOrSold;
        lastUpdateTime = block.timestamp;
        emit BatchFinalized(lastUpdateTime);
        emit StatusChanged(status, lastUpdateTime);
    }

    /**
     * @dev Sets the Destroyed status. Cannot be called if already destroyed or consumed/sold.
     */
    function setDestroyed(bytes32 _reasonCode) external onlySupplyChain {
        if (status == Status.Destroyed || status == Status.ConsumedOrSold) {
            revert Errors.Med_AlreadyDestroyedOrFinalized();
        }

        address previousOwner = currentOwner;
        status = Status.Destroyed;
        currentOwner = address(0); // No owner
        currentTransporter = address(0);
        currentDestination = address(0);
        lastUpdateTime = block.timestamp;

        emit BatchDestroyed(_reasonCode, lastUpdateTime);
        if (previousOwner != address(0)) {
            emit OwnershipTransferred(previousOwner, address(0), lastUpdateTime);
        }
        emit StatusChanged(status, lastUpdateTime);
    }

    // --- View Function ---
    // Called by SupplyChainLogic's internal view function
    function getDetails() external view returns (
        bytes32 _description, uint _quantity, address[] memory _rawMaterialBatchIds,
        address _manufacturer, uint _creationTime, uint _expiryDate, Status _status,
        address _currentOwner, address _currentTransporter, address _currentDestination,
        uint _lastUpdateTime
    ) {
        return (
            description, quantity, rawMaterialBatchIds, manufacturer, creationTime,
            expiryDate, status, currentOwner, currentTransporter, currentDestination,
            lastUpdateTime
        );
    }
}