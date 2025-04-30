// client/src/components/TransactionHistory.js
import React from 'react';
import { ethers } from 'ethers'; // Use ethers v6

/**
 * Renders a table displaying the transaction history for a batch.
 *
 * @param {object} props - Component props.
 * @param {Array<object> | null | undefined} props.history - An array of transaction log objects fetched from the contract.
 *                                                          Each object is expected to have properties like index, timestamp,
 *                                                          actor, involvedParty, eventCode, latitude, longitude,
 *                                                          dataHash, previousLogHash.
 */
function TransactionHistory({ history }) {

    // Display message if history is not available or empty
    if (!history || !Array.isArray(history) || history.length === 0) {
        return <p className="info-message">No transaction history found for this batch.</p>;
    }

    // --- Formatting Helper Functions (ethers v6 compatible) ---

    /** Formats an Ethereum address for display (e.g., 0x123...abcd). */
    const formatAddress = (addr) => {
        // Check against ZeroAddress in v6 and handle null/undefined
        if (!addr || addr === ethers.ZeroAddress) return 'N/A';
        // Basic check if it looks like an address before formatting
        if (typeof addr === 'string' && addr.length === 42 && addr.startsWith('0x')) {
            return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
        }
        return 'Invalid Address';
    };

    /** Formats a bytes32 hex string (like hashes) for display. */
    const formatHash = (hash) => {
        // Check against ZeroHash in v6 and handle null/undefined
        if (!hash || hash === ethers.ZeroHash) return 'N/A';
        // Basic check if it looks like a hash
        if (typeof hash === 'string' && hash.length === 66 && hash.startsWith('0x')) {
             return `${hash.substring(0, 8)}...${hash.substring(hash.length - 6)}`;
        }
        return 'Invalid Hash';
    };

    /** Formats a blockchain timestamp (BigInt seconds) into a locale string. */
    const formatTimestamp = (timestamp) => {
         try {
             // Ethers v6 returns BigInt. Convert safely to number. Date expects ms.
             const tsNumber = Number(timestamp);
             if (isNaN(tsNumber)) return "Invalid Date";
             return new Date(tsNumber * 1000).toLocaleString();
         } catch (e) {
             console.error("Timestamp formatting error:", e, "Value:", timestamp);
             return "Date Error";
         }
    };

    /** Formats latitude and longitude (BigInt, potentially scaled) into a string. */
     const formatCoordinates = (latBN, lonBN) => {
        try {
            // Contract likely returns BigInt. Convert to number for calculation.
            // Assuming coordinates were stored multiplied by 1e6
            const scaleFactor = 1e6;
            const lat = Number(latBN) / scaleFactor;
            const lon = Number(lonBN) / scaleFactor;

            // Check if the numbers are valid after conversion
            if (isNaN(lat) || isNaN(lon)) return "Invalid Coords";

            // Format to a fixed number of decimal places
            return `Lat: ${lat.toFixed(6)}, Lon: ${lon.toFixed(6)}`;
        } catch (e) {
            console.error("Coordinate formatting error:", e, "Lat:", latBN, "Lon:", lonBN);
            return "Coord Error";
        }
    };

    /** Decodes the eventCode (bytes32) into a human-readable string. */
    const decodeEventCode = (code) => {
        // Mapping from bytes32 hash (generated using ethers.id) to readable string
        // Ensure these strings exactly match the ones hashed in your Solidity contract
        const codeMap = {
            [ethers.id("RawMaterial Created")]: "RM Created",
            [ethers.id("Medicine Created")]: "Med Created",
            [ethers.id("RawMaterial Transfer Initiated")]: "RM Transfer Init",
            [ethers.id("Medicine Transfer Initiated")]: "Med Transfer Init",
            [ethers.id("RawMaterial Received")]: "RM Received",
            [ethers.id("Medicine Received")]: "Med Received",
            [ethers.id("Medicine Consumed/Sold")]: "Med Finalized",
            [ethers.id("RawMaterial Destroyed")]: "RM Destroyed",
            [ethers.id("Medicine Destroyed")]: "Med Destroyed",
            // Add any other custom log event codes defined in your contract
        };
        // Return the mapped string or a shortened hash as a fallback
        return codeMap[code] || formatHash(code);
    };

    // --- Component Render ---
    return (
        <div className="transaction-history">
            <h3>Transaction History</h3>
            <div style={{ overflowX: 'auto' }}> {/* Add horizontal scroll for smaller screens */}
                <table className="tx-history-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Timestamp</th>
                            <th>Event</th>
                            <th>Actor</th>
                            <th>Involved Party</th>
                            <th>Location</th>
                            <th>Data Hash</th>
                            <th>Prev. Log Hash</th>
                        </tr>
                    </thead>
                    <tbody>
                        {/* Map over the history array safely */}
                        {history.map((log) => (
                            // Use the log index as the key (assuming it's unique for the batch)
                            // Safely convert BigInt index to string/number for the key
                            <tr key={log.index?.toString() ?? Math.random()}> {/* Fallback key if index is missing */}
                                {/* Safely convert BigInt index */}
                                <td>{log.index?.toString() ?? '?'}</td>
                                <td>{formatTimestamp(log.timestamp)}</td>
                                <td>{decodeEventCode(log.eventCode)}</td>
                                <td>{formatAddress(log.actor)}</td>
                                {/* involvedParty might be ZeroAddress */}
                                <td>{formatAddress(log.involvedParty)}</td>
                                <td>{formatCoordinates(log.latitude, log.longitude)}</td>
                                <td>{formatHash(log.dataHash)}</td>
                                <td>{formatHash(log.previousLogHash)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default TransactionHistory;