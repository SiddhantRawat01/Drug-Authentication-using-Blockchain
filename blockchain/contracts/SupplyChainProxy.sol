// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Errors} from "./libraries/Errors.sol";
import {RawMaterial} from "./batches/RawMaterial.sol";
import {Medicine} from "./batches/Medicine.sol";
import {SupplyChainLogic} from "./logic/SupplyChainLogic.sol";

contract SupplyChainProxy {
    address public owner;
    address public logicContractAddress;

    event ProxyInitialized(
        address indexed logicAddress,
        address indexed initialOwner
    );

    constructor(address logicAddress_) {
        require(logicAddress_ != address(0), "Proxy: Logic address is zero");
        logicContractAddress = logicAddress_;

        address deployer = msg.sender;
        (bool success, bytes memory returnData) = logicContractAddress
            .delegatecall(
                abi.encodeWithSelector(
                    SupplyChainLogic.initialize.selector,
                    deployer
                )
            );

        if (!success) {
            _forwardRevertData(
                returnData,
                abi.encodePacked("Proxy: Initialize reverted")
            );
        }
        require(returnData.length == 0, "Proxy: Initialize returned data");

        require(owner == deployer, "Proxy: Owner mismatch post-init");
        bytes32 adminRoleHash = _fetchAdminRoleHash();
        _verifyDeployerIsAdmin(adminRoleHash, deployer);

        emit ProxyInitialized(logicContractAddress, deployer);
    }

    function _fetchAdminRoleHash() internal view returns (bytes32) {
        (bool success, bytes memory returnData) = logicContractAddress
            .staticcall(
                abi.encodeWithSelector(bytes4(keccak256("ADMIN_ROLE()")))
            );
        _checkStaticCallSuccess(success, returnData, keccak256("ADMIN_ROLE()"));
        require(
            returnData.length == 32,
            "Proxy: ADMIN_ROLE fetch length invalid"
        );
        return abi.decode(returnData, (bytes32));
    }

    function _verifyDeployerIsAdmin(
        bytes32 adminRoleHash,
        address deployer_
    ) internal {
        bytes memory callData = abi.encodeWithSelector(
            SupplyChainLogic.hasRole.selector,
            adminRoleHash,
            deployer_
        );
        (bool success, bytes memory returnData) = logicContractAddress
            .delegatecall(callData);
        _checkStaticCallSuccess(
            success,
            returnData,
            keccak256("hasRole(bytes32,address)")
        );
        require(
            returnData.length == 32,
            "Proxy: hasRole return length invalid"
        );
        bool isAdmin = abi.decode(returnData, (bool));
        require(isAdmin, "Proxy: Deployer lacks implicit ADMIN_ROLE");
    }

    fallback() external payable {
        _delegate(logicContractAddress);
    }
    receive() external payable {
        _delegate(logicContractAddress);
    }

    // Batch Creation
    function createRawMaterial(
        bytes32 description_,
        uint quantity_,
        address intendedManufacturer_,
        int256 latitude_,
        int256 longitude_
    ) external returns (address batchAddress_) {
        bytes memory callData = abi.encodeWithSelector(
            SupplyChainLogic.createRawMaterial.selector,
            description_,
            quantity_,
            intendedManufacturer_,
            latitude_,
            longitude_
        );
        bytes memory returnData = _delegateWithValue(
            logicContractAddress,
            callData
        );
        batchAddress_ = abi.decode(returnData, (address));
    }

    function createMedicine(
        bytes32 description_,
        uint quantity_,
        address[] calldata rawMaterialBatchIds_,
        uint expiryDate_,
        int256 latitude_,
        int256 longitude_
    ) external returns (address batchAddress_) {
        bytes memory callData = abi.encodeWithSelector(
            SupplyChainLogic.createMedicine.selector,
            description_,
            quantity_,
            rawMaterialBatchIds_,
            expiryDate_,
            latitude_,
            longitude_
        );
        bytes memory returnData = _delegateWithValue(
            logicContractAddress,
            callData
        );
        batchAddress_ = abi.decode(returnData, (address));
    }

    // Batch Lifecycle Management
    function initiateTransfer(
        address batchAddress_,
        address transporter_,
        address receiver_,
        int256 latitude_,
        int256 longitude_
    ) external {
        bytes memory callData = abi.encodeWithSelector(
            SupplyChainLogic.initiateTransfer.selector,
            batchAddress_,
            transporter_,
            receiver_,
            latitude_,
            longitude_
        );
        _delegateWithoutValue(logicContractAddress, callData);
    }

    function receivePackage(
        address batchAddress_,
        int256 latitude_,
        int256 longitude_
    ) external {
        bytes memory callData = abi.encodeWithSelector(
            SupplyChainLogic.receivePackage.selector,
            batchAddress_,
            latitude_,
            longitude_
        );
        _delegateWithoutValue(logicContractAddress, callData);
    }

    function finalizeMedicineBatch(
        address batchAddress_,
        int256 latitude_,
        int256 longitude_
    ) external {
        bytes memory callData = abi.encodeWithSelector(
            SupplyChainLogic.finalizeMedicineBatch.selector,
            batchAddress_,
            latitude_,
            longitude_
        );
        _delegateWithoutValue(logicContractAddress, callData);
    }

    function markBatchDestroyed(
        address batchAddress_,
        bytes32 reasonCode_,
        int256 latitude_,
        int256 longitude_
    ) external {
        bytes memory callData = abi.encodeWithSelector(
            SupplyChainLogic.markBatchDestroyed.selector,
            batchAddress_,
            reasonCode_,
            latitude_,
            longitude_
        );
        _delegateWithoutValue(logicContractAddress, callData);
    }

    // Role Management
    function grantRole(bytes32 role_, address account_) external {
        bytes memory callData = abi.encodeWithSelector(
            SupplyChainLogic.grantRole.selector,
            role_,
            account_
        );
        _delegateWithoutValue(logicContractAddress, callData);
    }

    function revokeRole(bytes32 role_, address account_) external {
        bytes memory callData = abi.encodeWithSelector(
            SupplyChainLogic.revokeRole.selector,
            role_,
            account_
        );
        _delegateWithoutValue(logicContractAddress, callData);
    }

    function setRoleAdmin(bytes32 role_, bytes32 adminRole_) external {
        bytes memory callData = abi.encodeWithSelector(
            SupplyChainLogic.setRoleAdmin.selector,
            role_,
            adminRole_
        );
        _delegateWithoutValue(logicContractAddress, callData);
    }

    function transferOwnership(address newOwner_) external {
        bytes memory callData = abi.encodeWithSelector(
            SupplyChainLogic.transferOwnership.selector,
            newOwner_
        );
        _delegateWithoutValue(logicContractAddress, callData);
    }

    // State View Functions (Using Delegatecall)
    function hasRole(
        bytes32 role_,
        address account_
    ) external returns (bool hasRole_) {
        bytes memory callData = abi.encodeWithSelector(
            SupplyChainLogic.hasRole.selector,
            role_,
            account_
        );
        (bool success, bytes memory returnData) = logicContractAddress
            .delegatecall(callData);
        _checkStaticCallSuccess(
            success,
            returnData,
            keccak256("hasRole(bytes32,address)")
        );
        hasRole_ = abi.decode(returnData, (bool));
    }

    function getRoleAdmin(bytes32 role_) external returns (bytes32 adminRole_) {
        bytes memory callData = abi.encodeWithSelector(
            SupplyChainLogic.getRoleAdmin.selector,
            role_
        );
        (bool success, bytes memory returnData) = logicContractAddress
            .delegatecall(callData);
        _checkStaticCallSuccess(
            success,
            returnData,
            keccak256("getRoleAdmin(bytes32)")
        );
        adminRole_ = abi.decode(returnData, (bytes32));
    }

    function batchType(
        address batchAddress_
    ) external returns (bytes32 typeHash_) {
        bytes memory callData = abi.encodeWithSelector(
            bytes4(keccak256("batchType(address)")),
            batchAddress_
        );
        (bool success, bytes memory returnData) = logicContractAddress
            .delegatecall(callData);
        _checkStaticCallSuccess(
            success,
            returnData,
            keccak256("batchType(address)")
        );
        typeHash_ = abi.decode(returnData, (bytes32));
    }

    function lastLogHashForBatch(
        address batchAddress_
    ) external returns (bytes32 lastHash_) {
        bytes memory callData = abi.encodeWithSelector(
            bytes4(keccak256("lastLogHashForBatch(address)")),
            batchAddress_
        );
        (bool success, bytes memory returnData) = logicContractAddress
            .delegatecall(callData);
        _checkStaticCallSuccess(
            success,
            returnData,
            keccak256("lastLogHashForBatch(address)")
        );
        lastHash_ = abi.decode(returnData, (bytes32));
    }

    // Pure Functions (Using Staticcall)
    function getRoleIdentifier(
        string calldata roleName_
    ) external view returns (bytes32 roleIdentifier_) {
        bytes memory callData = abi.encodeWithSelector(
            SupplyChainLogic.getRoleIdentifier.selector,
            roleName_
        );
        (bool success, bytes memory returnData) = logicContractAddress
            .staticcall(callData);
        _checkStaticCallSuccess(
            success,
            returnData,
            keccak256("getRoleIdentifier(string)")
        );
        roleIdentifier_ = abi.decode(returnData, (bytes32));
    }

    // Storage Access Functions (Using Delegatecall)
    function getRawMaterialDetails(
        address batchAddress_
    )
        external
        returns (
            bytes32 description,
            uint quantity,
            address supplier,
            address intendedManufacturer,
            uint creationTime,
            RawMaterial.Status status,
            address currentTransporter,
            uint lastUpdateTime
        )
    {
        bytes memory callData = abi.encodeWithSelector(
            SupplyChainLogic.getRawMaterialDetailsInternal.selector,
            batchAddress_
        );
        (bool success, bytes memory returnData) = logicContractAddress
            .delegatecall(callData);
        _checkStaticCallSuccess(
            success,
            returnData,
            keccak256("getRawMaterialDetailsInternal(address)")
        );
        (
            description,
            quantity,
            supplier,
            intendedManufacturer,
            creationTime,
            status,
            currentTransporter,
            lastUpdateTime
        ) = abi.decode(
            returnData,
            (
                bytes32,
                uint,
                address,
                address,
                uint,
                RawMaterial.Status,
                address,
                uint
            )
        );
    }

    function getMedicineDetails(
        address batchAddress_
    )
        external
        returns (
            bytes32 description,
            uint quantity,
            address[] memory rawMaterialBatchIds,
            address manufacturer,
            uint creationTime,
            uint expiryDate,
            Medicine.Status status,
            address currentOwner,
            address currentTransporter,
            address currentDestination,
            uint lastUpdateTime
        )
    {
        bytes memory callData = abi.encodeWithSelector(
            SupplyChainLogic.getMedicineDetailsInternal.selector,
            batchAddress_
        );
        (bool success, bytes memory returnData) = logicContractAddress
            .delegatecall(callData);
        _checkStaticCallSuccess(
            success,
            returnData,
            keccak256("getMedicineDetailsInternal(address)")
        );
        (
            description,
            quantity,
            rawMaterialBatchIds,
            manufacturer,
            creationTime,
            expiryDate,
            status,
            currentOwner,
            currentTransporter,
            currentDestination,
            lastUpdateTime
        ) = abi.decode(
            returnData,
            (
                bytes32,
                uint,
                address[],
                address,
                uint,
                uint,
                Medicine.Status,
                address,
                address,
                address,
                uint
            )
        );
    }

    function getTransactionHistory(
        address batchAddress_
    ) external returns (SupplyChainLogic.TxnLog[] memory history_) {
        bytes memory callData = abi.encodeWithSelector(
            SupplyChainLogic.getTransactionHistoryInternal.selector,
            batchAddress_
        );
        (bool success, bytes memory returnData) = logicContractAddress
            .delegatecall(callData);
        _checkStaticCallSuccess(
            success,
            returnData,
            keccak256("getTransactionHistoryInternal(address)")
        );
        history_ = abi.decode(returnData, (SupplyChainLogic.TxnLog[]));
    }

    // Internal Helpers
    function _delegate(address implementation_) internal {
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(
                gas(),
                implementation_,
                0,
                calldatasize(),
                0,
                0
            )
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }

    function _delegateWithValue(
        address implementation_,
        bytes memory callData_
    ) internal returns (bytes memory) {
        (bool success, bytes memory _returnData) = implementation_.delegatecall(
            callData_
        );
        if (!success)
            _forwardRevertData(
                _returnData,
                abi.encodePacked("Proxy: Delegatecall failed")
            );
        return _returnData;
    }

    function _delegateWithoutValue(
        address implementation_,
        bytes memory callData_
    ) internal {
        (bool success, bytes memory returnData) = implementation_.delegatecall(
            callData_
        );
        if (!success)
            _forwardRevertData(
                returnData,
                abi.encodePacked("Proxy: Delegatecall failed")
            );
        require(returnData.length == 0, "Proxy: Delegatecall void return");
    }

    function _checkStaticCallSuccess(
        bool success_,
        bytes memory returnData_,
        bytes32 context_
    ) internal pure {
        if (!success_)
            _forwardRevertData(
                returnData_,
                abi.encodePacked("Proxy: Staticcall failed:", uint256(context_))
            );
    }

    function _forwardRevertData(
        bytes memory returnData_,
        bytes memory defaultData_
    ) internal pure {
        if (returnData_.length > 0) {
            assembly {
                revert(add(returnData_, 0x20), mload(returnData_))
            }
        } else {
            assembly {
                revert(add(defaultData_, 0x20), mload(defaultData_))
            }
        }
    }
    function _getAdminRole() internal view returns (bytes32) {
        // Compute the selector for the ADMIN_ROLE() getter function
        bytes4 adminRoleSelector = bytes4(keccak256("ADMIN_ROLE()"));

        // Use the computed selector to call the logic contract
        (bool success, bytes memory data) = logicContractAddress.staticcall(
            abi.encodeWithSelector(adminRoleSelector)
        );
        require(success, "Proxy: Failed to fetch ADMIN_ROLE");
        return abi.decode(data, (bytes32));
    }
    function upgradeTo(address newLogic) external {
        // Fetch ADMIN_ROLE from the logic contract
        bytes32 adminRole = _getAdminRole();

        // Delegatecall to check if the sender has ADMIN_ROLE
        bytes memory callData = abi.encodeWithSelector(
            SupplyChainLogic.hasRole.selector,
            adminRole,
            msg.sender
        );
        (bool success, bytes memory returnData) = logicContractAddress
            .delegatecall(callData);
        require(success, "Proxy: Role check failed");
        bool isAdmin = abi.decode(returnData, (bool));
        require(isAdmin, "Proxy: Unauthorized");

        // Update logic contract address
        logicContractAddress = newLogic;
    }
}
