// client/src/components/CustomerDashboard.js
import React, { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context'; // Import hook
import ReceivePackageButton from './ReceivePackageButton';
import BatchDetails from './BatchDetails';
import { ethers } from 'ethers'; // Use ethers v6
import { ROLES } from '../constants/roles';
// Note: Customers typically don't mark batches destroyed unless maybe expired ones they own.
// Import MarkDestroyedForm if needed.
// import MarkDestroyedForm from './MarkDestroyedForm';

function CustomerDashboard() {
    // Call hook ONCE at the top level
    const {
        account,
        contract,
        isLoading,
        setIsLoading,
        getRevertReason,
        setError, // Use setError from context to display errors centrally if desired
        hasRole,
        error: web3Error // Get potential errors from the context
    } = useWeb3();

    // Component state
    const [view, setView] = useState('receiveMed'); // Default view
    const [statusMessage, setStatusMessage] = useState(''); // For specific action feedback
    const [viewBatchAddr, setViewBatchAddr] = useState(''); // Used for receiving or viewing a specific batch
    const [batchDetails, setBatchDetails] = useState(null);
    const [batchHistory, setBatchHistory] = useState([]);
    const [latitude, setLatitude] = useState(''); // Required for receive/finalize actions
    const [longitude, setLongitude] = useState('');

    // Role check
    const isCustomer = hasRole(ROLES.CUSTOMER_ROLE);

    // --- Helper Functions ---

    // Get device location (basic implementation)
    const getLocation = useCallback(() => {
      setStatusMessage("Attempting to get location...");
      setError(null); // Clear previous errors
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setLatitude(position.coords.latitude.toString());
            setLongitude(position.coords.longitude.toString());
            setStatusMessage("Location acquired successfully.");
            setTimeout(() => setStatusMessage(''), 3000); // Clear message after a delay
          },
          (error) => {
            console.error("Geolocation error:", error);
            setStatusMessage("Could not get location automatically. Please enter manually.");
            // Optionally use setError("Geolocation failed.")
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 } // Options for better accuracy
        );
      } else {
        setStatusMessage("Geolocation not supported by this browser. Please enter manually.");
      }
    }, [setError]); // Add setError as dependency

    // Fetch batch details and history
    const fetchBatchData = useCallback(async () => {
        setStatusMessage(''); setError(null);
        if (!contract || !viewBatchAddr || !ethers.isAddress(viewBatchAddr)) { // ethers v6 check
            setStatusMessage('Please enter a valid batch address.');
            return;
        }
        setIsLoading(true);
        setBatchDetails(null); setBatchHistory([]);
        setStatusMessage('Fetching batch data...');
        try {
            const type = await contract.batchType(viewBatchAddr);
            const medTypeHash = ROLES.MEDICINE; // Customers interact with Medicine

            if (type === ethers.ZeroHash) { // ethers v6 check for zero hash
                 throw new Error(`Batch address ${viewBatchAddr} not found in the system.`);
            }
            if (type !== medTypeHash) {
                throw new Error(`Batch ${viewBatchAddr.substring(0,6)}... is not a Medicine batch.`);
            }

            let details = await contract.getMedicineDetails(viewBatchAddr);
            details.type = 'Medicine'; // Add type for BatchDetails component
            details.batchAddress = viewBatchAddr; // Add address for display

            const history = await contract.getTransactionHistory(viewBatchAddr);

            setBatchDetails(details);
            setBatchHistory(history);
            setStatusMessage(`Details loaded for Medicine batch ${viewBatchAddr.substring(0,6)}...`);

        } catch (err) {
            console.error("Fetch Batch Data Error:", err);
            const reason = getRevertReason(err); // Use error parsing helper
            setError(`Fetch Failed: ${reason}`); // Set error state in context
            setStatusMessage(''); // Clear status on error
            setBatchDetails(null);
            setBatchHistory([]);
        } finally {
            setIsLoading(false);
        }
    }, [contract, viewBatchAddr, setIsLoading, setError, getRevertReason]); // Dependencies for useCallback

    // Finalize a batch (mark as consumed/sold)
    const handleFinalize = async (batchToFinalize) => {
        setStatusMessage(''); setError(null);
        if (!contract || !account || !isCustomer || !ethers.isAddress(batchToFinalize)) {
            setError("Cannot finalize: Wallet/contract issue, invalid address, or wrong role.");
            return;
        }
        const latNum = parseFloat(latitude);
        const lonNum = parseFloat(longitude);
        if (isNaN(latNum) || isNaN(lonNum)) {
           setError("Finalize Failed: Invalid or missing Latitude/Longitude provided.");
           return;
        }

        setIsLoading(true);
        setStatusMessage(`Finalizing batch ${batchToFinalize.substring(0,6)}...`);
        try {
            // Convert coordinates to BigInt for int256 in Solidity (ethers v6)
            const latInt = Math.round(latNum * 1e6);
            const lonInt = Math.round(lonNum * 1e6);

            const tx = await contract.finalizeMedicineBatch(batchToFinalize, latInt, lonInt, { from: account });

            setStatusMessage(`Transaction sent: ${tx.hash}. Waiting for confirmation...`);
            const receipt = await tx.wait(); // Wait for transaction confirmation

            setStatusMessage(`Batch ${batchToFinalize.substring(0,6)}... Finalized (Consumed/Sold)! Tx: ${receipt.hash}`); // Use receipt.hash in v6

            // Optionally refresh batch details if currently viewing the finalized batch
             if (view === 'view' && batchToFinalize === viewBatchAddr) {
                 fetchBatchData(); // Re-fetch to show updated status
             }
             setViewBatchAddr(''); // Clear input after successful finalization

        } catch (err) {
            console.error("Finalize Batch Error:", err);
            const reason = getRevertReason(err);
            // Provide specific feedback based on common errors
            if (reason.includes("InvalidStateForAction")) {
                 setError("Finalize Failed: Batch must be in 'AtCustomer' state.");
            } else if (reason.includes("CallerIsNotCurrentOwner") || reason.includes("RequiresAdminOrOwner")) { // Contract might use either error
                 setError("Finalize Failed: You are not the current owner of this batch.");
            } else {
                setError(`Finalize Failed: ${reason}`);
            }
            setStatusMessage(''); // Clear status message on error
        } finally {
            setIsLoading(false);
        }
    };

    // --- Effects ---

    // Get location on component mount
    useEffect(() => {
        getLocation();
    }, [getLocation]); // Include getLocation in dependency array

    // Clear specific view states when the main view changes
    useEffect(() => {
        setViewBatchAddr(''); // Clear batch address input
        setBatchDetails(null); // Clear fetched details
        setBatchHistory([]); // Clear history
        setStatusMessage(''); // Clear status message
        setError(null); // Clear errors
    }, [view, setError]); // Run when 'view' changes, include setError dependency

    // --- Render Logic ---

    // Early return if the connected account doesn't have the required role
    // This check happens AFTER the hook call, respecting the Rules of Hooks.
    if (!isCustomer) {
        return <p className="error-message">Access Denied. Requires CUSTOMER_ROLE.</p>;
    }

    // Main component JSX
    return (
        <div className="dashboard customer-dashboard">
            <h2>Customer Dashboard</h2>
            <p>Receive Medicine packages and mark them as consumed or sold.</p>

            {/* Location Input/Display */}
             <div className="form-group" style={{display: 'flex', gap: '15px', alignItems: 'flex-end', marginBottom: '20px', paddingBottom: '15px', borderBottom: '1px solid #eee'}}>
                 <div style={{flex: 1}}>
                     <label htmlFor="cust-lat">Current Latitude:</label>
                     <input id="cust-lat" type="number" step="any" value={latitude} onChange={(e) => setLatitude(e.target.value)} required placeholder="Enter Latitude" />
                 </div>
                 <div style={{flex: 1}}>
                     <label htmlFor="cust-lon">Current Longitude:</label>
                     <input id="cust-lon" type="number" step="any" value={longitude} onChange={(e) => setLongitude(e.target.value)} required placeholder="Enter Longitude"/>
                 </div>
                 <button onClick={getLocation} className="secondary" type="button" disabled={isLoading}>
                    {isLoading ? 'Getting...' : 'Get Location'}
                 </button>
            </div>

            {/* Navigation */}
            <nav className="dashboard-nav">
                <button onClick={() => setView('receiveMed')} disabled={view === 'receiveMed'}>Receive Medicine</button>
                <button onClick={() => setView('finalize')} disabled={view === 'finalize'}>Finalize Batch</button>
                {/* <button onClick={() => setView('destroy')} disabled={view === 'destroy'}>Mark Destroyed</button> */} {/* Uncomment if needed */}
                <button onClick={() => setView('view')} disabled={view === 'view'}>View Batch Info</button>
            </nav>

            {/* Display Status/Error Messages */}
            {/* Show specific status message or general error from context */}
            {statusMessage && !isLoading && <p className="info-message">{statusMessage}</p>}
            {web3Error && <p className="error-message">{web3Error}</p>}

            {/* Content Area based on selected view */}
            <div className="dashboard-content">
                 {view === 'receiveMed' && (
                    <div className="dashboard-section">
                        <h3>Receive Medicine Package</h3>
                        <p>Enter the address of the Medicine batch delivered to you:</p>
                         <input
                            type="text"
                            placeholder="Medicine Batch Address"
                            value={viewBatchAddr} // Use state for the input
                            onChange={(e) => setViewBatchAddr(e.target.value)}
                            style={{ width: 'calc(100% - 22px)', marginBottom: '10px' }}
                        />
                        <ReceivePackageButton
                            batchAddress={viewBatchAddr} // Pass the batch address from state
                            expectedReceiverRole={ROLES.CUSTOMER_ROLE} // Customer role needed
                            latitude={latitude}
                            longitude={longitude}
                            onSuccess={() => {
                                setStatusMessage(`Medicine package ${viewBatchAddr.substring(0,6)}... received successfully.`);
                                setViewBatchAddr(''); // Clear input on success
                            }}
                            onError={(msg) => setError(msg)} // Set context error on failure
                        />
                    </div>
                )}

                {view === 'finalize' && (
                     <div className="dashboard-section">
                        <h3>Finalize Medicine Batch (Mark as Consumed/Sold)</h3>
                        <p>Enter the address of the Medicine batch you possess and wish to finalize:</p>
                         <input
                            type="text"
                            placeholder="Medicine Batch Address"
                            value={viewBatchAddr} // Use state for the input
                            onChange={(e) => setViewBatchAddr(e.target.value)}
                            style={{ width: 'calc(100% - 22px)', marginBottom: '10px' }}
                            required
                         />
                         <button
                            onClick={() => handleFinalize(viewBatchAddr)} // Call handler with current input value
                            disabled={isLoading || !contract || !ethers.isAddress(viewBatchAddr) || !latitude || !longitude}
                            className="primary" // Or another appropriate class
                         >
                             {isLoading ? 'Finalizing...' : 'Finalize Batch'}
                         </button>
                         {/* Show warning if location is missing */}
                         {(!latitude || !longitude) && <p style={{fontSize: '0.8em', color: 'orange', marginTop: '5px'}}>Requires current location coordinates.</p>}
                    </div>
                )}

                {/* View Batch Info Section */}
                {view === 'view' && (
                    <div className="dashboard-section">
                        <h3>View Batch Details & History</h3>
                         <div style={{display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px'}}>
                            <input
                                type="text"
                                placeholder="Enter Batch Address"
                                value={viewBatchAddr}
                                onChange={(e) => setViewBatchAddr(e.target.value)}
                                style={{ flexGrow: 1, marginBottom: 0 }}
                            />
                            {/* Call fetchBatchData defined above */}
                            <button
                                onClick={fetchBatchData}
                                disabled={isLoading || !ethers.isAddress(viewBatchAddr)}
                            >
                                Fetch Info
                            </button>
                        </div>
                        {/* Display loading indicator */}
                        {isLoading && viewBatchAddr && <p className="loading-indicator">Loading batch data...</p>}
                        {/* Display batch details if fetched */}
                        {batchDetails && !isLoading && (
                            <BatchDetails details={batchDetails} history={batchHistory} contract={contract} />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default CustomerDashboard;