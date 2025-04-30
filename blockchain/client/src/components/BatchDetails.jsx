// client/src/components/BatchDetails.js
import React from 'react';
import TransactionHistory from './TransactionHistory'; // Component to display the logs
import { ethers } from 'ethers'; // Using ethers v6 conventions

/**
 * BatchDetails Component
 *
 * Displays formatted details for either a Raw Material or Medicine batch,
 * along with its transaction history.
 *
 * @param {object} props - The component props.
 * @param {object | null} props.details - The fetched batch details object. Should contain:
 *   - `type`: String identifier ('RawMaterial' or 'Medicine').
 *   - `batchAddress`: The address of the batch contract.
 *   - ... other fields specific to the batch type (e.g., description, quantity, status, owner, etc.).
 * @param {Array<object> | null} props.history - An array of transaction log objects for this batch.
 */
function BatchDetails({ details, history }) {

    // Show a placeholder message if no details have been fetched yet
    if (!details) {
        return <p className="info-message">Enter a batch address and click 'Fetch Batch Info' to see details.</p>;
    }

    // --- Formatting Helper Functions (ethers v6 compatible) ---

    /**
     * Formats an Ethereum address for concise display (e.g., 0x123...abcd).
     * Handles null, undefined, and the zero address.
     * @param {string | undefined | null} addr - The Ethereum address string.
     * @returns {string} Formatted address or 'N/A'.
     */
    const formatAddress = (addr) => {
        // Check for null, undefined, or the zero address constant from ethers v6
        if (!addr || addr === ethers.ZeroAddress) {
            return 'N/A';
        }
        // Basic validation before formatting
        if (typeof addr === 'string' && addr.length === 42 && addr.startsWith('0x')) {
            return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
        }
        // Log error or return indicator if format is unexpected
        console.warn("Invalid address format received:", addr);
        return 'Invalid Addr';
    };

    /**
     * Formats a blockchain timestamp (likely BigInt seconds from contract) into a readable date/time string.
     * @param {bigint | number | string | undefined | null} timestamp - The timestamp value (in seconds).
     * @returns {string} Formatted date string or 'Invalid Date'.
     */
    const formatTimestamp = (timestamp) => {
         try {
             // Ethers v6 often returns BigInt. Convert safely to number for the Date object.
             // Standard JS Date constructor expects milliseconds, so multiply by 1000.
             const tsNumber = Number(timestamp);
             if (isNaN(tsNumber) || tsNumber <= 0) return "Invalid Date"; // Handle non-numeric or zero/negative timestamps
             return new Date(tsNumber * 1000).toLocaleString();
         } catch (e) {
             console.error("Timestamp formatting error:", e, "Value:", timestamp);
             return "Date Error";
         }
    };

    /**
     * Decodes a bytes32 hex string (like description) into a UTF-8 string, trimming trailing null characters.
     * @param {string | undefined | null} bytes32 - The bytes32 hex string.
     * @returns {string} Decoded string or fallback representation.
     */
    const formatBytes32 = (bytes32) => {
        // Check for null, undefined, or the zero hash constant from ethers v6
        if (!bytes32 || bytes32 === ethers.ZeroHash) {
            return 'N/A';
        }
        try {
            // Use decodeBytes32String for ethers v6
            // Remove trailing null characters (\u0000) which are common from Solidity padding
            return ethers.decodeBytes32String(bytes32).replace(/\0/g, '');
        } catch (e) {
            console.error("Bytes32 formatting error:", e, "Value:", bytes32);
            // Provide a fallback if decoding fails (e.g., not valid UTF-8)
            if (typeof bytes32 === 'string' && bytes32.startsWith('0x')) {
                return `${bytes32.substring(0, 10)}... (decode error)`;
            }
            return "Invalid Bytes32";
        }
    };

    /**
     * Safely converts a value (expected BigInt from contract for uint/int types) to a string.
     * @param {bigint | number | string | undefined | null} value - The value to format.
     * @returns {string} String representation or 'N/A'.
     */
    const formatDisplayValue = (value) => {
        try {
            // Check if the value exists before attempting conversion
            if (value !== undefined && value !== null) {
                // .toString() works for BigInt, numbers, and strings already
                return value.toString();
            }
            return 'N/A';
        } catch (e) {
             console.error("Display value formatting error:", e, "Value:", value);
             return "Invalid Number";
        }
    };

    // --- ENUM to String Mappings (Must match Solidity Enum order/values) ---

    // Assumes Solidity enum starts from 0 and increments
    const RawMaterialStatus = {
       0: 'Created',
       1: 'In Transit',         // More readable
       2: 'Received',
       3: 'Destroyed',
    };

    const MedicineStatus = {
       0: 'Created',
       1: 'In Transit to Wholesaler', // More readable
       2: 'At Wholesaler',
       3: 'In Transit to Distributor',
       4: 'At Distributor',
       5: 'In Transit to Customer',
       6: 'At Customer',
       7: 'Consumed / Sold',    // More readable
       8: 'Destroyed',
    };

    // --- Specific Detail Rendering Functions ---

    /** Renders the details section specifically for Raw Material batches. */
    const renderRawMaterialDetails = (rm) => (
        <div className="batch-specific-details">
            <h3>Raw Material Details</h3>
            {/* Display batch address clearly */}
            <p><strong>Address:</strong> {formatAddress(rm.batchAddress)}</p>
            <p><strong>Description:</strong> {formatBytes32(rm.description)}</p>
            {/* Use general formatter for quantity (BigInt) */}
            <p><strong>Quantity:</strong> {formatDisplayValue(rm.quantity)}</p>
            <p><strong>Supplier:</strong> {formatAddress(rm.supplier)}</p>
            <p><strong>Intended Manufacturer:</strong> {formatAddress(rm.intendedManufacturer)}</p>
            {/* Convert status (likely BigInt/number) to Number for mapping lookup */}
            <p><strong>Status:</strong> {RawMaterialStatus[Number(rm.status)] ?? `Unknown (${formatDisplayValue(rm.status)})`}</p>
            {/* Compare transporter address against ZeroAddress */}
            <p><strong>Current Transporter:</strong> {formatAddress(rm.currentTransporter)}</p>
            <p><strong>Creation Time:</strong> {formatTimestamp(rm.creationTime)}</p>
            <p><strong>Last Update Time:</strong> {formatTimestamp(rm.lastUpdateTime)}</p>
        </div>
    );

    /** Renders the details section specifically for Medicine batches. */
    const renderMedicineDetails = (med) => (
         <div className="batch-specific-details">
            <h3>Medicine Details</h3>
            <p><strong>Address:</strong> {formatAddress(med.batchAddress)}</p>
            <p><strong>Description:</strong> {formatBytes32(med.description)}</p>
            <p><strong>Quantity:</strong> {formatDisplayValue(med.quantity)}</p>
            <p><strong>Manufacturer:</strong> {formatAddress(med.manufacturer)}</p>
             {/* Convert status (likely BigInt/number) to Number for mapping lookup */}
            <p><strong>Status:</strong> {MedicineStatus[Number(med.status)] ?? `Unknown (${formatDisplayValue(med.status)})`}</p>
            <p><strong>Current Owner:</strong> {formatAddress(med.currentOwner)}</p>
            <p><strong>Current Transporter:</strong> {formatAddress(med.currentTransporter)}</p>
            <p><strong>Current Destination:</strong> {formatAddress(med.currentDestination)}</p>
            <p><strong>Expiry Date:</strong> {formatTimestamp(med.expiryDate)}</p>
            <p><strong>Creation Time:</strong> {formatTimestamp(med.creationTime)}</p>
            <p><strong>Last Update Time:</strong> {formatTimestamp(med.lastUpdateTime)}</p>
            <p><strong>Raw Material Batches Used:</strong></p>
            {/* Safely check if rawMaterialBatchIds is an array and has items */}
            {Array.isArray(med.rawMaterialBatchIds) && med.rawMaterialBatchIds.length > 0 ? (
                <ul style={{ listStylePosition: 'inside', paddingLeft: '10px', margin: 0 }}>
                    {med.rawMaterialBatchIds.map((rmId, index) => (
                        <li key={index}>{formatAddress(rmId)}</li>
                    ))}
                </ul>
            ) : (
                <p><em>No raw material batches listed.</em></p>
            )}
        </div>
    );

    // --- Main Component Return ---
    return (
        // Use a descriptive class name for the container, 'panel' for common styling
        <div className="batch-details-container panel">

            {/* Conditionally render the correct details section based on the 'type' field */}
            {details.type === 'RawMaterial' && renderRawMaterialDetails(details)}
            {details.type === 'Medicine' && renderMedicineDetails(details)}
            {/* Add handling for unexpected types if necessary */}
            {details.type !== 'RawMaterial' && details.type !== 'Medicine' && (
                <p className="error-message">Error: Unknown batch type '{details.type}' received.</p>
            )}


            {/* Visual separator */}
            <hr style={{margin: '25px 0', borderColor: '#e0e0e0'}} />

            {/* Render the transaction history component, passing the history logs */}
            <TransactionHistory history={history} />
        </div>
    );
}

export default BatchDetails;