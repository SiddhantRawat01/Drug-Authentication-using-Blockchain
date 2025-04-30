// client/src/components/CreateMedicineForm.js
import React, { useState, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context'; // Import hook
import { ethers } from 'ethers'; // Use ethers v6
import { ROLES } from '../constants/roles'; // Import role hashes if needed for validation

/**
 * Form component for creating new Medicine batches.
 * Used within the ManufacturerDashboard.
 *
 * @param {object} props - Component props
 * @param {function} props.onSuccess - Callback function executed on successful batch creation.
 * @param {function} props.onError - Callback function executed on error, passing the error message.
 */
function CreateMedicineForm({ onSuccess, onError }) {
    // Get necessary data and functions from Web3 context
    // Call hook ONCE at the top level
    const {
        contract,
        account, // The connected account (manufacturer)
        isLoading,
        setIsLoading,
        getRevertReason,
        setError // Use setError from context for broader display if needed
    } = useWeb3();

    // --- Form State Variables ---
    const [description, setDescription] = useState('');
    const [quantity, setQuantity] = useState('');
    const [rawMaterialIds, setRawMaterialIds] = useState(''); // Comma-separated addresses string
    const [expiryDate, setExpiryDate] = useState(''); // Use datetime-local input format 'YYYY-MM-DDTHH:mm'
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');
    const [formStatus, setFormStatus] = useState(''); // Local status/error message for this form
    const [validationErrors, setValidationErrors] = useState([]); // Store specific validation errors for RM batches

    // --- Client-Side Raw Material Validation (Optional but Recommended) ---
    const validateRawMaterials = useCallback(async (rmAddresses) => {
        if (!contract || !account) return ["Wallet not connected."]; // Basic check

        const errors = [];
        setValidationErrors([]); // Clear previous errors
        setFormStatus("Validating Raw Material batches..."); // Indicate validation step

        // Fetch details for each RM batch concurrently
        const validationPromises = rmAddresses.map(async (rmAddr) => {
            try {
                // 1. Check if it's actually a Raw Material batch type
                const type = await contract.batchType(rmAddr);
                if (type !== ROLES.RAW_MATERIAL) { // Compare with the known hash
                    return `Address ${rmAddr.substring(0, 6)}... is not registered as a Raw Material batch.`;
                }

                // 2. Get details
                const rmDetails = await contract.getRawMaterialDetails(rmAddr);

                // 3. Check status (must be Received)
                // Status enum: 0: Created, 1: InTransit, 2: Received, 3: Destroyed
                if (Number(rmDetails.status) !== 2) {
                    return `Raw Material ${rmAddr.substring(0, 6)}... is not in 'Received' state (Current: ${Number(rmDetails.status)}).`;
                }

                // 4. Check intended manufacturer
                if (rmDetails.intendedManufacturer.toLowerCase() !== account.toLowerCase()) {
                    return `You (${account.substring(0, 6)}...) are not the intended manufacturer for Raw Material ${rmAddr.substring(0, 6)}... (Intended: ${rmDetails.intendedManufacturer.substring(0,6)}...).`;
                }

                return null; // No error for this batch
            } catch (err) {
                console.error(`Validation failed for RM ${rmAddr}:`, err);
                return `Failed to validate Raw Material ${rmAddr.substring(0, 6)}... (${getRevertReason(err)}). Is it a valid batch address?`;
            }
        });

        const results = await Promise.all(validationPromises);
        const foundErrors = results.filter(result => result !== null); // Filter out null results (no errors)

        setValidationErrors(foundErrors); // Update state with any errors found
        setFormStatus(foundErrors.length > 0 ? "Raw Material validation failed." : "Raw Material validation successful.");

        return foundErrors; // Return array of error strings

    }, [contract, account, getRevertReason]); // Dependencies for useCallback


    // --- Form Submission Handler ---
    const handleSubmit = useCallback(async (e) => {
        e.preventDefault(); // Prevent default browser form submission
        setFormStatus(''); setValidationErrors([]); // Clear previous local status and validation errors
        if (onError) onError(null); // Clear parent/global error state via callback

        // --- Input Validation ---
        if (!contract || !account) {
            const errorMsg = "Wallet not connected or contract not loaded.";
            setFormStatus(`Error: ${errorMsg}`); if (onError) onError(errorMsg); return;
        }
        if (!description || description.length > 31) {
             setFormStatus("Error: Description is required and cannot exceed 31 characters."); return;
        }
        const qtyNum = parseInt(quantity);
        if (isNaN(qtyNum) || qtyNum <= 0) {
             setFormStatus("Error: Quantity must be a positive whole number."); return;
        }
        let expiryTimestamp = 0;
        try {
            // Ensure the input is treated as local time before conversion
            const localDate = new Date(expiryDate);
            expiryTimestamp = Math.floor(localDate.getTime() / 1000); // Convert milliseconds to seconds
            if (isNaN(expiryTimestamp) || expiryTimestamp <= Math.floor(Date.now() / 1000)) {
                throw new Error("Invalid or past date selected.");
            }
        } catch {
            setFormStatus("Error: Please select a valid future expiry date and time using the date picker."); return;
        }
        const latNum = parseFloat(latitude); const lonNum = parseFloat(longitude);
        if (isNaN(latNum) || isNaN(lonNum)) {
           setFormStatus("Error: Latitude and Longitude must be valid numbers."); return;
        }

        // Validate and parse Raw Material addresses
        const rmAddresses = rawMaterialIds.split(',')
                                         .map(addr => addr.trim()) // Remove whitespace
                                         .filter(addr => addr); // Remove empty strings
        const invalidAddresses = rmAddresses.filter(addr => !ethers.isAddress(addr)); // v6 check
        if (rmAddresses.length === 0) {
            setFormStatus("Error: Please enter at least one Raw Material batch address."); return;
        }
        if (invalidAddresses.length > 0) {
            setFormStatus(`Error: Invalid Ethereum address format found in Raw Material IDs: ${invalidAddresses.join(', ')}`); return;
        }
        const uniqueRmAddresses = [...new Set(rmAddresses)]; // Use unique addresses


        setIsLoading(true); // Set loading state

        // --- Optional: Perform Client-Side RM Validation ---
        const rmValidationErrors = await validateRawMaterials(uniqueRmAddresses);
        if (rmValidationErrors.length > 0) {
            setFormStatus("Error: Raw Material validation failed. See details below.");
            // Errors are already set in validationErrors state by the function
            setIsLoading(false); // Stop loading
            return; // Prevent transaction submission
        }
        // --- End Optional Validation ---

        setFormStatus('Submitting transaction...');

        // --- Transaction Processing ---
        try {
            // 1. Prepare data for the contract function call
            const descriptionBytes32 = ethers.encodeBytes32String(description.slice(0, 31)); // v6
            const latInt = Math.round(latNum * 1e6);
            const lonInt = Math.round(lonNum * 1e6);
            const quantityArg = qtyNum.toString();
            const expiryTimestampArg = expiryTimestamp.toString(); // Pass timestamp as string/number

            // 2. Call the contract function
            const tx = await contract.createMedicine(
                descriptionBytes32,
                quantityArg,
                uniqueRmAddresses, // Pass the array of unique, validated addresses
                expiryTimestampArg,
                latInt,
                lonInt
                // { from: account } // Implicit with signer
            );

            setFormStatus(`Transaction sent: ${tx.hash}. Waiting for confirmation...`);

            // 3. Wait for the transaction to be mined
            const receipt = await tx.wait();

            // 4. Attempt to extract the new batch address from the BatchCreated event
            let newBatchAddress = 'N/A';
            try {
                const eventSignature = "BatchCreated(bytes32,address,address,uint256)";
                const eventTopic = ethers.id(eventSignature); // v6
                const medicineTypeHash = ROLES.MEDICINE; // Get hash for MEDICINE type

                // Find log where first topic is event hash AND batchType (second topic) is MEDICINE
                const batchCreatedLog = receipt.logs?.find(log =>
                    log.topics[0] === eventTopic && log.topics[1] === medicineTypeHash
                );

                if (batchCreatedLog) {
                    const decodedEvent = contract.interface.decodeEventLog("BatchCreated", batchCreatedLog.data, batchCreatedLog.topics);
                    // Arguments: batchType (indexed), batchAddress (indexed), creator (indexed), timestamp (non-indexed)
                    if (decodedEvent && decodedEvent.batchAddress) { // v6 often uses named args
                        newBatchAddress = decodedEvent.batchAddress;
                    } else if (decodedEvent && decodedEvent[1]) { // Fallback index access
                        newBatchAddress = decodedEvent[1];
                    }
                }
            } catch (eventError) {
                console.error("Error parsing BatchCreated event for Medicine:", eventError);
                setFormStatus("Medicine batch created, but failed to extract new address from event logs.");
            }

            // 5. Handle Success
            setFormStatus(`Medicine Batch Created Successfully! Tx: ${receipt.hash}. New Batch Address: ${newBatchAddress}`);
            if (onSuccess) onSuccess(); // Execute success callback

            // 6. Reset form fields
            setDescription(''); setQuantity(''); setRawMaterialIds('');
            setExpiryDate(''); setLatitude(''); setLongitude('');

        } catch (err) {
            // 7. Handle Errors
            console.error("Create Medicine Error:", err);
            const reason = getRevertReason(err);
            // Provide specific feedback based on common contract errors
            if (reason.includes("RawMaterialNotReceived")) {
                 setFormStatus("Error: Creation Failed - One or more specified Raw Material batches are not in 'Received' state.");
            } else if (reason.includes("RawMaterialWrongManufacturer")) {
                 setFormStatus("Error: Creation Failed - You are not the intended manufacturer for one or more specified Raw Material batches.");
            } else if (reason.includes("AddressIsNotRawMaterialBatch") || reason.includes("RawMaterialInvalidContract")) {
                 setFormStatus("Error: Creation Failed - One or more provided addresses is not a valid/registered Raw Material batch contract.");
            } else if (reason.includes("ExpiryDateMustBeInFuture")) {
                setFormStatus("Error: Creation Failed - Expiry date must be set in the future.");
            } else if (reason.includes("RequiresAtLeastOneRawMaterial")) {
                setFormStatus("Error: Creation Failed - At least one Raw Material batch must be specified.");
            } else {
                 setFormStatus(`Error: Creation Failed - ${reason}`);
            }
            if (onError) onError(formStatus); // Pass final error message via callback
        } finally {
            // 8. Reset Loading State
            setIsLoading(false);
        }
    }, [
        contract, account, description, quantity, rawMaterialIds, expiryDate, latitude, longitude,
        setIsLoading, getRevertReason, onSuccess, onError, validateRawMaterials // Include dependencies
    ]);

    // --- JSX Rendering ---
    return (
        <form onSubmit={handleSubmit} className="form-container">
            <h3>Create New Medicine Batch</h3>

            {/* Description Input */}
            <div className="form-group">
                <label htmlFor="med-desc">Description (max 31 chars):</label>
                <input
                    id="med-desc"
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength="31"
                    required
                    disabled={isLoading}
                    placeholder="e.g., Paracetamol 500mg Tablets"
                />
            </div>

            {/* Quantity Input */}
            <div className="form-group">
                <label htmlFor="med-qty">Quantity (e.g., number of boxes/bottles):</label>
                <input
                    id="med-qty"
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    min="1"
                    required
                    disabled={isLoading}
                    placeholder="e.g., 500"
                />
            </div>

            {/* Raw Material IDs Input */}
             <div className="form-group">
                <label htmlFor="med-rmids">Raw Material Batch Addresses (comma-separated):</label>
                <textarea
                    id="med-rmids"
                    rows="4" // Slightly larger area
                    value={rawMaterialIds}
                    onChange={(e) => setRawMaterialIds(e.target.value)}
                    placeholder="Enter one or more valid Raw Material batch addresses, separated by commas (e.g., 0x123..., 0x456...)"
                    required
                    disabled={isLoading}
                />
                {/* Display RM validation errors */}
                {validationErrors.length > 0 && (
                    <ul className="error-message" style={{marginTop: '5px', paddingLeft: '20px', fontSize: '0.9em'}}>
                        {validationErrors.map((err, index) => <li key={index}>{err}</li>)}
                    </ul>
                )}
            </div>

            {/* Expiry Date Input */}
             <div className="form-group">
                <label htmlFor="med-expiry">Expiry Date & Time:</label>
                <input
                    id="med-expiry"
                    type="datetime-local" // Standard HTML5 input for date and time
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    required
                    disabled={isLoading}
                    // Optional: Set min attribute to current date/time
                    min={new Date().toISOString().slice(0, 16)}
                />
            </div>

            {/* Latitude and Longitude Inputs */}
             <div className="form-group" style={{display: 'flex', gap: '15px'}}>
                 <div style={{flex: 1}}>
                     <label htmlFor="med-lat">Starting Latitude:</label>
                     <input
                        id="med-lat"
                        type="number"
                        step="any"
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                        required
                        disabled={isLoading}
                        placeholder="e.g., 34.0522"
                    />
                 </div>
                 <div style={{flex: 1}}>
                     <label htmlFor="med-lon">Starting Longitude:</label>
                     <input
                        id="med-lon"
                        type="number"
                        step="any"
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value)}
                        required
                        disabled={isLoading}
                        placeholder="e.g., -118.2437"
                    />
                 </div>
            </div>

            {/* Submit Button */}
            <button
                type="submit"
                disabled={isLoading || !contract || !account}
            >
                {isLoading ? 'Creating Medicine Batch...' : 'Create Medicine Batch'}
            </button>

            {/* Display Form Status/Error Message */}
            {formStatus && (
                 <p className={formStatus.startsWith("Error:") || formStatus.includes("Failed") ? "error-message" : "info-message"} style={{marginTop: '15px'}}>
                     {formStatus}
                 </p>
             )}
        </form>
    );
}

export default CreateMedicineForm;