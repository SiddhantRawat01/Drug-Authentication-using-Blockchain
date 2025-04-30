// client/src/components/ReceivePackageButton.js
import React, { useState, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context'; // Import hook
import { ROLES, getRoleName } from '../constants/roles'; // Import constants/helpers
import { ethers } from 'ethers'; // Use ethers v6

/**
 * Reusable button component for receiving a package (RM or Medicine).
 * Performs client-side checks for role and optionally for destination matching.
 * Requires location coordinates to be passed as props.
 *
 * @param {object} props - Component props
 * @param {string} props.batchAddress - The address of the batch contract to receive.
 * @param {string} props.expectedReceiverRole - The role hash (from ROLES) required for the user to receive this package type.
 * @param {string | number} props.latitude - The current latitude coordinate.
 * @param {string | number} props.longitude - The current longitude coordinate.
 * @param {function} [props.onSuccess] - Optional callback function executed on successful receipt, passing the batchAddress back.
 * @param {function} [props.onError] - Optional callback function executed on error, passing the error message.
 */
function ReceivePackageButton({
    batchAddress,
    expectedReceiverRole,
    latitude,
    longitude,
    onSuccess,
    onError
}) {
    // Get necessary data and functions from Web3 context
    // Call hook ONCE at the top level
    const {
        contract,
        account, // The connected account attempting to receive
        isLoading,
        setIsLoading,
        getRevertReason,
        setError, // Use context's setError
        hasRole
    } = useWeb3();

    // --- Local State ---
    const [statusMessage, setStatusMessage] = useState(''); // Local status/error message for this button action

    // --- Permissions and Pre-checks ---
    const canReceive = hasRole(expectedReceiverRole); // Does user have the required role?
    const isValidAddress = ethers.isAddress(batchAddress); // Is the passed address valid? v6 check
    const hasLocation = latitude !== '' && longitude !== '' && !isNaN(parseFloat(latitude)) && !isNaN(parseFloat(longitude)); // Are valid coords provided?

    // --- Client-Side Validation (Optional but Recommended) ---
    // This checks if the user is the *intended* destination and if the batch is in transit.
    const validateReceipt = useCallback(async () => {
        if (!contract || !account || !isValidAddress) {
            return "Invalid batch address or connection issue.";
        }

        try {
            const type = await contract.batchType(batchAddress);
            if (type === ethers.ZeroHash) return "Batch not found."; // v6 check

            let details;
            let expectedState; // State enum value when it should be receivable

            // Fetch details and determine expected state based on type
            if (type === ROLES.RAW_MATERIAL) {
                details = await contract.getRawMaterialDetails(batchAddress);
                expectedState = 1; // 1 = InTransit for RawMaterial
                // Check if current user is the intended manufacturer
                if (details.intendedManufacturer.toLowerCase() !== account.toLowerCase()) {
                    return `Destination Mismatch: You (${account.substring(0,6)}...) are not the intended manufacturer (${details.intendedManufacturer.substring(0,6)}...).`;
                }
            } else if (type === ROLES.MEDICINE) {
                details = await contract.getMedicineDetails(batchAddress);
                // Check if current user is the current destination address
                if (details.currentDestination.toLowerCase() !== account.toLowerCase()) {
                     return `Destination Mismatch: You (${account.substring(0,6)}...) are not the current destination (${details.currentDestination.substring(0,6)}...) for this batch.`;
                 }
                // Check if status is one of the InTransit states for Medicine
                 // Status enum: 1: InTransitToW, 3: InTransitToD, 5: InTransitToC
                 const currentStatus = Number(details.status); // Convert BigInt status
                 if (currentStatus !== 1 && currentStatus !== 3 && currentStatus !== 5) {
                    return `Invalid State: Medicine batch is not currently In Transit (Status: ${currentStatus}).`;
                 }
                 // No single expectedState for medicine, just needs to be one of the InTransit states
                 expectedState = -1; // Use -1 to signify check passed if in any transit state

            } else {
                 return "Unknown batch type, cannot validate receipt.";
            }

            // Check Status (for RM, or just ensure Med was in *a* transit state)
             if (type === ROLES.RAW_MATERIAL && Number(details.status) !== expectedState) {
                 return `Invalid State: Raw Material is not currently In Transit (Status: ${Number(details.status)}).`;
             }

            return null; // Validation passed

        } catch (err) {
            console.error("Receive Package Validation Error:", err);
            return `Validation Error: ${getRevertReason(err)}`;
        }
    }, [contract, account, batchAddress, isValidAddress, getRevertReason]); // Dependencies

    // --- Button Click Handler ---
    const handleReceive = useCallback(async () => {
        setStatusMessage(''); // Clear previous status
        if (onError) onError(null); // Clear parent error state

        // --- Initial Checks ---
        if (!contract || !account || !canReceive || !isValidAddress || !hasLocation) {
            const errorMsg = "Cannot receive: Wallet/contract issue, invalid batch address, missing role, or location missing.";
            setStatusMessage(`Error: ${errorMsg}`);
            if (onError) onError(errorMsg);
            return;
        }

        setIsLoading(true); // Set loading state
        setStatusMessage('Validating package receipt...');

        // --- Perform Client-Side Validation ---
        const validationError = await validateReceipt();
        if (validationError) {
            setStatusMessage(`Error: ${validationError}`);
            setIsLoading(false); // Stop loading
            if (onError) onError(validationError); // Report error
            return; // Prevent transaction submission
        }
        // --- End Validation ---

        setStatusMessage('Submitting transaction...');

        // --- Transaction Processing ---
        try {
            // 1. Prepare data
            const latNum = parseFloat(latitude);
            const lonNum = parseFloat(longitude);
            // Convert coordinates to BigInt (for int256 in Solidity - ethers v6)
            const latInt = Math.round(latNum * 1e6);
            const lonInt = Math.round(lonNum * 1e6);

            // 2. Call the contract function
            const tx = await contract.receivePackage(
                batchAddress,
                latInt,
                lonInt
                // { from: account } // Implicit with signer
            );

            setStatusMessage(`Transaction sent: ${tx.hash}. Waiting for confirmation...`);

            // 3. Wait for the transaction to be mined
            const receipt = await tx.wait();

            // 4. Handle Success
            setStatusMessage(`Package Received Successfully! Tx: ${receipt.hash}`);
            if (onSuccess) onSuccess(batchAddress); // Execute success callback, pass address back

            // No form reset needed for a button, parent component handles input clearing if desired

        } catch (err) {
            // 5. Handle Errors
            console.error("Receive Package Error:", err);
            const reason = getRevertReason(err);
            // Provide specific feedback based on common contract errors
             if (reason.includes("ReceiverMismatch")) {
                setStatusMessage("Error: Receive Failed - You are not the intended receiver/destination for this batch according to the contract.");
            } else if (reason.includes("InvalidStateForAction")) {
                 setStatusMessage("Error: Receive Failed - The batch is not in the correct 'In Transit' state to be received.");
            } else if (reason.includes("AccessControlMissingRole")) {
                 // This usually refers to the *receiver's* role check within the contract
                 setStatusMessage(`Error: Receive Failed - Your account lacks the required role (${getRoleName(expectedReceiverRole)}) on-chain.`);
            } else {
                setStatusMessage(`Error: Receive Failed - ${reason}`);
            }
            if (onError) onError(statusMessage); // Pass final error message via callback
        } finally {
            // 6. Reset Loading State
            setIsLoading(false);
        }
    }, [ // Dependencies for useCallback
        contract, account, canReceive, batchAddress, isValidAddress, hasLocation, latitude, longitude,
        validateReceipt, setIsLoading, getRevertReason, onSuccess, onError, expectedReceiverRole
    ]);

    // --- Render Logic ---

    // Determine if the button should be interactable
    const isDisabled = isLoading || !contract || !account || !canReceive || !isValidAddress || !hasLocation;
    const buttonTitle = !canReceive ? `Requires ${getRoleName(expectedReceiverRole)} role` :
                       !isValidAddress ? "Enter a valid batch address first" :
                       !hasLocation ? "Requires current location coordinates" :
                       "Confirm receipt of this package";

    return (
        // Render a container for the button and its status message
        <div className="receive-package-action" style={{marginTop: '10px'}}>
            <button
                onClick={handleReceive}
                disabled={isDisabled}
                title={buttonTitle} // Provide hint on hover, especially when disabled
                className="primary" // Or another appropriate style
            >
                {isLoading ? 'Processing Receipt...' : 'Confirm Package Received'}
            </button>

            {/* Display Action Status/Error Message */}
            {statusMessage && (
                 <p
                    className={statusMessage.startsWith("Error:") ? "error-message" : "info-message"}
                    style={{fontSize: '0.9em', margin: '8px 0 0 0'}} // Style message below button
                 >
                     {statusMessage}
                 </p>
             )}

             {/* Optionally show a specific warning if only location is missing */}
             {!hasLocation && canReceive && isValidAddress && (
                  <p style={{fontSize: '0.8em', color: 'orange', margin: '5px 0 0 0'}}>
                      Please provide your current location coordinates.
                  </p>
             )}
        </div>
    );
}

export default ReceivePackageButton;