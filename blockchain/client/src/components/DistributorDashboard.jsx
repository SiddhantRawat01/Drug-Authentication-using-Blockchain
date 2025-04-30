// client/src/components/DistributorDashboard.js
import React, { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context'; // Import hook
import ReceivePackageButton from './ReceivePackageButton';
import TransferForm from './TransferForm';
import MarkDestroyedForm from './MarkDestroyedForm';
import BatchDetails from './BatchDetails';
import { ethers } from 'ethers'; // Use ethers v6
import { ROLES } from '../constants/roles';

function DistributorDashboard() {
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
    const [view, setView] = useState('receiveMed'); // Default view: Receive Medicine
    const [statusMessage, setStatusMessage] = useState(''); // For local action feedback
    const [viewBatchAddr, setViewBatchAddr] = useState(''); // For receiving or viewing a specific batch
    const [batchDetails, setBatchDetails] = useState(null); // To store fetched batch details
    const [batchHistory, setBatchHistory] = useState([]); // To store fetched transaction history
    const [latitude, setLatitude] = useState(''); // Required for receive/transfer/destroy actions
    const [longitude, setLongitude] = useState('');

    // --- Role Check ---
    const isDistributor = hasRole(ROLES.DISTRIBUTOR_ROLE);

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

    // Fetch batch details and history (specific to Medicine for Distributor)
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
            const medTypeHash = ROLES.MEDICINE; // Distributors deal with Medicine

            if (type === ethers.ZeroHash) { // v6 check
                 throw new Error(`Batch address ${viewBatchAddr} not found.`);
            }
            if (type !== medTypeHash) {
                // Distributors generally only handle medicine batches
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
            const reason = getRevertReason(err);
            setError(`Fetch Failed: ${reason}`); // Set context error
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

    // Clear specific view states when the main view changes
    useEffect(() => {
        setViewBatchAddr(''); // Clear address input used in receive/view
        setBatchDetails(null); // Clear fetched details
        setBatchHistory([]); // Clear history
        clearStatus(); // Clear messages/errors
    }, [view, clearStatus]); // Dependencies: view and clearStatus

    // --- Render Logic ---

    // Early return if the connected account doesn't have the Distributor role
    if (!isDistributor) {
        return <p className="error-message">Access Denied. Requires DISTRIBUTOR_ROLE.</p>;
    }

    // Main component JSX
    return (
        <div className="dashboard distributor-dashboard">
            <h2>Distributor Dashboard</h2>
            <p>Receive Medicine batches from Wholesalers, transfer them to Customers.</p>

            {/* Location Input Section (Required for most actions) */}
             <div className="form-group" style={{display: 'flex', gap: '15px', alignItems: 'flex-end', marginBottom: '20px', paddingBottom: '15px', borderBottom: '1px solid #eee'}}>
                 <div style={{flex: 1}}>
                     <label htmlFor="dist-lat">Current Latitude:</label>
                     <input
                        id="dist-lat"
                        type="number"
                        step="any"
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                        required
                        placeholder="Enter Latitude"
                     />
                 </div>
                 <div style={{flex: 1}}>
                     <label htmlFor="dist-lon">Current Longitude:</label>
                     <input
                        id="dist-lon"
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

            {/* Navigation between Distributor actions */}
            <nav className="dashboard-nav">
                <button onClick={() => setView('receiveMed')} disabled={view === 'receiveMed'}>Receive Medicine</button>
                <button onClick={() => setView('transferMed')} disabled={view === 'transferMed'}>Transfer to Customer</button>
                <button onClick={() => setView('destroy')} disabled={view === 'destroy'}>Mark Batch Destroyed</button>
                <button onClick={() => setView('view')} disabled={view === 'view'}>View Batch Info</button>
            </nav>

            {/* Display Status/Error Messages */}
            {statusMessage && !isLoading && <p className="info-message">{statusMessage}</p>}
            {web3Error && <p className="error-message">{web3Error}</p>}

            {/* Content Area based on selected view */}
            <div className="dashboard-content">
                {/* View: Receive Medicine */}
                {view === 'receiveMed' && (
                    <div className="dashboard-section">
                        <h3>Receive Medicine Package</h3>
                        <p>Enter the address of the Medicine batch you are expecting (from a Wholesaler or Manufacturer):</p>
                         <input
                            type="text"
                            placeholder="Medicine Batch Address"
                            value={viewBatchAddr} // Use state for the input
                            onChange={(e) => setViewBatchAddr(e.target.value)}
                            style={{ width: 'calc(100% - 22px)', marginBottom: '10px' }}
                            required
                        />
                        <ReceivePackageButton
                            batchAddress={viewBatchAddr} // Pass the batch address from state
                            expectedReceiverRole={ROLES.DISTRIBUTOR_ROLE} // Distributor role needed
                            latitude={latitude} // Pass current location
                            longitude={longitude}
                            onSuccess={() => {
                                setStatusMessage(`Medicine package ${viewBatchAddr.substring(0,6)}... received successfully.`);
                                setViewBatchAddr(''); // Clear input on success
                            }}
                            onError={(msg) => setError(msg)} // Set context error on failure
                        />
                         {!latitude || !longitude ? <p style={{fontSize: '0.8em', color: 'orange', marginTop: '5px'}}>Requires current location.</p> : null}
                    </div>
                )}

                {/* View: Transfer Medicine to Customer */}
                 {view === 'transferMed' && (
                    <TransferForm
                        batchTypeContext="MEDICINE" // Transferring Medicine
                        allowedSenderRole={ROLES.DISTRIBUTOR_ROLE} // Sender must be Distributor
                        onSuccess={clearStatus} // Clear status on success
                        onError={(msg) => setError(msg)} // Set context error
                    />
                 )}

                 {/* View: Mark Batch Destroyed */}
                {view === 'destroy' && (
                     <MarkDestroyedForm
                        allowedDestroyerRoles={[ROLES.DISTRIBUTOR_ROLE, ROLES.ADMIN_ROLE]} // Distributor or Admin
                        batchTypeContext="MEDICINE" // Distributors typically destroy Medicine they own
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
                                placeholder="Enter Medicine Batch Address"
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

export default DistributorDashboard;