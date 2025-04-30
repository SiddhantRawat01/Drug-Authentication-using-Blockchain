// client/src/components/MarkDestroyedForm.js
import React, { useState, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context'; // Import hook
import { ROLES, getRoleName } from '../constants/roles'; // Import constants/helpers
import { ethers } from 'ethers'; // Use ethers v6
import '../styles/MarkDestroyedForm.css';
/**
 * Reusable form component for marking a batch (RM or Medicine) as destroyed.
 * Checks if the user has one of the allowed roles before enabling submission.
 * Performs optional client-side checks based on batch type and ownership/status.
 *
 * @param {object} props - Component props
 * @param {string[]} props.allowedDestroyerRoles - Array of role hashes (from ROLES) allowed to perform this action.
 * @param {'RAW_MATERIAL' | 'MEDICINE' | 'ANY'} props.batchTypeContext - Helps guide client-side validation (use 'ANY' for Admin).
 * @param {function} props.onSuccess - Callback function executed on successful destruction marking.
 * @param {function} props.onError - Callback function executed on error, passing the error message.
 */
function MarkDestroyedForm({
    allowedDestroyerRoles = [], // Default to empty array
    batchTypeContext, // Can be 'RAW_MATERIAL', 'MEDICINE', or 'ANY'
    onSuccess,
    onError
}) {
    // Get necessary data and functions from Web3 context
    // Call hook ONCE at the top level
    const {
        contract,
        account, // The connected account attempting the action
        isLoading,
        setIsLoading,
        getRevertReason,
        setError, // Use context's setError
        hasRole
    } = useWeb3();

    // --- Form State Variables ---
    const [batchAddress, setBatchAddress] = useState('');
    const [reason, setReason] = useState(''); // User-provided reason string
    const [latitude, setLatitude] = useState(''); // Location where destruction occurs
    const [longitude, setLongitude] = useState('');
    const [formStatus, setFormStatus] = useState(''); // Local status/error message for this form

    // --- Permissions Check ---
    // Check if the current user has AT LEAST ONE of the roles allowed to destroy
    const canDestroy = allowedDestroyerRoles.some(role => hasRole(role));
    // Get the names of the allowed roles for display
    const allowedRoleNames = allowedDestroyerRoles.map(role => getRoleName(role)).join(' or ');

    // --- Client-Side Validation (Optional but Recommended) ---
    // This checks ownership and status *before* sending the transaction
    const validateDestroyAction = useCallback(async () => {
        if (!contract || !account || !ethers.isAddress(batchAddress)) { // v6 check
            return "Invalid batch address or connection issue.";
        }

        // Admin role bypasses ownership/status checks (contract enforces this anyway)
        if (hasRole(ROLES.ADMIN_ROLE)) {
            // Admin might still want to check if it's *already* destroyed
             try {
                 const type = await contract.batchType(batchAddress);
                 if (type === ethers.ZeroHash) return "Batch not found."; // v6 check

                 if (type === ROLES.RAW_MATERIAL) {
                     const details = await contract.getRawMaterialDetails(batchAddress);
                     if (Number(details.status) === 3) return "Batch is already destroyed."; // 3 = Destroyed
                 } else if (type === ROLES.MEDICINE) {
                     const details = await contract.getMedicineDetails(batchAddress);
                     // 7 = ConsumedOrSold, 8 = Destroyed
                     if (Number(details.status) === 7 || Number(details.status) === 8) {
                         return "Batch is already finalized or destroyed.";
                     }
                 } else {
                     return "Unknown batch type, cannot verify status.";
                 }
                 return null; // Admin check passed (batch exists and isn't already destroyed/finalized)
             } catch (err) {
                 return `Status Check Error: ${getRevertReason(err)}`;
             }
        }

        // If not admin, perform checks based on expected owner/status
        try {
            const type = await contract.batchType(batchAddress);
            if (type === ethers.ZeroHash) return "Batch not found."; // v6 check

            if (type === ROLES.RAW_MATERIAL) {
                // Check if context allows destroying RM
                if (batchTypeContext !== 'RAW_MATERIAL' && batchTypeContext !== 'ANY') {
                     return "Context mismatch: Form configured incorrectly for Raw Material.";
                 }
                const details = await contract.getRawMaterialDetails(batchAddress);
                // Check if current user is the supplier (owner)
                if (details.supplier.toLowerCase() !== account.toLowerCase()) {
                    return "Access Denied: You are not the supplier of this Raw Material batch.";
                }
                // Check if already destroyed
                if (Number(details.status) === 3) { // 3 = Destroyed
                    return "Batch is already marked as destroyed.";
                }
            } else if (type === ROLES.MEDICINE) {
                 // Check if context allows destroying Medicine
                 if (batchTypeContext !== 'MEDICINE' && batchTypeContext !== 'ANY') {
                     return "Context mismatch: Form configured incorrectly for Medicine.";
                 }
                 const details = await contract.getMedicineDetails(batchAddress);
                 // Check if current user is the current owner
                 if (details.currentOwner.toLowerCase() !== account.toLowerCase()) {
                     return "Access Denied: You are not the current owner of this Medicine batch.";
                 }
                 // Check if already finalized or destroyed
                 // Status enum: 7: ConsumedOrSold, 8: Destroyed
                 if (Number(details.status) === 7 || Number(details.status) === 8) {
                     return "Batch is already finalized or destroyed.";
                 }
            } else {
                 return "Cannot determine ownership/status for unknown batch type.";
            }
            return null; // Validation passed for non-admin owner
        } catch (err) {
            console.error("Ownership/Status Validation Error:", err);
            return `Validation Error: ${getRevertReason(err)}`;
        }
    }, [contract, account, batchAddress, hasRole, batchTypeContext, getRevertReason]); // Dependencies

    // --- Form Submission Handler ---
    const handleSubmit = useCallback(async (e) => {
        e.preventDefault(); // Prevent default browser form submission
        setFormStatus(''); // Clear previous local status
        if (onError) onError(null); // Clear parent/global error state via callback

        // --- Input Validation ---
        if (!contract || !account || !canDestroy) {
            const errorMsg = "Cannot mark destroyed: Wallet/contract issue or insufficient role.";
            setFormStatus(`Error: ${errorMsg}`); if (onError) onError(errorMsg); return;
        }
        if (!ethers.isAddress(batchAddress)) { // v6 check
            setFormStatus("Error: Please enter a valid Ethereum Batch Address."); return;
        }
        if (!reason || reason.length > 31) {
            setFormStatus("Error: Reason is required and cannot exceed 31 characters."); return;
        }
        const latNum = parseFloat(latitude); const lonNum = parseFloat(longitude);
        if (isNaN(latNum) || isNaN(lonNum)) {
           setFormStatus("Error: Latitude and Longitude must be valid numbers."); return;
        }

        setIsLoading(true); // Set loading state
        setFormStatus('Validating destroy action...');

        // --- Perform Client-Side Validation ---
        const validationError = await validateDestroyAction();
        if (validationError) {
            setFormStatus(`Error: ${validationError}`);
            setIsLoading(false); // Stop loading
            if (onError) onError(validationError); // Report error
            return; // Prevent transaction submission
        }
        // --- End Validation ---

        setFormStatus('Submitting transaction...');

        // --- Transaction Processing ---
        try {
            // 1. Prepare data for the contract function call
            // Convert reason string to bytes32 (ethers v6)
            const reasonBytes32 = ethers.encodeBytes32String(reason.slice(0, 31));
            // Convert coordinates to BigInt (for int256 in Solidity - ethers v6)
            const latInt = Math.round(latNum * 1e6);
            const lonInt = Math.round(lonNum * 1e6);
            // 2. Call the contract function
            const tx = await contract.markBatchDestroyed(
                batchAddress,
                reasonBytes32,
                latInt,
                lonInt
                // { from: account } // Implicit with signer
            );

            setFormStatus(`Transaction sent: ${tx.hash}. Waiting for confirmation...`);

            // 3. Wait for the transaction to be mined
            const receipt = await tx.wait();

            // 4. Handle Success
            setFormStatus(`Batch ${batchAddress.substring(0,6)}... Marked as Destroyed! Tx: ${receipt.hash}`);
            if (onSuccess) onSuccess(); // Execute success callback

            // 5. Reset form fields
            setBatchAddress('');
            setReason('');
            setLatitude(''); // Clear location too, might be different next time
            setLongitude('');

        } catch (err) {
            // 6. Handle Errors
            console.error("Mark Destroyed Error:", err);
            const reasonText = getRevertReason(err);
            // Provide specific feedback based on common contract errors
            if (reasonText.includes("RequiresAdminOrOwner") || reasonText.includes("RequiresAdminOrSupplier") || reasonText.includes("UnauthorizedActor")) {
                 setFormStatus("Error: Destroy Failed - You lack the necessary role (Admin or specific Owner/Supplier for this batch).");
            } else if (reasonText.includes("Batch_AlreadyDestroyed") || reasonText.includes("Med_AlreadyDestroyedOrFinalized")) {
                 setFormStatus("Error: Destroy Failed - Batch has already been destroyed or finalized.");
            } else {
                setFormStatus(`Error: Destroy Failed - ${reasonText}`);
            }
            if (onError) onError(formStatus); // Pass final error message via callback
        } finally {
            // 7. Reset Loading State
            setIsLoading(false);
        }
    }, [ // Dependencies for useCallback
        contract, account, canDestroy, batchAddress, reason, latitude, longitude,
        validateDestroyAction, setIsLoading, getRevertReason, onSuccess, onError
    ]);


    // --- JSX Rendering ---
    return (
        <form onSubmit={handleSubmit} className="form-container">
            <h3>Mark Batch as Destroyed</h3>

            {/* Display permission warning if user lacks the required role */}
            {!canDestroy && (
                <p className="error-message">
                    You do not have the required role ({allowedRoleNames}) to perform this action.
                </p>
            )}

            {/* Batch Address Input */}
            <div className="form-group">
                <label htmlFor={`dest-batch-${batchTypeContext}`}>Batch Address:</label>
                <input
                    id={`dest-batch-${batchTypeContext}`}
                    type="text"
                    value={batchAddress}
                    onChange={(e) => setBatchAddress(e.target.value)}
                    required
                    pattern="^0x[a-fA-F0-9]{40}$"
                    title="Enter a valid Ethereum address (0x...)"
                    disabled={!canDestroy || isLoading} // Disable if no permission or loading
                    placeholder="0x... (Address of batch to destroy)"
                />
            </div>

            {/* Reason Input */}
            <div className="form-group">
                <label htmlFor={`dest-reason-${batchTypeContext}`}>Reason for Destruction (max 31 chars):</label>
                <input
                    id={`dest-reason-${batchTypeContext}`}
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength="31"
                    required
                    disabled={!canDestroy || isLoading}
                    placeholder="e.g., Expired, Damaged, Contaminated"
                />
            </div>

            {/* Latitude and Longitude Inputs */}
             <div className="form-group" style={{display: 'flex', gap: '15px'}}>
                 <div style={{flex: 1}}>
                     <label htmlFor={`dest-lat-${batchTypeContext}`}>Current Latitude:</label>
                     <input
                        id={`dest-lat-${batchTypeContext}`}
                        type="number"
                        step="any" // Allows decimal values
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                        required
                        disabled={!canDestroy || isLoading}
                        placeholder="e.g., 40.7128"
                     />
                 </div>
                 <div style={{flex: 1}}>
                     <label htmlFor={`dest-lon-${batchTypeContext}`}>Current Longitude:</label>
                     <input
                        id={`dest-lon-${batchTypeContext}`}
                        type="number"
                        step="any" // Allows decimal values
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value)}
                        required
                        disabled={!canDestroy || isLoading}
                        placeholder="e.g., -74.0060"
                     />
                 </div>
            </div>

             {/* Submit Button - Use danger class */}
            <button
                type="submit"
                disabled={isLoading || !contract || !account || !canDestroy} // Also disable if no permission
                className="danger"
            >
                {isLoading ? 'Processing...' : 'Mark Destroyed'}
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

export default MarkDestroyedForm;