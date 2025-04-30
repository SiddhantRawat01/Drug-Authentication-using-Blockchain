// client/src/components/CreateRawMaterialForm.js
import React, { useState, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context'; // Import hook
import { ethers } from 'ethers'; // Use ethers v6

/**
 * Form component for creating new Raw Material batches.
 * Used within the SupplierDashboard.
 *
 * @param {object} props - Component props
 * @param {function} props.onSuccess - Callback function executed on successful batch creation.
 * @param {function} props.onError - Callback function executed on error, passing the error message.
 */
function CreateRawMaterialForm({ onSuccess, onError }) {
    // Get necessary data and functions from Web3 context
    // Call hook ONCE at the top level
    const {
        contract,
        account, // The connected account (sender)
        isLoading,
        setIsLoading,
        getRevertReason,
        setError // Use setError from context for broader display if needed
    } = useWeb3();

    // --- Form State Variables ---
    const [description, setDescription] = useState('');
    const [quantity, setQuantity] = useState('');
    const [manufacturer, setManufacturer] = useState(''); // Intended manufacturer address
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');
    const [formStatus, setFormStatus] = useState(''); // Local status/error message for this form

    // --- Form Submission Handler ---
    const handleSubmit = useCallback(async (e) => {
        e.preventDefault(); // Prevent default browser form submission
        setFormStatus(''); // Clear previous local status
        if (onError) onError(null); // Clear parent/global error state via callback

        // --- Input Validation ---
        if (!contract || !account) {
            const errorMsg = "Wallet not connected or contract not loaded.";
            setFormStatus(`Error: ${errorMsg}`);
            if (onError) onError(errorMsg);
            return;
        }
        if (!ethers.isAddress(manufacturer)) { // v6 address check
             setFormStatus("Error: Invalid Intended Manufacturer Ethereum address (must start with 0x).");
             return;
        }
        const qtyNum = parseInt(quantity);
        if (isNaN(qtyNum) || qtyNum <= 0) {
             setFormStatus("Error: Quantity must be a positive whole number.");
             return;
        }
        const latNum = parseFloat(latitude); // Use float to allow decimals
        const lonNum = parseFloat(longitude);
        if (isNaN(latNum) || isNaN(lonNum)) {
           setFormStatus("Error: Latitude and Longitude must be valid numbers.");
           return;
        }
        if (!description || description.length > 31) {
             setFormStatus("Error: Description is required and cannot exceed 31 characters.");
             return;
        }

        // --- Transaction Processing ---
        setIsLoading(true); // Set loading state
        setFormStatus('Processing batch creation...');

        try {
            // 1. Prepare data for the contract function call

            // Convert description string to bytes32 (ethers v6)
            // Pads with null bytes if shorter, truncates if longer (hence the slice)
            const descriptionBytes32 = ethers.encodeBytes32String(description.slice(0, 31));

            // Convert coordinates to BigInt (for int256 in Solidity)
            // Example: Multiply by 1e6 to store 6 decimal places as an integer
            const latInt = Math.round(latNum * 1e6);
            const lonInt = Math.round(lonNum * 1e6);

            // Quantity is passed as number/string, ethers.js handles BigInt conversion for uint256
            const quantityArg = qtyNum.toString();

            // 2. Call the contract function
            const tx = await contract.createRawMaterial(
                descriptionBytes32,
                quantityArg, // Pass as string or number
                manufacturer, // Already validated as address string
                latInt,
                lonInt,
                // { from: account } // 'from' is usually implicit when using a signer
            );

            setFormStatus(`Transaction sent: ${tx.hash}. Waiting for confirmation...`);

            // 3. Wait for the transaction to be mined
            const receipt = await tx.wait();

            // 4. Attempt to extract the new batch address from the BatchCreated event
            let newBatchAddress = 'N/A';
            try {
                // Find the correct log within the transaction receipt
                const eventSignature = "BatchCreated(bytes32,address,address,uint256)";
                const eventTopic = ethers.id(eventSignature); // Get the event topic hash (ethers v6)

                const batchCreatedLog = receipt.logs?.find(log => log.topics[0] === eventTopic);

                if (batchCreatedLog) {
                    // Decode the event log using the contract's interface
                    const decodedEvent = contract.interface.decodeEventLog(
                        "BatchCreated", // Event name
                        batchCreatedLog.data,
                        batchCreatedLog.topics
                    );
                    // Access the arguments by index or name (check your ABI/event definition)
                    // Assuming event BatchCreated(bytes32 indexed batchType, address indexed batchAddress, address indexed creator, uint timestamp);
                    // The batchAddress is the second indexed topic (index 1 in topics array)
                    // Or if it's non-indexed, it will be in decodedEvent.args array/object
                     if (decodedEvent && decodedEvent.batchAddress) { // Access by name if available
                        newBatchAddress = decodedEvent.batchAddress;
                    } else if (decodedEvent && decodedEvent[1]) { // Access by index as fallback
                         newBatchAddress = decodedEvent[1]; // Assuming address is the second argument
                     }
                }
            } catch (eventError) {
                console.error("Error parsing BatchCreated event:", eventError);
                setFormStatus("Batch created, but failed to extract new address from event logs.");
                // Continue without the address, but log the issue
            }

            // 5. Handle Success
            setFormStatus(`Raw Material Batch Created Successfully! Tx: ${receipt.hash}. New Batch Address: ${newBatchAddress}`);
            if (onSuccess) onSuccess(); // Execute the success callback passed via props

            // 6. Reset form fields
            setDescription('');
            setQuantity('');
            setManufacturer('');
            setLatitude('');
            setLongitude('');

        } catch (err) {
            // 7. Handle Errors
            console.error("Create Raw Material Error:", err);
            const reason = getRevertReason(err); // Use helper to parse revert reason
            setFormStatus(`Error: Creation Failed - ${reason}`);
            if (onError) onError(`Creation Failed: ${reason}`); // Execute error callback
        } finally {
            // 8. Reset Loading State
            setIsLoading(false);
        }
    }, [contract, account, description, quantity, manufacturer, latitude, longitude, setIsLoading, getRevertReason, onSuccess, onError]); // Dependencies for useCallback


    // --- JSX Rendering ---
    return (
        <form onSubmit={handleSubmit} className="form-container">
            <h3>Create New Raw Material Batch</h3>

            {/* Description Input */}
            <div className="form-group">
                <label htmlFor="rm-desc">Description (max 31 chars):</label>
                <input
                    id="rm-desc"
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength="31"
                    required
                    disabled={isLoading} // Disable input while loading
                    placeholder="e.g., Active Pharma Ingredient A"
                />
            </div>

            {/* Quantity Input */}
            <div className="form-group">
                <label htmlFor="rm-qty">Quantity (units):</label>
                <input
                    id="rm-qty"
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    min="1" // Enforce positive number
                    required
                    disabled={isLoading}
                    placeholder="e.g., 1000"
                />
            </div>

            {/* Intended Manufacturer Address Input */}
            <div className="form-group">
                <label htmlFor="rm-manu">Intended Manufacturer Address:</label>
                <input
                    id="rm-manu"
                    type="text"
                    value={manufacturer}
                    onChange={(e) => setManufacturer(e.target.value)}
                    required
                    pattern="^0x[a-fA-F0-9]{40}$" // Basic Ethereum address pattern
                    title="Enter a valid Ethereum address (0x...)"
                    disabled={isLoading}
                    placeholder="0x..."
                />
            </div>

            {/* Latitude and Longitude Inputs */}
             <div className="form-group" style={{display: 'flex', gap: '15px'}}>
                 <div style={{flex: 1}}>
                     <label htmlFor="rm-lat">Starting Latitude:</label>
                     <input
                        id="rm-lat"
                        type="number"
                        step="any" // Allows decimal values
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                        required
                        disabled={isLoading}
                        placeholder="e.g., 40.7128"
                     />
                 </div>
                 <div style={{flex: 1}}>
                     <label htmlFor="rm-lon">Starting Longitude:</label>
                     <input
                        id="rm-lon"
                        type="number"
                        step="any" // Allows decimal values
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value)}
                        required
                        disabled={isLoading}
                        placeholder="e.g., -74.0060"
                     />
                 </div>
            </div>

            {/* Submit Button */}
            <button
                type="submit"
                disabled={isLoading || !contract || !account} // Disable if loading or not connected
            >
                {isLoading ? 'Creating Batch...' : 'Create Raw Material Batch'}
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

export default CreateRawMaterialForm;