// client/src/components/SupplierDashboard.js
import React, { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context'; // Import hook
import CreateRawMaterialForm from './CreateRawMaterialForm';
import TransferForm from './TransferForm';
import MarkDestroyedForm from './MarkDestroyedForm';
import BatchDetails from './BatchDetails';
import { ethers } from 'ethers'; // Use ethers v6
import { ROLES } from '../constants/roles';

function SupplierDashboard() {
    // Call hook ONCE at the top level
    const {
        account,
        contract,
        isLoading,
        setIsLoading,
        getRevertReason,
        setError, // Use setError from context
        hasRole,
        error: web3Error // Get potential errors from the context
    } = useWeb3();

    // Component state
    const [view, setView] = useState('create'); // Default view for supplier
    const [statusMessage, setStatusMessage] = useState(''); // For specific action feedback
    const [viewBatchAddr, setViewBatchAddr] = useState(''); // For viewing a specific batch
    const [batchDetails, setBatchDetails] = useState(null);
    const [batchHistory, setBatchHistory] = useState([]);
    // Location might be needed for destroy/view actions, less critical for create/initiateTransfer
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');

    // Role check
    const isSupplier = hasRole(ROLES.SUPPLIER_ROLE);

    // --- Helper Functions ---

    // Get device location (optional for supplier, but kept for consistency)
    const getLocation = useCallback(() => {
      setStatusMessage("Attempting to get location...");
      setError(null);
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setLatitude(position.coords.latitude.toString());
            setLongitude(position.coords.longitude.toString());
            setStatusMessage("Location acquired.");
            setTimeout(() => setStatusMessage(''), 3000);
          },
          (error) => {
            console.error("Geolocation error:", error);
            setStatusMessage("Could not get location automatically.");
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      } else {
        setStatusMessage("Geolocation not supported.");
      }
    }, [setError]); // Include setError dependency

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
            const rmTypeHash = ROLES.RAW_MATERIAL;
            const medTypeHash = ROLES.MEDICINE;

            if (type === ethers.ZeroHash) { // ethers v6 check
                 throw new Error(`Batch address ${viewBatchAddr} not found.`);
            }

            let details;
            if (type === rmTypeHash) {
                details = await contract.getRawMaterialDetails(viewBatchAddr);
                details.type = 'RawMaterial';
            } else if (type === medTypeHash) {
                 // Suppliers might want to view medicine batches if needed for context, but usually don't own/modify them
                 details = await contract.getMedicineDetails(viewBatchAddr);
                 details.type = 'Medicine';
                 setStatusMessage("Note: Viewing Medicine batch details as a Supplier.");
            } else {
                 throw new Error(`Unknown batch type found for address ${viewBatchAddr}.`);
            }

            details.batchAddress = viewBatchAddr; // Add address for display consistency

            const history = await contract.getTransactionHistory(viewBatchAddr);

            setBatchDetails(details);
            setBatchHistory(history);
            // Only append to status message if it wasn't set above
            if (!statusMessage.startsWith("Note:")) {
                setStatusMessage(`Details loaded for ${details.type} batch ${viewBatchAddr.substring(0,6)}...`);
            }

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
    }, [contract, viewBatchAddr, setIsLoading, setError, getRevertReason, statusMessage]); // Include statusMessage dependency

    // Clear status messages and errors
    const clearStatus = useCallback(() => {
        setStatusMessage('');
        setError(null);
    }, [setError]);

    // --- Effects ---

    // Get location on component mount
    useEffect(() => {
        // Only get location if needed, or keep for consistency
        // getLocation();
    }, [getLocation]);

    // Clear specific view states when the main view changes
    useEffect(() => {
        setViewBatchAddr('');
        setBatchDetails(null);
        setBatchHistory([]);
        clearStatus(); // Use the memoized clearStatus
    }, [view, clearStatus]); // Include clearStatus dependency

    // --- Render Logic ---

    // Early return if the connected account doesn't have the required role
    if (!isSupplier) {
        return <p className="error-message">Access Denied. Requires SUPPLIER_ROLE.</p>;
    }

    // Main component JSX
    return (
        <div className="dashboard supplier-dashboard">
            <h2>Supplier Dashboard</h2>
            <p>Create and manage Raw Material batches.</p>

            {/* Optional Location Input/Display - uncomment if destroy/view needs it */}
            {/* <div className="form-group" style={{display: 'flex', gap: '15px', alignItems: 'flex-end', marginBottom: '20px', paddingBottom: '15px', borderBottom: '1px solid #eee'}}>
                 <div style={{flex: 1}}>
                     <label htmlFor="supp-lat">Latitude:</label>
                     <input id="supp-lat" type="number" step="any" value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="Enter Latitude" />
                 </div>
                 <div style={{flex: 1}}>
                     <label htmlFor="supp-lon">Longitude:</label>
                     <input id="supp-lon" type="number" step="any" value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="Enter Longitude"/>
                 </div>
                 <button onClick={getLocation} className="secondary" type="button" disabled={isLoading}>Get Location</button>
            </div> */}

            {/* Navigation between Supplier actions */}
            <nav className="dashboard-nav">
                <button onClick={() => setView('create')} disabled={view === 'create'}>Create Batch</button>
                <button onClick={() => setView('transfer')} disabled={view === 'transfer'}>Initiate Transfer</button>
                <button onClick={() => setView('destroy')} disabled={view === 'destroy'}>Mark Destroyed</button>
                <button onClick={() => setView('view')} disabled={view === 'view'}>View Batch Info</button>
            </nav>

            {/* Display Status/Error Messages */}
            {statusMessage && !isLoading && <p className="info-message">{statusMessage}</p>}
            {web3Error && <p className="error-message">{web3Error}</p>}

            {/* Content Area based on selected view */}
            <div className="dashboard-content">
                {view === 'create' && (
                    <CreateRawMaterialForm
                        // Pass callbacks to handle status updates in this parent component
                        onSuccess={() => {
                            clearStatus(); // Clear any previous messages
                            // Optionally add a success message here or rely on form's internal message
                        }}
                        onError={(msg) => setError(msg)} // Set context error on failure
                    />
                )}

                {view === 'transfer' && (
                    <TransferForm
                        batchTypeContext="RAW_MATERIAL" // Specify context for validation
                        allowedSenderRole={ROLES.SUPPLIER_ROLE} // Only supplier can send RM
                        onSuccess={clearStatus} // Clear status on success
                        onError={(msg) => setError(msg)} // Set context error
                    />
                )}

                 {view === 'destroy' && (
                    <MarkDestroyedForm
                        allowedDestroyerRoles={[ROLES.SUPPLIER_ROLE, ROLES.ADMIN_ROLE]} // Supplier or Admin
                        batchTypeContext="RAW_MATERIAL" // Suppliers destroy RM
                        onSuccess={clearStatus}
                        onError={(msg) => setError(msg)}
                    />
                )}

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
                                onClick={fetchBatchData} // Call fetch function defined above
                                disabled={isLoading || !ethers.isAddress(viewBatchAddr)} // ethers v6 check
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

export default SupplierDashboard;