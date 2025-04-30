// client/src/components/WholesalerDashboard.js
import React, { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context'; // Import hook
import ReceivePackageButton from './ReceivePackageButton';
import TransferForm from './TransferForm';
import MarkDestroyedForm from './MarkDestroyedForm';
import BatchDetails from './BatchDetails';
import { ethers } from 'ethers'; // Use ethers v6
import { ROLES } from '../constants/roles';

function WholesalerDashboard() {
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
    const [view, setView] = useState('receiveMed'); // Default view for wholesaler
    const [statusMessage, setStatusMessage] = useState(''); // For specific action feedback
    const [viewBatchAddr, setViewBatchAddr] = useState(''); // Used for receiving or viewing a specific batch
    const [batchDetails, setBatchDetails] = useState(null);
    const [batchHistory, setBatchHistory] = useState([]);
    const [latitude, setLatitude] = useState(''); // Required for receive/transfer/destroy actions
    const [longitude, setLongitude] = useState('');

    // Role check
    const isWholesaler = hasRole(ROLES.WHOLESALER_ROLE);

    // --- Helper Functions ---

    // Get device location
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
            setStatusMessage("Could not get location automatically. Please enter manually.");
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      } else {
        setStatusMessage("Geolocation not supported.");
      }
    }, [setError]); // Include setError dependency

    // Fetch batch details and history (specific to Medicine for Wholesaler)
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
            const medTypeHash = ROLES.MEDICINE; // Wholesalers deal with Medicine

            if (type === ethers.ZeroHash) { // ethers v6 check
                 throw new Error(`Batch address ${viewBatchAddr} not found.`);
            }
            if (type !== medTypeHash) {
                // Wholesalers generally only handle medicine batches
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
            setError(`Fetch Failed: ${reason}`);
            setStatusMessage('');
            setBatchDetails(null);
            setBatchHistory([]);
        } finally {
            setIsLoading(false);
        }
    }, [contract, viewBatchAddr, setIsLoading, setError, getRevertReason]); // Dependencies

    // Clear status messages and errors
    const clearStatus = useCallback(() => {
        setStatusMessage('');
        setError(null);
    }, [setError]);

    // --- Effects ---

    // Get location on component mount
    useEffect(() => {
        getLocation();
    }, [getLocation]);

    // Clear specific view states when the main view changes
    useEffect(() => {
        setViewBatchAddr('');
        setBatchDetails(null);
        setBatchHistory([]);
        clearStatus();
    }, [view, clearStatus]);

    // --- Render Logic ---

    // Early return if not a wholesaler
    if (!isWholesaler) {
        return <p className="error-message">Access Denied. Requires WHOLESALER_ROLE.</p>;
    }

    // Main component JSX
    return (
        <div className="dashboard wholesaler-dashboard">
            <h2>Wholesaler Dashboard</h2>
            <p>Receive Medicine batches from Manufacturers, transfer them to Distributors.</p>

            {/* Location Input Section */}
            <div className="form-group" style={{display: 'flex', gap: '15px', alignItems: 'flex-end', marginBottom: '20px', paddingBottom: '15px', borderBottom: '1px solid #eee'}}>
                 <div style={{flex: 1}}>
                     <label htmlFor="wh-lat">Current Latitude:</label>
                     <input id="wh-lat" type="number" step="any" value={latitude} onChange={(e) => setLatitude(e.target.value)} required placeholder="Enter Latitude" />
                 </div>
                 <div style={{flex: 1}}>
                     <label htmlFor="wh-lon">Current Longitude:</label>
                     <input id="wh-lon" type="number" step="any" value={longitude} onChange={(e) => setLongitude(e.target.value)} required placeholder="Enter Longitude"/>
                 </div>
                 <button onClick={getLocation} className="secondary" type="button" disabled={isLoading}>
                    {isLoading ? 'Getting...' : 'Get Location'}
                 </button>
            </div>

            {/* Navigation */}
            <nav className="dashboard-nav">
                <button onClick={() => setView('receiveMed')} disabled={view === 'receiveMed'}>Receive Medicine</button>
                <button onClick={() => setView('transferMed')} disabled={view === 'transferMed'}>Transfer to Distributor</button>
                <button onClick={() => setView('destroy')} disabled={view === 'destroy'}>Mark Batch Destroyed</button>
                <button onClick={() => setView('view')} disabled={view === 'view'}>View Batch Info</button>
            </nav>

            {/* Display Status/Error Messages */}
            {statusMessage && !isLoading && <p className="info-message">{statusMessage}</p>}
            {web3Error && <p className="error-message">{web3Error}</p>}

            {/* Content Area based on selected view */}
            <div className="dashboard-content">
                {view === 'receiveMed' && (
                    <div className="dashboard-section">
                        <h3>Receive Medicine Package</h3>
                        <p>Enter the address of the Medicine batch you are expecting (from a Manufacturer):</p>
                         <input
                            type="text"
                            placeholder="Medicine Batch Address"
                            value={viewBatchAddr} // Re-use state for input
                            onChange={(e) => setViewBatchAddr(e.target.value)}
                            style={{ width: 'calc(100% - 22px)', marginBottom: '10px' }}
                            required
                        />
                        <ReceivePackageButton
                            batchAddress={viewBatchAddr}
                            expectedReceiverRole={ROLES.WHOLESALER_ROLE} // Wholesaler receives
                            latitude={latitude}
                            longitude={longitude}
                            onSuccess={() => {
                                setStatusMessage(`Medicine package ${viewBatchAddr.substring(0,6)}... received.`);
                                setViewBatchAddr(''); // Clear input on success
                            }}
                            onError={(msg) => setError(msg)} // Set context error on failure
                        />
                    </div>
                )}

                 {view === 'transferMed' && (
                    <TransferForm
                        batchTypeContext="MEDICINE" // Wholesalers transfer Medicine
                        allowedSenderRole={ROLES.WHOLESALER_ROLE} // Sender must be Wholesaler
                        onSuccess={clearStatus} // Clear status on success
                        onError={(msg) => setError(msg)} // Set context error
                    />
                 )}

                {view === 'destroy' && (
                     <MarkDestroyedForm
                        allowedDestroyerRoles={[ROLES.WHOLESALER_ROLE, ROLES.ADMIN_ROLE]} // Wholesaler or Admin can destroy
                        batchTypeContext="MEDICINE" // Wholesalers typically destroy Medicine they own
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
                                placeholder="Enter Medicine Batch Address"
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

export default WholesalerDashboard;