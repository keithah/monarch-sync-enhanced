import { createStorage, StorageType } from '@src/shared/storages/base';

type State = {
  logs: string[];
};

const debugStorage = createStorage<State>(
  'debug',
  {
    logs: [],
  },
  {
    storageType: StorageType.Local,
    liveUpdate: true,
  },
);

// Simple approach: just enhance console logging with timestamps and structure
// The read-logs.js script will use Chrome DevTools API to read from storage instead

export async function debugLog(val: unknown) {
  let stringValue: string;
  if (typeof val === 'object') {
    stringValue = (val as Error).stack ?? JSON.stringify(val);
  } else if (typeof val === 'string') {
    stringValue = val;
  } else {
    stringValue = val?.toString() || '';
  }

  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${stringValue}`;

  // Write to storage with timestamp
  await debugStorage.set(state => ({
    logs: (state?.logs ?? []).concat([logEntry]),
  }));

  // Enhanced console output with timestamp
  console.log(`🔍 [${timestamp}]`, val);
}

export default debugStorage;
