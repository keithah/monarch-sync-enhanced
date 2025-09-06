import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, ToggleSwitch } from 'flowbite-react';
import progressStorage, { ProgressPhase } from '@root/src/shared/storages/progressStorage';
import useStorage from '@root/src/shared/hooks/useStorage';
import { checkAmazonAuth } from '@root/src/shared/api/amazonApi';
import appStorage, { AuthStatus, Page } from '@root/src/shared/storages/appStorage';
import ProgressIndicator from './components/ProgressIndicator';
import withErrorBoundary from '@root/src/shared/hoc/withErrorBoundary';
import withSuspense from '@root/src/shared/hoc/withSuspense';
import ConnectionInfo, { ConnectionStatus } from './components/ConnectionInfo';
import { useAlarm } from '@root/src/shared/hooks/useAlarm';
import { Action } from '@root/src/shared/types';
import { Retailer, RETAILER_CONFIGS } from '@root/src/shared/api/retailerApi';
import { retailerManager } from '@root/src/shared/api/retailerManager';

const Main = () => {
  const progress = useStorage(progressStorage);
  const appData = useStorage(appStorage);
  const syncAlarm = useAlarm('sync-alarm');

  // If the action is ongoing for more than 15 seconds, we assume it's stuck and mark it as complete
  const actionOngoing = useMemo(() => {
    return progress.phase !== ProgressPhase.Complete && progress.phase !== ProgressPhase.Idle;
  }, [progress]);
  useEffect(() => {
    if (actionOngoing) {
      if ((progress.lastUpdated || 0) < Date.now() - 15_000) {
        progressStorage.patch({
          phase: ProgressPhase.Complete,
        });
      }
    }
  }, [actionOngoing, progress.lastUpdated]);

  const [checkedAmazon, setCheckedAmazon] = useState(false);
  const [homeDepotConnected, setHomeDepotConnected] = useState(false);
  const [checkedHomeDepot, setCheckedHomeDepot] = useState(false);
  const [lowesConnected, setLowesConnected] = useState(false);
  const [checkedLowes, setCheckedLowes] = useState(false);

  // Check if we need to re-authenticate with Amazon
  useEffect(() => {
    if (
      (appData.amazonStatus === AuthStatus.Success &&
        new Date(appData.lastAmazonAuth).getTime() > Date.now() - 1000 * 60 * 60 * 24) ||
      checkedAmazon
    ) {
      return;
    }
    setCheckedAmazon(true);
    appStorage.patch({ amazonStatus: AuthStatus.Pending }).then(() => {
      checkAmazonAuth().then(amazon => {
        if (amazon.status === AuthStatus.Success) {
          appStorage.patch({
            amazonStatus: AuthStatus.Success,
            lastAmazonAuth: Date.now(),
            oldestAmazonYear: amazon.startingYear,
          });
        } else {
          appStorage.patch({ amazonStatus: amazon.status });
        }
      });
    });
  }, [appData.amazonStatus, appData.lastAmazonAuth, checkedAmazon]);

  // Check Home Depot connection
  useEffect(() => {
    if (checkedHomeDepot) return;
    setCheckedHomeDepot(true);

    const checkHomeDepot = async () => {
      try {
        const homeDepotApi = retailerManager.getRetailer(Retailer.HomeDepot);
        if (homeDepotApi) {
          const authInfo = await homeDepotApi.checkAuth();
          setHomeDepotConnected(authInfo.status === AuthStatus.Success);
        }
      } catch (error) {
        setHomeDepotConnected(false);
      }
    };

    checkHomeDepot();
  }, [checkedHomeDepot]);

  // Check Lowe's connection
  useEffect(() => {
    if (checkedLowes) return;
    setCheckedLowes(true);

    const checkLowes = async () => {
      try {
        const lowesApi = retailerManager.getRetailer(Retailer.Lowes);
        if (lowesApi) {
          const authInfo = await lowesApi.checkAuth();
          setLowesConnected(authInfo.status === AuthStatus.Success);
        }
      } catch (error) {
        setLowesConnected(false);
      }
    };

    checkLowes();
  }, [checkedLowes]);

  const ready =
    appData.amazonStatus === AuthStatus.Success && appData.monarchStatus === AuthStatus.Success && !actionOngoing;

  const forceSync = useCallback(async () => {
    if (!ready) return;

    await chrome.runtime.sendMessage({ action: Action.FullSync });
  }, [ready]);

  return (
    <div className="flex flex-col flex-grow">
      <div className="ml-2">
        <ConnectionInfo
          name="Amazon connection"
          lastUpdated={appData.lastAmazonAuth}
          status={
            appData.amazonStatus === AuthStatus.Pending
              ? ConnectionStatus.Loading
              : appData.amazonStatus === AuthStatus.Success
                ? ConnectionStatus.Success
                : ConnectionStatus.Error
          }
          message={
            appData.amazonStatus === AuthStatus.NotLoggedIn
              ? 'Log in to Amazon and try again.'
              : appData.amazonStatus === AuthStatus.Failure
                ? 'Failed to connect to Amazon. Ensure the extension has been granted access.'
                : undefined
          }
        />
        <ConnectionInfo
          name="Monarch connection"
          lastUpdated={appData.lastMonarchAuth}
          status={appData.monarchStatus === AuthStatus.Success ? ConnectionStatus.Success : ConnectionStatus.Error}
          message={
            appData.monarchStatus === AuthStatus.NotLoggedIn
              ? 'Open Monarch and log in to enable syncing.'
              : appData.monarchStatus === AuthStatus.Failure
                ? 'Log in to Monarch and try again.'
                : undefined
          }
        />
      </div>

      <div className="ml-2">
        {/* Amazon Toggle */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2">
            <span
              className="text-green-600 cursor-pointer hover:text-green-800"
              onClick={() => appStorage.patch({ page: Page.Options, selectedRetailer: Retailer.Amazon })}>
              ✅ Amazon connection
            </span>
          </div>
          <ToggleSwitch
            checked={appData.retailers?.amazon?.enabled ?? true}
            onChange={enabled => {
              appStorage.patch({
                retailers: {
                  ...appData.retailers,
                  amazon: {
                    enabled,
                    merchantName: appData.retailers?.amazon?.merchantName || 'Amazon',
                  },
                },
              });
            }}
          />
        </div>

        {/* Home Depot Toggle */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2">
            <span
              className={`cursor-pointer hover:opacity-80 ${homeDepotConnected ? 'text-green-600' : 'text-gray-600'}`}
              onClick={() => appStorage.patch({ page: Page.Options, selectedRetailer: Retailer.HomeDepot })}>
              {homeDepotConnected ? '✅' : '❌'} Home Depot connection
            </span>
          </div>
          <ToggleSwitch
            checked={appData.retailers?.homedepot?.enabled ?? false}
            onChange={enabled => {
              appStorage.patch({
                retailers: {
                  ...appData.retailers,
                  homedepot: {
                    enabled,
                    merchantName: appData.retailers?.homedepot?.merchantName || 'Home Depot',
                  },
                },
              });
            }}
          />
        </div>

        {/* Lowe's Toggle */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2">
            <span
              className={`cursor-pointer hover:opacity-80 ${lowesConnected ? 'text-green-600' : 'text-gray-600'}`}
              onClick={() => appStorage.patch({ page: Page.Options, selectedRetailer: Retailer.Lowes })}>
              {lowesConnected ? '✅' : '❌'} Lowe's connection
            </span>
          </div>
          <ToggleSwitch
            checked={appData.retailers?.lowes?.enabled ?? false}
            onChange={enabled => {
              appStorage.patch({
                retailers: {
                  ...appData.retailers,
                  lowes: {
                    enabled,
                    merchantName: appData.retailers?.lowes?.merchantName || "Lowe's",
                  },
                },
              });
            }}
          />
        </div>
      </div>

      <div className="flex flex-col flex-grow items-center justify-center">
        <ProgressIndicator progress={progress} />
      </div>

      <div className="flex flex-row m-3 items-center">
        <div className="flex flex-col">
          <ToggleSwitch
            checked={appData.options.syncEnabled}
            label="Sync enabled"
            onChange={value => {
              appStorage.patch({ options: { ...appData.options, syncEnabled: value } });
            }}
          />
          <span className="text-gray-500 text-xs font-normal">
            When enabled, sync will run automatically every 24 hours.
          </span>
          {appData.options.syncEnabled && (
            <span className="text-xs font-normal">
              Next sync: {syncAlarm ? new Date(syncAlarm.scheduledTime).toLocaleTimeString() : '...'}
            </span>
          )}
        </div>
        <Button color="cyan" disabled={!ready} onClick={forceSync}>
          Force sync
        </Button>
      </div>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Main, <div> Loading ... </div>), <div> Error Occur </div>);
