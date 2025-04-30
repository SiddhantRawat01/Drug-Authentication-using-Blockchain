// client/src/components/ManufacturerDashboard.js
import React, { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context'; // Import hook
import CreateMedicineForm from './CreateMedicineForm';
import TransferForm from './TransferForm';
import MarkDestroyedForm from './MarkDestroyedForm';
import ReceivePackageButton from './ReceivePackageButton'; // To receive RM
import BatchDetails from './BatchDetails';
import { ethers } from 'ethers'; // Use ethers v6
import { ROLES } from '../constants/roles';

function ManufacturerDashboard() {
    // Call hook ONCE at the top level to get context values
    const {
        account,
        contract,
        isLoading,
        setIsLoading,
        getRevertReason,
        setError, // Use setError from context
        hasRole,
        error: web3Error // Get potential errors from context
    } = useWeb3();

    // --- Component State ---
    const [view, setView] = useState('createMed'); // Default view: Create Medicine
    const [statusMessage, setStatusMessage] = useState(''); // For local action feedback
    const [viewBatchAddr, setViewBatchAddr] = useState(''); // For receiving or viewing a specific batch
    const [batchDetails, setBatchDetails] = useState(null); // To store fetched batch details
    const [batchHistory, setBatchHistory] = useState([]); // To store fetched transaction history
    const [latitude, setLatitude] = useState(''); // Required for receive/create/transfer/destroy actions
    const [longitude, setLongitude] = useState('');

    // --- Role Check ---
    const isManufacturer = hasRole(ROLES.MANUFACTURER_ROLE);

    // --- Helper Functions ---

    // Get device location
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
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
            setStatusMessage("Geolocation not supported by this browser. Please enter manually.");
        }
    }, [setError]); // Add setError dependency

    // Fetch batch details (can fetch RM or Medicine)
    const fetchBatchData = useCallback(async () => {
        setStatusMessage(''); setError(null);
        if (!contract || !viewBatchAddr || !ethers.isAddress(viewBatchAddr)) { // v6 check
            setStatusMessage('Please enter a valid batch address.');
            return;
        }
        setIsLoading(true);
        setBatchDetails(null); setBatchHistory([]);
        setStatusMessage('Fetching batch data...');
        try {
            const type = await contract.batchType(viewBatchAddr);
            const rmTypeHash = ROLES.RAW_MATERIAL;
            const medTypeHash = ROLES.MEDICINE;

            if (type === ethers.ZeroHash) { // v6 check
                 throw new Error(`Batch address ${viewBatchAddr} not found in the system.`);
            }

            let details;
            if (type === rmTypeHash) {
                details = await contract.getRawMaterialDetails(viewBatchAddr);
                details.type = 'RawMaterial';
            } else if (type === medTypeHash) {
                 details = await contract.getMedicineDetails(viewBatchAddr);
                 details.type = 'Medicine';
            } else {
                 throw new Error(`Unknown or unexpected batch type found for address ${viewBatchAddr}.`);
            }

            details.batchAddress = viewBatchAddr; // Add address for display consistency

            const history = await contract.getTransactionHistory(viewBatchAddr);

            setBatchDetails(details);
            setBatchHistory(history);
            setStatusMessage(`Details loaded for ${details.type} batch ${viewBatchAddr.substring(0,6)}...`);

        } catch (err) {
            console.error("Fetch Batch Data Error:", err);
            const reason = getRevertReason(err);
            setError(`Fetch Failed: ${reason}`);
            setStatusMessage('');
            setBatchDetails(null);
            setBatchHistory([]);
        } finally {
            setIsLoading(false);
        }
    }, [contract, viewBatchAddr, setIsLoading, setError, getRevertReason]); // Dependencies

    // Clear status message and global error
    const clearStatus = useCallback(() => {
        setStatusMessage('');
        setError(null);
    }, [setError]);

    // --- Effects ---

    // Get location when component mounts
    useEffect(() => {
        getLocation();
    }, [getLocation]);

    // Reset view-specific states when the main view changes
    useEffect(() => {
        setViewBatchAddr(''); // Clear address input used in receive/view
        setBatchDetails(null); // Clear fetched details
        setBatchHistory([]); // Clear history
        clearStatus(); // Clear messages/errors
    }, [view, clearStatus]); // Dependencies: view and clearStatus

    // --- Render Logic ---

    // Early return if the connected account doesn't have the Manufacturer role
    if (!isManufacturer) {
        return <p className="error-message">Access Denied. Requires MANUFACTURER_ROLE.</p>;
    }

    // Main component JSX
    return (
        <div className="dashboard manufacturer-dashboard">
            <h2>Manufacturer Dashboard</h2>
            <p>Create Medicine batches, receive Raw Materials, transfer Medicine.</p>

            {/* Location Input Section (Required for most actions) */}
             <div className="form-group" style={{display: 'flex', gap: '15px', alignItems: 'flex-end', marginBottom: '20px', paddingBottom: '15px', borderBottom: '1px solid #eee'}}>
                 <div style={{flex: 1}}>
                     <label htmlFor="manu-lat">Current Latitude:</label>
                     <input
                        id="manu-lat"
                        type="number"
                        step="any"
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                        required
                        placeholder="Enter Latitude"
                     />
                 </div>
                 <div style={{flex: 1}}>
                     <label htmlFor="manu-lon">Current Longitude:</label>
                     <input
                        id="manu-lon"
                        type="number"
                        step="any"
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value)}
                        required
                        placeholder="Enter Longitude"
                     />
                 </div>
                 <button onClick={getLocation} className="secondary" type="button" disabled={isLoading}>
                    {isLoading ? 'Getting...' : 'Get Location'}
                 </button>
            </div>

            {/* Navigation between Manufacturer actions */}
            <nav className="dashboard-nav">
                <button onClick={() => setView('createMed')} disabled={view === 'createMed'}>Create Medicine</button>
                <button onClick={() => setView('receiveRM')} disabled={view === 'receiveRM'}>Receive Raw Material</button>
                <button onClick={() => setView('transferMed')} disabled={view === 'transferMed'}>Transfer Medicine</button>
                <button onClick={() => setView('destroy')} disabled={view === 'destroy'}>Mark Batch Destroyed</button>
                <button onClick={() => setView('view')} disabled={view === 'view'}>View Batch Info</button>
            </nav>

            {/* Display Status/Error Messages */}
            {statusMessage && !isLoading && <p className="info-message">{statusMessage}</p>}
            {web3Error && <p className="error-message">{web3Error}</p>}

            {/* Content Area based on selected view */}
            <div className="dashboard-content">
                {/* View: Create Medicine */}
                {view === 'createMed' && (
                    <CreateMedicineForm
                        // Pass location if CreateMedicineForm needs it directly,
                        // otherwise it's implicitly used when calling the contract
                        onSuccess={clearStatus} // Clear status messages on success
                        onError={(msg) => setError(msg)} // Set global error state on failure
                    />
                )}

                {/* View: Receive Raw Material */}
                {view === 'receiveRM' && (
                    <div className="dashboard-section">
                        <h3>Receive Raw Material Package</h3>
                        <p>Enter the address of the Raw Material batch you are expecting (must match the 'Intended Manufacturer'):</p>
                         <input
                            type="text"
                            placeholder="Raw Material Batch Address"
                            value={viewBatchAddr} // Use state for the input
                            onChange={(e) => setViewBatchAddr(e.target.value)}
                            style={{ width: 'calc(100% - 22px)', marginBottom: '10px' }}
                            required
                        />
                        <ReceivePackageButton
                            batchAddress={viewBatchAddr} // Pass the batch address from state
                            expectedReceiverRole={ROLES.MANUFACTURER_ROLE} // Manufacturer receives RM
                            latitude={latitude} // Pass current location
                            longitude={longitude}
                            onSuccess={() => {
                                setStatusMessage(`Raw Material package ${viewBatchAddr.substring(0,6)}... received successfully.`);
                                setViewBatchAddr(''); // Clear input on success
                            }}
                            onError={(msg) => setError(msg)} // Set context error on failure
                        />
                         {!latitude || !longitude ? <p style={{fontSize: '0.8em', color: 'orange', marginTop: '5px'}}>Requires current location.</p> : null}
                    </div>
                )}

                 {/* View: Transfer Medicine */}
                 {view === 'transferMed' && (
                    <TransferForm
                        batchTypeContext="MEDICINE" // Transferring Medicine
                        allowedSenderRole={ROLES.MANUFACTURER_ROLE} // Only Manufacturer sends Medicine from 'Created' state
                        onSuccess={clearStatus}
                        onError={(msg) => setError(msg)}
                    />
                )}

                {/* View: Mark Batch Destroyed */}
                {view === 'destroy' && (
                     <MarkDestroyedForm
                        // Manufacturer can destroy Meds they own (e.g., in 'Created' state)
                        // or perhaps Raw Materials they have received but won't use?
                        // Adjust allowedDestroyerRoles based on exact business logic.
                        allowedDestroyerRoles={[ROLES.MANUFACTURER_ROLE, ROLES.ADMIN_ROLE]}
                        // Context 'ANY' allows destroying RM or Med based on ownership/state checks
                        // done within MarkDestroyedForm or the contract itself.
                        batchTypeContext="ANY"
                        onSuccess={clearStatus}
                        onError={(msg) => setError(msg)}
                    />
                )}

                {/* View: View Batch Info */}
                {view === 'view' && (
                    <div className="dashboard-section">
                        <h3>View Batch Details & History</h3>
                         <div style={{display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px'}}>
                            <input
                                type="text"
                                placeholder="Enter Batch Address (RM or Medicine)"
                                value={viewBatchAddr}
                                onChange={(e) => setViewBatchAddr(e.target.value)}
                                style={{ flexGrow: 1, marginBottom: 0 }}
                            />
                            <button
                                onClick={fetchBatchData} // Call fetch function
                                disabled={isLoading || !ethers.isAddress(viewBatchAddr)} // v6 check
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

export default ManufacturerDashboard;