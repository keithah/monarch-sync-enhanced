import useStorage from '@root/src/shared/hooks/useStorage';
import appStorage, { AuthStatus } from '@root/src/shared/storages/appStorage';
import debugStorage from '@root/src/shared/storages/debugStorage';
import { Label, TextInput, ToggleSwitch } from 'flowbite-react';
import { useCallback, useEffect } from 'react';
import { Retailer, RETAILER_CONFIGS } from '@root/src/shared/api/retailerApi';

export function Options() {
  const appData = useStorage(appStorage);
  const { logs } = useStorage(debugStorage);
  const { options, selectedRetailer, retailers } = appData;

  const downloadDebugLog = useCallback(() => {
    const errorString = logs.join('\n');
    const blob = new Blob([errorString], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({
      url: url,
      filename: 'error-dump.txt',
    });
  }, [logs]);

  const resetMonarchStatus = useCallback(async () => {
    await appStorage.patch({
      monarchKey: undefined,
      lastMonarchAuth: undefined,
      monarchStatus: AuthStatus.NotLoggedIn,
    });
  }, []);

  const resetAmazonStatus = useCallback(async () => {
    await appStorage.patch({ amazonStatus: AuthStatus.NotLoggedIn });
  }, []);

  const updateRetailerMerchantName = useCallback(
    (retailer: Retailer, merchantName: string) => {
      const currentConfig =
        retailer === Retailer.Amazon
          ? retailers?.amazon
          : retailer === Retailer.HomeDepot
            ? retailers?.homedepot
            : retailer === Retailer.Lowes
              ? retailers?.lowes
              : undefined;

      const updatedConfig = {
        enabled: currentConfig?.enabled ?? false,
        merchantName,
        includeLocation: currentConfig?.includeLocation ?? false,
      };

      if (retailer === Retailer.Amazon) {
        appStorage.patch({
          retailers: {
            ...retailers,
            amazon: updatedConfig,
          },
        });
      } else if (retailer === Retailer.HomeDepot) {
        appStorage.patch({
          retailers: {
            ...retailers,
            homedepot: updatedConfig,
          },
        });
      } else if (retailer === Retailer.Lowes) {
        appStorage.patch({
          retailers: {
            ...retailers,
            lowes: updatedConfig,
          },
        });
      }
    },
    [retailers],
  );

  const updateRetailerLocationSetting = useCallback(
    (retailer: Retailer, includeLocation: boolean) => {
      const currentConfig =
        retailer === Retailer.Amazon
          ? retailers?.amazon
          : retailer === Retailer.HomeDepot
            ? retailers?.homedepot
            : retailer === Retailer.Lowes
              ? retailers?.lowes
              : undefined;

      const updatedConfig = {
        enabled: currentConfig?.enabled ?? false,
        merchantName: currentConfig?.merchantName ?? '',
        includeLocation,
      };

      if (retailer === Retailer.Amazon) {
        appStorage.patch({
          retailers: {
            ...retailers,
            amazon: updatedConfig,
          },
        });
      } else if (retailer === Retailer.HomeDepot) {
        appStorage.patch({
          retailers: {
            ...retailers,
            homedepot: updatedConfig,
          },
        });
      } else if (retailer === Retailer.Lowes) {
        appStorage.patch({
          retailers: {
            ...retailers,
            lowes: updatedConfig,
          },
        });
      }
    },
    [retailers],
  );

  useEffect(() => {
    if (!options) {
      appStorage.patch({ options: { overrideTransactions: false, syncEnabled: false, amazonMerchant: 'Amazon' } });
    }
  }, [options]);

  if (!options) {
    return null;
  }

  const currentRetailer = selectedRetailer || Retailer.Amazon;
  const retailerName = RETAILER_CONFIGS[currentRetailer]?.name || 'Amazon';

  const getCurrentMerchantName = () => {
    if (currentRetailer === Retailer.Amazon) {
      return retailers?.amazon?.merchantName || 'Amazon';
    } else if (currentRetailer === Retailer.HomeDepot) {
      return retailers?.homedepot?.merchantName || 'Home Depot';
    } else if (currentRetailer === Retailer.Lowes) {
      return retailers?.lowes?.merchantName || "Lowe's";
    }
    return retailerName;
  };

  const getCurrentIncludeLocation = () => {
    if (currentRetailer === Retailer.Amazon) {
      return retailers?.amazon?.includeLocation ?? false;
    } else if (currentRetailer === Retailer.HomeDepot) {
      return retailers?.homedepot?.includeLocation ?? true;
    } else if (currentRetailer === Retailer.Lowes) {
      return retailers?.lowes?.includeLocation ?? false;
    }
    return false;
  };

  const currentMerchantName = getCurrentMerchantName();
  const currentIncludeLocation = getCurrentIncludeLocation();

  return (
    <div className="m-3">
      <h2 className="text-lg font-semibold mb-4">{retailerName} Settings</h2>

      {/* Override existing notes toggle */}
      <div className="flex flex-col mb-4">
        <ToggleSwitch
          checked={options.overrideTransactions}
          label="Override existing notes"
          onChange={value => {
            appStorage.patch({ options: { ...options, overrideTransactions: value } });
          }}
        />
        <span className="mt-1 text-gray-500 text-xs font-normal">
          If you have already added notes to your {retailerName} transactions, you can choose to override them with the
          item names if they don't already match.
        </span>
      </div>

      {/* Merchant name input */}
      <div className="mb-4">
        <div className="mb-2 block">
          <Label htmlFor="merchant-name" value={`What merchant is ${retailerName} in Monarch?`} />
        </div>
        <TextInput
          value={currentMerchantName}
          type="text"
          id="merchant-name"
          placeholder={`${retailerName} merchant name`}
          onChange={element => {
            updateRetailerMerchantName(currentRetailer, element.target.value);
          }}
        />
        <span className="mt-1 text-gray-500 text-xs font-normal">
          This should match how {retailerName} appears in your Monarch transactions.
        </span>
      </div>

      {/* Location toggle (only for Home Depot) */}
      {currentRetailer === Retailer.HomeDepot && (
        <div className="mb-4">
          <div className="flex flex-col">
            <ToggleSwitch
              checked={currentIncludeLocation}
              label="Include store location in item descriptions"
              onChange={includeLocation => {
                updateRetailerLocationSetting(currentRetailer, includeLocation);
              }}
            />
            <span className="mt-1 text-gray-500 text-xs font-normal">
              When enabled, store numbers will be added to item descriptions (e.g., "Tool Name (Store #1234)")
            </span>
          </div>
        </div>
      )}

      {/* Debug and connection reset options */}
      {logs && logs.length > 0 && (
        <div className="mt-4 mb-4">
          <button className="btn btn-primary" onClick={downloadDebugLog}>
            Download debug logs
          </button>
        </div>
      )}

      <div className="mt-4 mb-4">
        <button className="btn btn-primary" onClick={resetMonarchStatus}>
          Reset Monarch connection status
        </button>
        <span className="mt-1 text-gray-500 text-xs font-normal">
          If GraphQL requests to Monarch API fail, the extension cached an expired token. You must log out from Monarch,
          reset the connection status using this button, and log in again.
        </span>
      </div>

      <div className="mt-2">
        <button className="btn btn-primary" onClick={resetAmazonStatus}>
          Reset Amazon connection status
        </button>
      </div>
    </div>
  );
}

export default Options;
