import { debugLog } from '../storages/debugStorage';
import { AuthStatus } from '../storages/appStorage';
import { RetailerApi, RetailerInfo, Order, Item, OrderTransaction, Retailer } from './retailerApi';

export class LowesApi implements RetailerApi {
  retailer = Retailer.Lowes;

  async checkAuth(): Promise<RetailerInfo> {
    try {
      debugLog("Checking Lowe's authentication");

      // Find an active Lowe's tab
      const tabs = await new Promise<chrome.tabs.Tab[]>(resolve => {
        chrome.tabs.query({ url: '*://*.lowes.com/*' }, resolve);
      });

      const targetTab = tabs.find(tab => tab.url?.includes('lowes.com'));

      if (!targetTab) {
        await debugLog("No Lowe's tab found");
        return {
          status: AuthStatus.NotLoggedIn,
        };
      }

      // Check authentication by trying to access the orders API
      const result = await chrome.scripting.executeScript({
        target: { tabId: targetTab.id! },
        func: async (): Promise<{ error?: string; success?: boolean; identityId?: string }> => {
          try {
            // Extract user authentication from cookies
            const userGcpCookie = document.cookie.split('; ').find(row => row.startsWith('user-gcp='));

            if (!userGcpCookie) {
              return { error: 'Not logged in - no user-gcp cookie found' };
            }

            let identityId;
            try {
              const userGcpValue = decodeURIComponent(userGcpCookie.split('=')[1]);
              const userData = JSON.parse(userGcpValue);

              if (!userData.isRegistered || !userData.identityId) {
                return { error: 'User not properly authenticated' };
              }

              identityId = userData.identityId;
            } catch (e) {
              return { error: 'Failed to parse user authentication data' };
            }

            // Test API access with a minimal request
            const response = await fetch('https://www.lowes.com/api/mylowes/orders', {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': navigator.userAgent,
                Accept: 'application/json',
                Referer: 'https://www.lowes.com/mylowes/orders',
              },
              body: JSON.stringify({
                orderType: 'BOTH',
                startDate: new Date().toISOString().split('T')[0], // Today only
                endDate: new Date().toISOString().split('T')[0],
                verbose: false,
                offset: 1,
                maxResults: 1,
              }),
            });

            if (response.status === 401 || response.status === 403) {
              return { error: 'Authentication failed' };
            }

            if (response.ok) {
              return {
                success: true,
                identityId: identityId.substring(0, 8) + '...', // Log partial for debugging
              };
            }

            return { error: `API test failed with status: ${response.status}` };
          } catch (e: unknown) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        },
      });

      const scriptResult = result[0].result;

      if (scriptResult.error) {
        await debugLog(`Lowe's auth check failed: ${scriptResult.error}`);
        return {
          status: AuthStatus.NotLoggedIn,
        };
      }

      if (scriptResult.success) {
        await debugLog(`Lowe's auth success - identityId: ${scriptResult.identityId}`);
        return {
          status: AuthStatus.Success,
          startingYear: new Date().getFullYear() - 5,
        };
      }

      return {
        status: AuthStatus.Failure,
      };
    } catch (e) {
      await debugLog("Lowe's auth failed with error: " + e);
      return {
        status: AuthStatus.Failure,
      };
    }
  }

  async fetchOrders(year: number | undefined): Promise<Order[]> {
    try {
      const startDate = year
        ? `${year}-01-01`
        : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const endDate = new Date().toISOString().split('T')[0];

      await debugLog(`Fetching Lowe's orders from ${startDate} to ${endDate} (year: ${year || 'current'})`);

      // Find an active Lowe's tab
      const tabs = await new Promise<chrome.tabs.Tab[]>(resolve => {
        chrome.tabs.query({ url: '*://*.lowes.com/*' }, resolve);
      });

      const targetTab = tabs.find(tab => tab.url?.includes('lowes.com'));

      if (!targetTab) {
        await debugLog("No Lowe's tab found, please visit lowes.com first");
        return [];
      }

      await debugLog(`Using Lowe's tab: ${targetTab.url}`);

      // Execute API request in page context
      const result = await chrome.scripting.executeScript({
        target: { tabId: targetTab.id! },
        func: async (
          startDate: string,
          endDate: string,
        ): Promise<{ error?: string; success?: boolean; orders?: unknown[]; totalFound?: number }> => {
          try {
            // Extract user authentication from cookies
            const userGcpCookie = document.cookie.split('; ').find(row => row.startsWith('user-gcp='));

            if (!userGcpCookie) {
              return { error: 'Not logged in - no user-gcp cookie found' };
            }

            try {
              const userGcpValue = decodeURIComponent(userGcpCookie.split('=')[1]);
              const userData = JSON.parse(userGcpValue);

              if (!userData.isRegistered || !userData.identityId) {
                return { error: 'User not properly authenticated' };
              }
            } catch (e) {
              return { error: 'Failed to parse user authentication data' };
            }

            const orders: unknown[] = [];
            let offset = 1;
            const maxResults = 50; // Fetch in batches

            // Paginate through all orders
            let hasMoreResults = true;
            while (hasMoreResults) {
              const response = await fetch('https://www.lowes.com/api/mylowes/orders', {
                method: 'POST',
                credentials: 'include',
                headers: {
                  'Content-Type': 'application/json',
                  'User-Agent': navigator.userAgent,
                  Accept: 'application/json',
                  Referer: 'https://www.lowes.com/mylowes/orders',
                },
                body: JSON.stringify({
                  orderType: 'BOTH', // Capture both in-person and online orders
                  startDate: startDate,
                  endDate: endDate,
                  verbose: true, // Get detailed order information
                  offset: offset,
                  maxResults: maxResults,
                }),
              });

              if (!response.ok) {
                return { error: `API request failed: ${response.status} ${response.statusText}` };
              }

              const data = await response.json();

              if (!data.orders || data.orders.length === 0) {
                hasMoreResults = false;
                break;
              }

              orders.push(...data.orders);

              // If we got fewer results than requested, we're done
              if (data.orders.length < maxResults) {
                hasMoreResults = false;
                break;
              }

              offset += maxResults;

              // Add delay between requests to be respectful
              await new Promise(resolve => setTimeout(resolve, 500));
            }

            return {
              success: true,
              orders: orders,
              totalFound: orders.length,
            };
          } catch (e: unknown) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        },
        args: [startDate, endDate],
      });

      const scriptResult = result[0].result;

      if (scriptResult.error) {
        await debugLog(`Lowe's API request failed: ${scriptResult.error}`);
        return [];
      }

      if (!scriptResult.success || !scriptResult.orders) {
        await debugLog("Lowe's API returned no orders");
        return [];
      }

      await debugLog(`Found ${scriptResult.totalFound} Lowe's orders`);

      // Process the orders
      return this.processLowesOrders(scriptResult.orders);
    } catch (e) {
      await debugLog("Error fetching Lowe's orders: " + e);
      return [];
    }
  }

  async fetchOrderDetails(orderId: string): Promise<Order | null> {
    // Order details are already included in the main fetchOrders response
    // when we use verbose: true, so this method is mainly for completeness
    await debugLog(`Lowe's order details already included in main fetch for: ${orderId}`);
    return null;
  }

  private async processLowesOrders(ordersData: unknown[]): Promise<Order[]> {
    const orders: Order[] = [];

    for (const orderData of ordersData) {
      try {
        // Type guard for order data
        if (!orderData || typeof orderData !== 'object') {
          continue;
        }

        const order = orderData as Record<string, unknown>;
        const orderId = String(order.masterOrderNumber || order.orderNumber || 'unknown');
        const orderDate = String(order.purchaseDate || order.orderDate || new Date().toISOString().split('T')[0]);
        const totalAmount = parseFloat(String(order.total || '0'));

        await debugLog(`Processing Lowe's order ${orderId}`);
        await debugLog(`Order keys: ${JSON.stringify(Object.keys(order))}`);
        await debugLog(`Full order data: ${JSON.stringify(order, null, 2).slice(0, 1000)}...`);

        // Process order items - try multiple possible structures
        const items: Item[] = [];

        // Structure 1: order.orderRelease[].orderItems[] (main Lowe's structure)
        if (Array.isArray(order.orderRelease)) {
          for (const release of order.orderRelease) {
            if (release && typeof release === 'object') {
              const releaseObj = release as Record<string, unknown>;
              if (Array.isArray(releaseObj.orderItems)) {
                const itemsArray = releaseObj.orderItems as unknown[];
                for (const item of itemsArray) {
                  if (item && typeof item === 'object') {
                    const itemObj = item as Record<string, unknown>;
                    const itemTitle = String(
                      itemObj.productName ||
                        itemObj.description ||
                        itemObj.itemDescription ||
                        itemObj.name ||
                        itemObj.title ||
                        "Lowe's Item",
                    );
                    const brand = String(itemObj.brand || '');
                    const baseTitle = brand ? `${brand} ${itemTitle}` : itemTitle;

                    // Debug: log item structure to understand available price fields
                    await debugLog(`Item keys for '${itemTitle}': ${JSON.stringify(Object.keys(itemObj))}`);
                    await debugLog(`Item data sample: ${JSON.stringify(itemObj, null, 2).slice(0, 500)}...`);

                    // Enhanced price extraction - prioritize discountedUnitPrice based on logs
                    let itemPrice = 0;

                    // Try the most likely fields first based on the debug logs
                    const primaryPriceFields = ['discountedUnitPrice', 'originalUnitPrice', 'unitPrice'];
                    for (const field of primaryPriceFields) {
                      const value = itemObj[field];
                      if (value !== undefined && value !== null && value !== '') {
                        const parsed = parseFloat(String(value));
                        if (!isNaN(parsed) && parsed > 0) {
                          itemPrice = parsed;
                          break;
                        }
                      }
                    }

                    // Fallback to other price fields
                    if (itemPrice === 0) {
                      const fallbackFields = ['price', 'amount', 'cost', 'finalPrice', 'salePrice', 'regularPrice'];
                      for (const field of fallbackFields) {
                        const value = itemObj[field];
                        if (value !== undefined && value !== null && value !== '') {
                          const parsed = parseFloat(String(value));
                          if (!isNaN(parsed) && parsed > 0) {
                            itemPrice = parsed;
                            break;
                          }
                        }
                      }
                    }

                    // Add order number to title
                    const finalTitle = `${baseTitle} - Order ${orderId}`;

                    items.push({
                      title: finalTitle,
                      price: itemPrice,
                      quantity: parseInt(String(itemObj.quantity || itemObj.qty || '1')),
                    });
                  }
                }
              }
            }
          }
        }

        // Structure 2: order.items[] (direct items array)
        if (items.length === 0 && Array.isArray(order.items)) {
          const itemsArray = order.items as unknown[];
          for (const item of itemsArray) {
            if (item && typeof item === 'object') {
              const itemObj = item as Record<string, unknown>;
              const itemTitle = String(
                itemObj.productName ||
                  itemObj.description ||
                  itemObj.itemDescription ||
                  itemObj.name ||
                  itemObj.title ||
                  "Lowe's Item",
              );

              // Enhanced price extraction - prioritize discountedUnitPrice based on logs
              let itemPrice = 0;

              // Try the most likely fields first based on the debug logs
              const primaryPriceFields = ['discountedUnitPrice', 'originalUnitPrice', 'unitPrice'];
              for (const field of primaryPriceFields) {
                const value = itemObj[field];
                if (value !== undefined && value !== null && value !== '') {
                  const parsed = parseFloat(String(value));
                  if (!isNaN(parsed) && parsed > 0) {
                    itemPrice = parsed;
                    break;
                  }
                }
              }

              // Fallback to other price fields
              if (itemPrice === 0) {
                const fallbackFields = ['price', 'amount', 'cost', 'finalPrice', 'salePrice', 'regularPrice'];
                for (const field of fallbackFields) {
                  const value = itemObj[field];
                  if (value !== undefined && value !== null && value !== '') {
                    const parsed = parseFloat(String(value));
                    if (!isNaN(parsed) && parsed > 0) {
                      itemPrice = parsed;
                      break;
                    }
                  }
                }
              }

              // Add order number to title
              const finalTitle = `${itemTitle} - Order ${orderId}`;

              items.push({
                title: finalTitle,
                price: itemPrice,
                quantity: parseInt(String(itemObj.quantity || itemObj.qty || '1')),
              });
            }
          }
        }

        await debugLog(`Found ${items.length} items for order ${orderId}`);
        if (items.length > 0) {
          await debugLog(`Sample item: ${items[0].title}`);
        }

        // If still no items found, log the structure for debugging and create a generic item
        if (items.length === 0) {
          await debugLog(
            `No items found in order ${orderId}. Order structure: ${JSON.stringify(order, null, 2).slice(0, 500)}`,
          );
          items.push({
            title: `Lowe's Purchase - Order ${orderId}`,
            price: totalAmount,
            quantity: 1,
          });
        }

        // Create transaction
        const transactions: OrderTransaction[] = [
          {
            id: orderId,
            amount: totalAmount,
            date: orderDate,
            refund: order.status === 'CANCELLED' || order.status === 'REFUNDED',
          },
        ];

        const processedOrder: Order = {
          id: orderId,
          date: orderDate,
          items: items,
          transactions: transactions,
          retailer: this.retailer,
        };

        orders.push(processedOrder);
        await debugLog(`Processed Lowe's order ${orderId}: $${totalAmount} on ${orderDate} (${items.length} items)`);
      } catch (error) {
        await debugLog(`Error processing Lowe's order: ${error}`);
      }
    }

    await debugLog(`Successfully processed ${orders.length} Lowe's orders`);
    return orders;
  }
}
