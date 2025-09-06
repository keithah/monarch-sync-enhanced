import { Order, fetchOrders } from '@root/src/shared/api/amazonApi';
import { retailerManager } from '@root/src/shared/api/retailerManager';
import { Retailer, RETAILER_CONFIGS } from '@root/src/shared/api/retailerApi';
import reloadOnUpdate from 'virtual:reload-on-update-in-background-script';
import 'webextension-polyfill';
import { MonarchTransaction, getTransactions, updateMonarchTransaction } from '@root/src/shared/api/monarchApi';
import progressStorage, { ProgressPhase, updateProgress } from '@root/src/shared/storages/progressStorage';
import transactionStorage, { TransactionStatus } from '@root/src/shared/storages/transactionStorage';
import { matchTransactions } from '@root/src/shared/api/matchUtil';
import appStorage, { AuthStatus, FailureReason, LastSync } from '@root/src/shared/storages/appStorage';
import { Action } from '@root/src/shared/types';
import debugStorage, { debugLog } from '@root/src/shared/storages/debugStorage';

reloadOnUpdate('pages/background');

async function checkAlarm() {
  const alarm = await chrome.alarms.get('sync-alarm');

  if (!alarm) {
    const { lastSync } = await appStorage.get();
    const lastTime = new Date(lastSync?.time || 0);
    const sinceLastSync = Date.now() - lastTime.getTime() / (1000 * 60);
    const delayInMinutes = Math.max(0, 24 * 60 - sinceLastSync);

    await chrome.alarms.create('sync-alarm', {
      delayInMinutes: delayInMinutes,
      periodInMinutes: 24 * 60,
    });
  }
}

// Setup alarms for syncing
checkAlarm();
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'sync-alarm') {
    const { amazonStatus, monarchStatus, options } = await appStorage.get();
    if (options.syncEnabled && amazonStatus === AuthStatus.Success && monarchStatus === AuthStatus.Success) {
      await handleFullSync(undefined, () => {});
    }
  }
});

// Repopulate Monarch key when the tab is visited and the user is logged in
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab?.url?.startsWith('chrome://')) {
    return true;
  }
  if (changeInfo.url) {
    const url = new URL(changeInfo.url);
    if (url.hostname === 'app.monarchmoney.com') {
      const appData = await appStorage.get();
      const lastAuth = new Date(appData.lastMonarchAuth);
      if (
        !appData.monarchKey ||
        appData.monarchStatus !== AuthStatus.Success ||
        lastAuth < new Date(Date.now() - 1000 * 60 * 60 * 24 * 7)
      ) {
        // Execute script in the current tab
        const result = await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: () => localStorage['persist:root'],
        });
        try {
          const key = JSON.parse(JSON.parse(result[0].result).user).token;
          if (key) {
            await appStorage.patch({ monarchKey: key, lastMonarchAuth: Date.now(), monarchStatus: AuthStatus.Success });
          } else {
            await appStorage.patch({ monarchStatus: AuthStatus.NotLoggedIn });
          }
        } catch (ex) {
          await appStorage.patch({ monarchStatus: AuthStatus.Failure });
          debugLog(ex);
        }
      }
    }
  }
});

type Payload = {
  year?: string;
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.tab?.url?.startsWith('chrome://')) {
    return true;
  }

  if (message.action === Action.DryRun) {
    handleDryRun(message.payload, sendResponse);
  } else if (message.action === Action.FullSync) {
    handleFullSync(message.payload, sendResponse);
  } else {
    console.warn(`Unknown action: ${message.action}`);
  }

  return true; // indicates we will send a response asynchronously
});

async function inProgress() {
  const progress = await progressStorage.get();
  return progress.phase !== ProgressPhase.Complete && progress.phase !== ProgressPhase.Idle;
}

async function handleDryRun(payload: Payload | undefined, sendResponse: (args: unknown) => void) {
  if (await inProgress()) {
    sendResponse({ success: false });
    return;
  }
  if (await downloadAndStoreTransactions(payload?.year, true)) {
    sendResponse({ success: true });
    return;
  }
  sendResponse({ success: false });
}

async function handleFullSync(payload: Payload | undefined, sendResponse: (args: unknown) => void) {
  if (await inProgress()) {
    sendResponse({ success: false });
    return;
  }
  const downloadResult = await downloadAndStoreTransactions(payload?.year, false);
  if (downloadResult) {
    if (await updateMonarchTransactions(downloadResult)) {
      sendResponse({ success: true });
      return;
    }
  }
  sendResponse({ success: false });
}

