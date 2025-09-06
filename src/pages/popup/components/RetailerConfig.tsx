import React, { useState, useEffect } from 'react';
import { Label, TextInput, ToggleSwitch, Card } from 'flowbite-react';
import { Retailer, RETAILER_CONFIGS } from '@root/src/shared/api/retailerApi';
import { retailerManager } from '@root/src/shared/api/retailerManager';
import { AuthStatus } from '@root/src/shared/storages/appStorage';

interface RetailerConfigItem {
  retailer: Retailer;
  enabled: boolean;
  merchantName: string;
  connected: boolean;
}

interface RetailerConfigProps {
  onConfigChange?: (configs: RetailerConfigItem[]) => void;
}

const RetailerConfig: React.FC<RetailerConfigProps> = ({ onConfigChange }) => {
  const [configs, setConfigs] = useState<RetailerConfigItem[]>([
    {
      retailer: Retailer.Amazon,
      enabled: true,
      merchantName: 'Amazon',
      connected: false,
    },
    {
      retailer: Retailer.HomeDepot,
      enabled: false,
      merchantName: 'Home Depot',
      connected: false,
    },
  ]);

  // Check connection status for all retailers
  useEffect(() => {
    const checkConnections = async () => {
      const updatedConfigs = await Promise.all(
        configs.map(async config => {
          try {
            let authInfo;
            if (config.retailer === Retailer.Amazon) {
              authInfo = await retailerManager.checkAmazonAuth();
            } else {
              const retailerApi = retailerManager.getRetailer(config.retailer);
              if (retailerApi) {
                authInfo = await retailerApi.checkAuth();
              } else {
                return { ...config, connected: false };
              }
            }

            return {
              ...config,
              connected: authInfo.status === AuthStatus.Success,
            };
          } catch {
            return { ...config, connected: false };
          }
        }),
      );

      setConfigs(updatedConfigs);
      onConfigChange?.(updatedConfigs);
    };

    checkConnections();
  }, []);

  const handleToggle = (retailer: Retailer, enabled: boolean) => {
    const updatedConfigs = configs.map(config => (config.retailer === retailer ? { ...config, enabled } : config));
    setConfigs(updatedConfigs);
    onConfigChange?.(updatedConfigs);
  };

  const handleMerchantNameChange = (retailer: Retailer, merchantName: string) => {
    const updatedConfigs = configs.map(config => (config.retailer === retailer ? { ...config, merchantName } : config));
    setConfigs(updatedConfigs);
    onConfigChange?.(updatedConfigs);
  };

  const openRetailerSite = (retailer: Retailer) => {
    const url = RETAILER_CONFIGS[retailer].orderHistoryUrl;
    window.open(url, '_blank');
  };

  const getStatusIcon = (connected: boolean, enabled: boolean) => {
    if (!enabled) return '⚪';
    return connected ? '✅' : '❌';
  };

  const getStatusText = (connected: boolean, enabled: boolean) => {
    if (!enabled) return 'Disabled';
    return connected ? 'Connected' : 'Not Connected';
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Retailer Configuration</h3>

      {configs.map(config => (
        <Card key={config.retailer} className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-xl">{getStatusIcon(config.connected, config.enabled)}</span>
              <div>
                <h4 className="font-medium">{RETAILER_CONFIGS[config.retailer].name}</h4>
                <p className="text-sm text-gray-600">{getStatusText(config.connected, config.enabled)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <ToggleSwitch checked={config.enabled} onChange={enabled => handleToggle(config.retailer, enabled)} />
              {config.enabled && !config.connected && (
                <button
                  onClick={() => openRetailerSite(config.retailer)}
                  className="text-blue-600 hover:text-blue-800 text-sm underline">
                  Open Site
                </button>
              )}
            </div>
          </div>

          {config.enabled && (
            <div className="mt-3">
              <div className="mb-2">
                <Label htmlFor={`merchant-${config.retailer}`} value="Merchant name in Monarch" className="text-sm" />
              </div>
              <TextInput
                id={`merchant-${config.retailer}`}
                value={config.merchantName}
                onChange={e => handleMerchantNameChange(config.retailer, e.target.value)}
                placeholder={`e.g., ${RETAILER_CONFIGS[config.retailer].name}`}
                className="text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                This should match how {RETAILER_CONFIGS[config.retailer].name} appears in your Monarch transactions
              </p>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
};

export default RetailerConfig;
