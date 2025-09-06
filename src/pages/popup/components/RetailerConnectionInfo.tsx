import React, { useEffect, useState } from 'react';
import { Spinner } from 'flowbite-react';
import { Retailer, RETAILER_CONFIGS } from '@root/src/shared/api/retailerApi';
import { retailerManager } from '@root/src/shared/api/retailerManager';
import { AuthStatus } from '@root/src/shared/storages/appStorage';

export enum ConnectionStatus {
  Pending = 'pending',
  Connected = 'connected',
  Disconnected = 'disconnected',
}

interface RetailerConnectionInfoProps {
  retailer: Retailer;
}

const RetailerConnectionInfo: React.FC<RetailerConnectionInfoProps> = ({ retailer }) => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.Pending);
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    checkRetailerConnection();
  }, [retailer]);

  const checkRetailerConnection = async () => {
    setStatus(ConnectionStatus.Pending);

    try {
      let authInfo;

      if (retailer === Retailer.Amazon) {
        authInfo = await retailerManager.checkAmazonAuth();
      } else {
        const retailerApi = retailerManager.getRetailer(retailer);
        if (!retailerApi) {
          setStatus(ConnectionStatus.Disconnected);
          setMessage(`${RETAILER_CONFIGS[retailer].name} is not supported yet`);
          return;
        }
        authInfo = await retailerApi.checkAuth();
      }

      if (authInfo.status === AuthStatus.Success) {
        setStatus(ConnectionStatus.Connected);
        setMessage(`Connected to ${RETAILER_CONFIGS[retailer].name}`);
      } else if (authInfo.status === AuthStatus.NotLoggedIn) {
        setStatus(ConnectionStatus.Disconnected);
        setMessage(`Please log in to ${RETAILER_CONFIGS[retailer].name} first`);
      } else {
        setStatus(ConnectionStatus.Disconnected);
        setMessage(`Failed to connect to ${RETAILER_CONFIGS[retailer].name}`);
      }
    } catch (error) {
      setStatus(ConnectionStatus.Disconnected);
      setMessage(`Error connecting to ${RETAILER_CONFIGS[retailer].name}`);
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case ConnectionStatus.Connected:
        return 'text-green-600';
      case ConnectionStatus.Disconnected:
        return 'text-red-600';
      default:
        return 'text-yellow-600';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case ConnectionStatus.Connected:
        return '✅';
      case ConnectionStatus.Disconnected:
        return '❌';
      default:
        return <Spinner size="sm" />;
    }
  };

  const handleRetailerLinkClick = () => {
    window.open(RETAILER_CONFIGS[retailer].orderHistoryUrl, '_blank');
  };

  return (
    <div className="mb-4 p-3 border rounded-lg bg-gray-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{getStatusIcon()}</span>
          <span className={`font-medium ${getStatusColor()}`}>{RETAILER_CONFIGS[retailer].name}</span>
        </div>
        {status === ConnectionStatus.Disconnected && (
          <button onClick={handleRetailerLinkClick} className="text-blue-600 hover:text-blue-800 text-sm underline">
            Open {RETAILER_CONFIGS[retailer].name}
          </button>
        )}
      </div>
      <p className={`text-sm mt-1 ${getStatusColor()}`}>{message}</p>
    </div>
  );
};

export default RetailerConnectionInfo;