async function logSyncComplete(payload: Partial<LastSync>) {
  await debugLog('Sync complete');
  await progressStorage.patch({ phase: ProgressPhase.Complete });
  await appStorage.patch({
    lastSync: {
      time: Date.now(),
      amazonOrders: payload.amazonOrders ?? payload.retailerOrders?.amazon ?? 0, // Backward compatibility
      retailerOrders: payload.retailerOrders ?? {},
      monarchTransactions: payload.monarchTransactions ?? 0,
      transactionsUpdated: payload.transactionsUpdated ?? 0,
      success: payload.success ?? false,
      failureReason: payload.failureReason,
      dryRun: payload.dryRun ?? false,
    },
  });
}

async function downloadAndStoreTransactions(yearString?: string, dryRun: boolean = false) {
  await debugStorage.set({ logs: [] });

  const appData = await appStorage.get();
  const year = yearString ? parseInt(yearString) : undefined;

  if (!appData.monarchKey) {
    await logSyncComplete({ success: false, failureReason: FailureReason.NoMonarchAuth });
    return false;
  }

  await updateProgress(ProgressPhase.AmazonPageScan, 0, 0);

  const allOrders: Order[] = [];
  const retailerOrderCounts: { [key: string]: number } = {};

  // Check which retailers are enabled and fetch orders from each
  const enabledRetailers = [];

  if (appData.retailers?.amazon?.enabled ?? true) {
    enabledRetailers.push(Retailer.Amazon);
  }

  if (appData.retailers?.homedepot?.enabled ?? false) {
    enabledRetailers.push(Retailer.HomeDepot);
  }

  if (appData.retailers?.lowes?.enabled ?? false) {
    enabledRetailers.push(Retailer.Lowes);
  }

  if (enabledRetailers.length === 0) {
    await debugLog('No retailers enabled for sync');
    await logSyncComplete({ success: false, failureReason: FailureReason.NoRetailerOrders });
    return false;
  }

  // Fetch orders from each enabled retailer
  for (const retailer of enabledRetailers) {
    try {
      await debugLog(`Fetching orders from ${retailer}`);
      let orders: Order[];

      if (retailer === Retailer.Amazon) {
        orders = await fetchOrders(year);
      } else {
        orders = await retailerManager.fetchOrdersForRetailer(retailer, year);
      }

      retailerOrderCounts[retailer] = orders.length;
      allOrders.push(...orders);
      await debugLog(`Found ${orders.length} orders from ${retailer}`);
    } catch (e) {
      await debugLog(`Error fetching ${retailer} orders: ${e}`);
      retailerOrderCounts[retailer] = 0;
    }
  }

  if (!allOrders || allOrders.length === 0) {
    await debugLog('No orders found from any enabled retailer');
    await logSyncComplete({
      success: false,
      failureReason: FailureReason.NoRetailerOrders,
      retailerOrders: retailerOrderCounts,
    });
    return false;
  }
  await transactionStorage.patch({
    orders: allOrders,
  });

  await progressStorage.patch({ phase: ProgressPhase.MonarchDownload, total: 1, complete: 0 });

  // Calculate date range based on actual orders instead of fixed ranges
  const orderDates = allOrders.map(order => new Date(order.date)).filter(date => !isNaN(date.getTime()));
  let startDate: Date;
  let endDate: Date;

  if (year) {
    startDate = new Date(year - 1, 11, 23);
    endDate = new Date(year + 1, 0, 8);
  } else {
    // Default: 3-month range for enabled merchants, unless backfill is needed
    const monthsToSearch =
      orderDates.length > 0
        ? // If we have orders, expand search to cover all order dates plus buffer
          Math.max(
            3,
            Math.ceil((Date.now() - Math.min(...orderDates.map(d => d.getTime()))) / (1000 * 60 * 60 * 24 * 30)) + 1,
          )
        : 3; // Default 3 months

    startDate = new Date();
    startDate.setMonth(startDate.getMonth() - monthsToSearch);
    endDate = new Date();
    endDate.setDate(endDate.getDate() + 8);

    if (orderDates.length > 0) {
      const earliestOrder = new Date(Math.min(...orderDates.map(d => d.getTime())));
      const latestOrder = new Date(Math.max(...orderDates.map(d => d.getTime())));
      await debugLog(
        `Expanding search to ${monthsToSearch} months to cover orders from ${
          earliestOrder.toISOString().split('T')[0]
        } to ${latestOrder.toISOString().split('T')[0]}`,
      );
    }
  }

  let monarchTransactions: MonarchTransaction[];
  try {
    await debugLog(
      `Fetching Monarch transactions from ${startDate.toISOString().split('T')[0]} to ${
        endDate.toISOString().split('T')[0]
      }`,
    );

    // First try: fetch transactions for specific retailers
    const enabledRetailerNames = enabledRetailers
      .map(retailer => {
        if (retailer === Retailer.Amazon) {
          return appData.options.amazonMerchant; // Use configured Amazon merchant
        }
        return RETAILER_CONFIGS[retailer]?.monarchMerchant;
      })
      .filter(merchant => merchant && merchant.length > 0);

    monarchTransactions = [];

    if (enabledRetailerNames.length > 0) {
      await debugLog(`Trying specific merchants: ${enabledRetailerNames.join(', ')}`);

      for (const merchantName of enabledRetailerNames) {
        try {
          const merchantTransactions = await getTransactions(appData.monarchKey, merchantName, startDate, endDate);
          await debugLog(`Found ${merchantTransactions.length} transactions for merchant: ${merchantName}`);
          monarchTransactions.push(...merchantTransactions);
        } catch (e) {
          await debugLog(`Failed to fetch transactions for merchant ${merchantName}: ${e}`);
        }
      }
    }

    // Fallback: if specific merchants didn't work or no transactions found, fetch all
    if (monarchTransactions.length === 0) {
      await debugLog('Fallback: fetching all merchants');
      monarchTransactions = await getTransactions(appData.monarchKey, '', startDate, endDate);
    }

    await debugLog(`Final result: ${monarchTransactions.length} transactions fetched`);

    if (!monarchTransactions || monarchTransactions.length === 0) {
      await logSyncComplete({ success: false, failureReason: FailureReason.NoMonarchTransactions });
      return false;
    }
  } catch (ex) {
    await debugLog(ex);
    await logSyncComplete({ success: false, failureReason: FailureReason.MonarchError });
    return false;
  }

  await transactionStorage.patch({
    result: TransactionStatus.Success,
    transactions: monarchTransactions,
  });

  if (dryRun) {
    const matches = matchTransactions(monarchTransactions, allOrders, appData.options.overrideTransactions);
    await logSyncComplete({
      success: true,
      dryRun: true,
      retailerOrders: retailerOrderCounts,
      monarchTransactions: monarchTransactions.length,
      transactionsUpdated: matches.length,
    });
    return { retailerOrderCounts, totalOrders: allOrders.length };
  }

  // Store download info for the update phase
  return { retailerOrderCounts, totalOrders: allOrders.length, monarchTransactions: monarchTransactions.length };
}

