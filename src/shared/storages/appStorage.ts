import { StorageType, createStorage } from '@src/shared/storages/base';
import { Retailer } from '@src/shared/api/retailerApi';

export enum Page {
  Default = 'default',
  Options = 'options',
  ManualBackfill = 'manualBackfill',
}

export enum AuthStatus {
  Pending = 'pending',
  NotLoggedIn = 'notLoggedIn',
  Success = 'success',
  Failure = 'failure',
}

export enum FailureReason {
  Unknown = 'unknown',
  NoAmazonOrders = 'noAmazonOrders',
  NoAmazonAuth = 'noAmazonAuth',
  AmazonError = 'amazonError',
  NoRetailerOrders = 'noRetailerOrders',
  RetailerError = 'retailerError',
  NoMonarchAuth = 'noMonarchAuth',
  MonarchError = 'monarchError',
  NoMonarchTransactions = 'noMonarchTransactions',
}

export const mapFailureReasonToMessage = (reason: FailureReason | undefined): string => {
  switch (reason) {
    case FailureReason.NoAmazonOrders:
      return 'No Amazon orders found';
    case FailureReason.NoAmazonAuth:
      return 'Amazon authorization failed';
    case FailureReason.AmazonError:
      return 'An error occurred while fetching Amazon orders';
    case FailureReason.NoRetailerOrders:
      return 'No orders found from enabled retailers';
    case FailureReason.RetailerError:
      return 'An error occurred while fetching retailer orders';
    case FailureReason.NoMonarchAuth:
      return 'Monarch authorization failed';
    case FailureReason.MonarchError:
      return 'An error occurred while fetching Monarch transactions';
    case FailureReason.NoMonarchTransactions:
      return 'No Monarch transactions found';
    default:
      return 'Unknown';
  }
};

export type LastSync = {
  time: number;
  success: boolean;
  amazonOrders?: number; // Keep for backward compatibility
  retailerOrders: { [key: string]: number };
  monarchTransactions: number;
  transactionsUpdated: number;
  failureReason?: FailureReason | undefined;
  dryRun?: boolean;
};

type Options = {
  overrideTransactions: boolean;
  amazonMerchant: string;
  syncEnabled: boolean;
};

type RetailerConfig = {
  enabled: boolean;
  merchantName: string;
  includeLocation?: boolean;
};

type State = {
  page: Page;
  selectedRetailer?: Retailer;
  oldestAmazonYear: number | undefined;
  amazonStatus: AuthStatus;
  lastAmazonAuth: number;
  monarchKey?: string;
  monarchStatus: AuthStatus;
  lastMonarchAuth: number;
  lastSync: LastSync | undefined;
  options: Options;
  retailers?: {
    amazon?: RetailerConfig;
    homedepot?: RetailerConfig;
    lowes?: RetailerConfig;
  };
};

const appStorage = createStorage<State>(
  'page',
  {
    page: Page.Default,
    selectedRetailer: undefined,
    oldestAmazonYear: undefined,
    amazonStatus: AuthStatus.NotLoggedIn,
    lastAmazonAuth: 0,
    monarchKey: undefined,
    monarchStatus: AuthStatus.NotLoggedIn,
    lastMonarchAuth: 0,
    lastSync: undefined,
    options: {
      overrideTransactions: false,
      amazonMerchant: 'Amazon',
      syncEnabled: false,
    },
    retailers: {
      amazon: { enabled: true, merchantName: 'Amazon', includeLocation: false },
      homedepot: { enabled: false, merchantName: 'Home Depot', includeLocation: true },
      lowes: { enabled: false, merchantName: "Lowe's", includeLocation: false },
    },
  },
  {
    storageType: StorageType.Local,
    liveUpdate: true,
  },
);

export default appStorage;
