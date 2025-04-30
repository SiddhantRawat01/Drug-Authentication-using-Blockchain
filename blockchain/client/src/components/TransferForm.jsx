// client/src/components/TransferForm.js
import React, { useState, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { ROLES, getRoleName } from '../constants/roles'; // Import getRoleName
import { ethers } from 'ethers'; // Use ethers v6

/**
 * Reusable form component for initiating batch transfers.
 * Handles both Raw Material and Medicine transfers based on context.
 *
 * @param {object} props - Component props
 * @param {'RAW_MATERIAL' | 'MEDICINE'} props.batchTypeContext - Specifies the type of batch being transferred.
 * @param {string} props.allowedSenderRole - The role hash (from ROLES) required for the sender to initiate this transfer.
 * @param {function} props.onSuccess - Callback function executed on successful transfer initiation.
 * @param {function} props.onError - Callback function executed on error, passing the error message.
 */
function TransferForm({ batchTypeContext, allowedSenderRole, onSuccess, onError }) {
    // Get necessary data and functions from Web3 context
    const {
        contract,
        account,
        isLoading,
        setIsLoading,
        getRevertReason,
        hasRole,
        setError // Use setError from context for broader error display if needed
    } = useWeb3();

    // Form state variables
    const [batchAddress, setBatchAddress] = useState('');
    const [transporter, setTransporter] = useState('');
    const [receiver, setReceiver] = useState('');
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');
    const [formStatus, setFormStatus] = useState(''); // Local status/error message for the form

    // Check if the current user has the required role to initiate this transfer
    const canInitiate = hasRole(allowedSenderRole);

    // --- Client-Side Validation Functions ---
    // These checks run *before* sending the transaction to provide faster feedback.
    // The contract performs the definitive validation.

    // Validation specific to Raw Material transfers
    const validateRMTransfer = useCallback(async () => {
        if (!contract || !account || !ethers.isAddress(batchAddress) || !ethers.isAddress(receiver)) { // v6 address check
            return "Invalid addresses or contract connection issue.";
        }
        try {
            const rmDetails = await contract.getRawMaterialDetails(batchAddress);

            // 1. Check if caller is the supplier (owner for RM)
            if (rmDetails.supplier.toLowerCase() !== account.toLowerCase()) {
                return `Access Denied: You (${account.substring(0,6)}...) are not the supplier of this batch.`;
            }
            // 2. Check if the specified receiver matches the batch's intended manufacturer
            if (rmDetails.intendedManufacturer.toLowerCase() !== receiver.toLowerCase()) {
                return `Receiver Mismatch: This batch is intended for ${rmDetails.intendedManufacturer.substring(0,6)}..., not ${receiver.substring(0,6)}...`;
            }
            // 3. Check if the batch is in the correct state ('Created')
            // Status enum: 0: Created, 1: InTransit, 2: Received, 3: Destroyed
            if (Number(rmDetails.status) !== 0) { // Convert BigInt status to Number for comparison
                return "Invalid State: Batch is not in 'Created' state (it might already be in transit or received).";
            }
            return null; // Validation passed
        } catch (err) {
            console.error("Raw Material Validation Error:", err);
            // Attempt to parse contract errors during validation
            return `Validation Error: ${getRevertReason(err)}`;
        }
    }, [contract, batchAddress, receiver, account, getRevertReason]); // Dependencies for useCallback

    // Validation specific to Medicine transfers
    const validateMedTransfer = useCallback(async () => {
        if (!contract || !account || !ethers.isAddress(batchAddress) || !ethers.isAddress(receiver)) { // v6 address check
            return "Invalid addresses or contract connection issue.";
        }
        try {
            const medDetails = await contract.getMedicineDetails(batchAddress);

            // 1. Check if caller is the current owner of the medicine batch
            if (medDetails.currentOwner.toLowerCase() !== account.toLowerCase()) {
                return `Access Denied: You (${account.substring(0,6)}...) are not the current owner (${medDetails.currentOwner.substring(0,6)}...) of this batch.`;
            }

            // 2. Check if the batch is in a transferable state based on the sender's role
            // Status enum: 0: Created, 2: AtWholesaler, 4: AtDistributor are transferable states
            const currentStatus = Number(medDetails.status); // Convert BigInt status
            const requiredSenderRoles = {
                 0: ROLES.MANUFACTURER_ROLE, // Manufacturer sends when Created
                 2: ROLES.WHOLESALER_ROLE,   // Wholesaler sends when AtWholesaler
                 4: ROLES.DISTRIBUTOR_ROLE,  // Distributor sends when AtDistributor
            };

            // Ensure the current user's role matches the role required for the batch's current state
            if (requiredSenderRoles[currentStatus] !== allowedSenderRole) {
               return `Role Mismatch: Your role (${getRoleName(allowedSenderRole)}) cannot initiate transfer from the batch's current state (${currentStatus}).`;
            }

            // Check if the status itself is one of the transferable states
             if (currentStatus !== 0 && currentStatus !== 2 && currentStatus !== 4) {
                return `Invalid State: Batch cannot be transferred from its current state (Status code: ${currentStatus}).`;
             }

            // Optional: Add a basic check on the receiver's role (contract enforces definitively)
            // e.g., If sending from Manufacturer (status 0), receiver should ideally be Wholesaler or Distributor.
            // const hasWholesalerRole = await contract.hasRole(ROLES.WHOLESALER_ROLE, receiver);
            // const hasDistributorRole = await contract.hasRole(ROLES.DISTRIBUTOR_ROLE, receiver);
            // if (currentStatus === 0 && !hasWholesalerRole && !hasDistributorRole) {
            //     return "Warning: Receiver may not have the expected Wholesaler or Distributor role.";
            // }
            // Similar checks for other states...

            return null; // Basic client-side validation passed
        } catch (err) {
            console.error("Medicine Validation Error:", err);
            return `Validation Error: ${getRevertReason(err)}`;
        }
     }, [contract, batchAddress, receiver, account, getRevertReason, allowedSenderRole]); // Dependencies

    // --- Form Submission Handler ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormStatus(''); // Clear previous status
        if (onError) onError(null); // Clear parent error state via callback

        // Initial checks
        if (!contract || !account || !canInitiate) {
            const errorMsg = "Cannot initiate transfer: Wallet/contract issue or insufficient role.";
            setFormStatus(`Error: ${errorMsg}`);
            if (onError) onError(errorMsg);
            return;
        }
        if (!ethers.isAddress(batchAddress) || !ethers.isAddress(transporter) || !ethers.isAddress(receiver)) { // v6 check
            setFormStatus("Error: Please enter valid Ethereum addresses for Batch, Transporter, and Receiver.");
            return;
        }
        const latNum = parseFloat(latitude);
        const lonNum = parseFloat(longitude);
        if (isNaN(latNum) || isNaN(lonNum)) {
           setFormStatus("Error: Latitude and Longitude must be valid numbers.");
           return;
        }

        setIsLoading(true); // Set loading state
        setFormStatus('Validating transfer details...');

        // Perform context-specific client-side validation
        let validationError = null;
        try {
            if (batchTypeContext === 'RAW_MATERIAL') {
                validationError = await validateRMTransfer();
            } else if (batchTypeContext === 'MEDICINE') {
                validationError = await validateMedTransfer();
            } else {
                validationError = "Internal Error: Invalid batch type context provided to the form.";
            }
        } catch (valErr) {
            validationError = `Validation exception: ${valErr.message}`;
        }


        // If validation fails, stop and show error
        if (validationError) {
            setFormStatus(`Error: ${validationError}`);
            setIsLoading(false); // Reset loading state
            if (onError) onError(validationError); // Report error to parent
            return;
        }

        // If validation passes, proceed with the transaction
        setFormStatus('Validation passed. Sending transaction...');

        try {
            // Convert coordinates to BigInt for int256 (ethers v6)
            const latInt = Math.round(latNum * 1e6);
            const lonInt = Math.round(lonNum * 1e6);

            // Call the contract function
            const tx = await contract.initiateTransfer(
                batchAddress,
                transporter,
                receiver,
                latInt,
                lonInt,
                { from: account } // Optional: specify sender, though signer handles it
            );

            setFormStatus(`Transaction sent: ${tx.hash}. Waiting for confirmation...`);

            // Wait for the transaction to be mined
            const receipt = await tx.wait();

            setFormStatus(`Transfer Initiated Successfully! Tx: ${receipt.hash}`); // Use receipt.hash in v6
            if (onSuccess) onSuccess(); // Execute success callback

            // Reset form fields after successful submission
            setBatchAddress('');
            setTransporter('');
            setReceiver('');
            setLatitude('');
            setLongitude('');

        } catch (err) {
            console.error("Initiate Transfer Error:", err);
            const reason = getRevertReason(err); // Use helper to parse error
            // Provide specific feedback based on common contract errors
            if (reason.includes("TransporterLacksRole")) {
                setFormStatus("Error: Transfer Failed - The selected Transporter does not have the required role.");
            } else if (reason.includes("ReceiverRoleInvalidForStage") || reason.includes("ManufacturerLacksRole") || reason.includes("ReceiverMismatch")) {
                 setFormStatus("Error: Transfer Failed - The Receiver does not have the appropriate role or address for this stage/batch.");
            } else if (reason.includes("InvalidStateForAction")) {
                setFormStatus("Error: Transfer Failed - The batch is not in a state where transfer can be initiated.");
            } else if (reason.includes("CallerIsNotCurrentOwner") || reason.includes("CallerIsNotSupplier")) {
                 setFormStatus("Error: Transfer Failed - You are not authorized to transfer this specific batch.");
            } else {
                setFormStatus(`Error: Transfer Failed - ${reason}`);
            }
            if (onError) onError(formStatus); // Pass final error message to parent
        } finally {
            setIsLoading(false); // Reset loading state regardless of outcome
        }
    };

    // --- JSX Rendering ---
    return (
        <form onSubmit={handleSubmit} className="form-container">
            {/* Dynamically set title based on context */}
            <h3>Initiate {batchTypeContext === 'RAW_MATERIAL' ? 'Raw Material' : 'Medicine'} Transfer</h3>

            {/* Display message if user lacks the required role */}
            {!canInitiate && (
                <p className="error-message">
                    You do not have the required role ({getRoleName(allowedSenderRole)}) to initiate this type of transfer.
                </p>
            )}

            {/* Form Inputs */}
            <div className="form-group">
                <label htmlFor={`tf-batch-${batchTypeContext}`}>Batch Address:</label>
                <input
                    id={`tf-batch-${batchTypeContext}`}
                    type="text"
                    value={batchAddress}
                    onChange={(e) => setBatchAddress(e.target.value)}
                    required
                    pattern="^0x[a-fA-F0-9]{40}$"
                    title="Enter a valid Ethereum address (0x...)"
                    disabled={!canInitiate} // Disable if user can't initiate
                />
            </div>
             <div className="form-group">
                <label htmlFor={`tf-transporter-${batchTypeContext}`}>Transporter Address:</label>
                <input
                    id={`tf-transporter-${batchTypeContext}`}
                    type="text"
                    value={transporter}
                    onChange={(e) => setTransporter(e.target.value)}
                    required
                    pattern="^0x[a-fA-F0-9]{40}$"
                    title="Enter a valid Ethereum address (0x...)"
                    disabled={!canInitiate}
                />
            </div>
            <div className="form-group">
                <label htmlFor={`tf-receiver-${batchTypeContext}`}>Receiver Address:</label>
                <input
                    id={`tf-receiver-${batchTypeContext}`}
                    type="text"
                    value={receiver}
                    onChange={(e) => setReceiver(e.target.value)}
                    required
                    pattern="^0x[a-fA-F0-9]{40}$"
                    title="Enter a valid Ethereum address (0x...)"
                    disabled={!canInitiate}
                />
                {/* Add context hint for Raw Material transfers */}
                {batchTypeContext === 'RAW_MATERIAL' && (
                    <small style={{display: 'block', marginTop: '3px', color: '#555'}}>
                        (Must match the Intended Manufacturer stored in the batch)
                    </small>
                )}
            </div>
             <div className="form-group" style={{display: 'flex', gap: '15px'}}>
                 <div style={{flex: 1}}>
                     <label htmlFor={`tf-lat-${batchTypeContext}`}>Current Latitude:</label>
                     <input
                        id={`tf-lat-${batchTypeContext}`}
                        type="number"
                        step="any" // Allow decimals
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                        required
                        placeholder="e.g., 40.7128"
                        disabled={!canInitiate}
                     />
                 </div>
                 <div style={{flex: 1}}>
                     <label htmlFor={`tf-lon-${batchTypeContext}`}>Current Longitude:</label>
                     <input
                        id={`tf-lon-${batchTypeContext}`}
                        type="number"
                        step="any" // Allow decimals
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value)}
                        required
                        placeholder="e.g., -74.0060"
                        disabled={!canInitiate}
                     />
                 </div>
            </div>

            {/* Submit Button */}
            <button
                type="submit"
                disabled={isLoading || !contract || !canInitiate} // Also disable if loading or no contract/role
            >
                {isLoading ? 'Processing...' : 'Initiate Transfer'}
            </button>

            {/* Display Form Status/Error Message */}
            {formStatus && (
                 <p className={formStatus.startsWith("Error:") ? "error-message" : "info-message"} style={{marginTop: '15px'}}>
                     {formStatus}
                 </p>
             )}
        </form>
    );
}

export default TransferForm;