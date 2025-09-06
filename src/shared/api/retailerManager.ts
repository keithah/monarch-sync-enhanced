import { Retailer, RetailerApi, Order } from './retailerApi';
import { HomeDepotApi } from './homeDepotApi';
import { LowesApi } from './lowesApi';
import { debugLog } from '../storages/debugStorage';

// Legacy Amazon API functions
import * as AmazonApi from './amazonApi';

export class RetailerManager {
  private retailers: Map<Retailer, RetailerApi> = new Map();

  constructor() {
    // Register available retailers
    this.retailers.set(Retailer.HomeDepot, new HomeDepotApi());
    this.retailers.set(Retailer.Lowes, new LowesApi());
  }

  getRetailer(retailer: Retailer): RetailerApi | null {
    return this.retailers.get(retailer) || null;
  }

  getAllRetailers(): RetailerApi[] {
    return Array.from(this.retailers.values());
  }

  getAvailableRetailers(): Retailer[] {
    return Array.from(this.retailers.keys());
  }

  // Amazon compatibility methods (wrapping existing functions)
  async checkAmazonAuth() {
    return AmazonApi.checkAmazonAuth();
  }

  async fetchAmazonOrders(year: number | undefined): Promise<Order[]> {
    const orders = await AmazonApi.fetchOrders(year);
    // Add retailer field to Amazon orders
    return orders.map(order => ({ ...order, retailer: Retailer.Amazon }));
  }

  async fetchOrdersForRetailer(retailer: Retailer, year: number | undefined): Promise<Order[]> {
    if (retailer === Retailer.Amazon) {
      return this.fetchAmazonOrders(year);
    }

    const retailerApi = this.getRetailer(retailer);
    if (!retailerApi) {
      await debugLog(`Retailer ${retailer} not supported`);
      return [];
    }

    const authInfo = await retailerApi.checkAuth();
    if (authInfo.status !== 'success') {
      await debugLog(`Authentication failed for ${retailer}`);
      return [];
    }

    return retailerApi.fetchOrders(year);
  }

  async fetchAllOrders(year: number | undefined): Promise<Order[]> {
    const allOrders: Order[] = [];

    // Fetch Amazon orders
    const amazonOrders = await this.fetchAmazonOrders(year);
    allOrders.push(...amazonOrders);

    // Fetch orders from other retailers
    for (const retailer of this.getAvailableRetailers()) {
      try {
        const orders = await this.fetchOrdersForRetailer(retailer, year);
        allOrders.push(...orders);
      } catch (error) {
        await debugLog(`Error fetching orders from ${retailer}: ${error}`);
      }
    }

    return allOrders;
  }
}

// Export singleton instance
export const retailerManager = new RetailerManager();