async function updateMonarchTransactions(downloadInfo?: {
  retailerOrderCounts: { [key: string]: number };
  totalOrders: number;
}) {
  await debugLog('Starting Monarch transaction update process');
  await progressStorage.patch({ phase: ProgressPhase.MonarchUpload, total: 0, complete: 0 });

  const transactions = await transactionStorage.get();
  const appData = await appStorage.get();

  if (!appData.monarchKey) {
    await logSyncComplete({
      success: false,
      failureReason: FailureReason.NoMonarchAuth,
      retailerOrders: downloadInfo?.retailerOrderCounts ?? {},
      monarchTransactions: transactions.transactions.length,
    });
    return false;
  }

  const matches = matchTransactions(
    transactions.transactions,
    transactions.orders,
    appData.options.overrideTransactions,
  );

  await debugLog(
    `Found ${matches.length} transaction matches out of ${transactions.orders.length} orders and ${transactions.transactions.length} transactions`,
  );

  for (const data of matches) {
    const itemString = data.items
      .map(item => {
        return item.quantity + 'x ' + item.title + ' - $' + item.price.toFixed(2);
      })
      .join('\n\n')
      .trim();
    if (itemString.length === 0) {
      await debugLog('No items found for transaction ' + data.monarch.id);
      continue;
    }
    if (data.monarch.notes === itemString) {
      await debugLog('Transaction ' + data.monarch.id + ' already has correct note');
      continue;
    }

    updateMonarchTransaction(appData.monarchKey, data.monarch.id, itemString);
    await debugLog('Updated transaction ' + data.monarch.id + ' with note ' + itemString);
    await progressStorage.patch({
      total: matches.length,
      complete: matches.indexOf(data) + 1,
    });
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  await logSyncComplete({
    success: true,
    retailerOrders: downloadInfo?.retailerOrderCounts ?? {},
    monarchTransactions: transactions.transactions.length,
    transactionsUpdated: matches.length,
  });
  await progressStorage.patch({ phase: ProgressPhase.Complete });

  return true;
}
