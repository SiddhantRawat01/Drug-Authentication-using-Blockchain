// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Errors } from "../libraries/Errors.sol";

/**
 * @title RawMaterial (Simplified Batch Contract)
 * @dev Data container for raw materials. State managed strictly by SupplyChainLogic via delegatecall.
 */
contract RawMaterial {
    // --- Types ---
    // Public enum accessible via RawMaterial.Status
    enum Status { Created, InTransit, Received, Destroyed } // uint8 underlying

    // --- State ---
    // Immutable state set at creation by SupplyChainLogic
    address public immutable batchId; // address(this)
    address public immutable supplyChainContract; // Authorized state modifier (SupplyChainProxy address)
    bytes32 public immutable description;
    uint public immutable quantity;
    address public immutable supplier;
    address public immutable intendedManufacturer;
    uint public immutable creationTime;

    // Dynamic State - Modified only via onlySupplyChain functions
    Status public status; // public getter created automatically
    address public currentTransporter;
    uint public lastUpdateTime;

    // --- Events ---
    event StatusChanged(Status newStatus, uint timestamp);
    event TransporterAssigned(address indexed transporter, uint timestamp);
    event BatchDestroyed(bytes32 reasonCode, uint timestamp); // Use bytes32 for reason

    // --- Modifiers ---
    modifier onlySupplyChain() {
        // Ensures only the designated SupplyChain contract (proxy) can call state-changing functions
        if (msg.sender != supplyChainContract) {
            revert Errors.Batch_UnauthorizedCaller(msg.sender, supplyChainContract);
        }
        _;
    }

    // --- Constructor ---
    // Called by SupplyChainLogic during its createRawMaterial function
    constructor(
        address _supplyChainContract, // Address of the SupplyChainProxy
        bytes32 _description,
        uint _quantity,
        address _supplier,
        address _intendedManufacturer
    ) {
        // Basic non-zero checks (SupplyChainLogic performs role/business logic checks)
        if (_supplyChainContract == address(0)) revert Errors.AccessControlZeroAddress(); // Use generic error
        if (_supplier == address(0)) revert Errors.AccessControlZeroAddress();
        if (_intendedManufacturer == address(0)) revert Errors.AccessControlZeroAddress();
        // quantity > 0 check done by SupplyChainLogic

        batchId = address(this);
        supplyChainContract = _supplyChainContract;
        description = _description;
        quantity = _quantity;
        supplier = _supplier;
        intendedManufacturer = _intendedManufacturer;
        creationTime = block.timestamp;

        status = Status.Created;
        lastUpdateTime = block.timestamp;
        emit StatusChanged(status, lastUpdateTime);
    }

    // --- State Transitions (ONLY callable by SupplyChain contract proxy) ---

    /**
     * @dev Sets status to InTransit. Requires Created state.
     * @notice Relies on SupplyChainLogic to provide a valid, non-zero transporter.
     */
    function setInTransit(address _transporter) external onlySupplyChain {
        if (status != Status.Created) {
            revert Errors.Batch_InvalidStateForAction(uint8(status), uint8(Status.Created));
        }
        // Assume SC validated _transporter is not zero address
        status = Status.InTransit;
        currentTransporter = _transporter;
        lastUpdateTime = block.timestamp;
        emit TransporterAssigned(_transporter, lastUpdateTime);
        emit StatusChanged(status, lastUpdateTime);
    }

    /**
     * @dev Sets status to Received. Requires InTransit state.
     * @notice Relies on SupplyChainLogic to ensure the caller (_receiver) matches intendedManufacturer.
     */
    function setReceived() external onlySupplyChain {
        if (status != Status.InTransit) {
            revert Errors.Batch_InvalidStateForAction(uint8(status), uint8(Status.InTransit));
        }
        // Assume SC validated receiver == intendedManufacturer
        status = Status.Received;
        currentTransporter = address(0);
        lastUpdateTime = block.timestamp;
        emit StatusChanged(status, lastUpdateTime);
    }

    /**
     * @dev Sets status to Destroyed. Can be called unless already destroyed.
     */
    function setDestroyed(bytes32 _reasonCode) external onlySupplyChain {
        if (status == Status.Destroyed) {
            revert Errors.Batch_AlreadyDestroyed();
        }
        status = Status.Destroyed;
        currentTransporter = address(0);
        lastUpdateTime = block.timestamp;
        emit BatchDestroyed(_reasonCode, lastUpdateTime);
        emit StatusChanged(status, lastUpdateTime);
    }

    // --- View Function ---
    // Called by SupplyChainLogic's internal view function
    function getDetails() external view returns (
        bytes32 _description, uint _quantity, address _supplier, address _intendedManufacturer,
        uint _creationTime, Status _status, address _currentTransporter, uint _lastUpdateTime
    ) {
        return (
            description, quantity, supplier, intendedManufacturer,
            creationTime, status, currentTransporter, lastUpdateTime
        );
    }
}