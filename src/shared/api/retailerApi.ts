import { AuthStatus } from '../storages/appStorage';

export enum Retailer {
  Amazon = 'amazon',
  HomeDepot = 'homedepot',
  Lowes = 'lowes',
  Ikea = 'ikea',
  BestBuy = 'bestbuy',
}

export interface RetailerInfo {
  status: AuthStatus;
  startingYear?: number;
}

export interface Order {
  id: string;
  date: string;
  items: Item[];
  transactions: OrderTransaction[];
  retailer: Retailer;
}

export interface Item {
  quantity: number;
  title: string;
  price: number;
}

export interface OrderTransaction {
  id: string;
  amount: number;
  date: string;
  refund: boolean;
}

export interface RetailerApi {
  retailer: Retailer;
  checkAuth(): Promise<RetailerInfo>;
  fetchOrders(year: number | undefined): Promise<Order[]>;
  fetchOrderDetails(orderId: string): Promise<Order | null>;
}

export const RETAILER_CONFIGS = {
  [Retailer.Amazon]: {
    name: 'Amazon',
    domain: 'amazon.com',
    orderHistoryUrl: 'https://www.amazon.com/gp/css/order-history',
    monarchMerchant: '', // Use amazonMerchant from options
  },
  [Retailer.HomeDepot]: {
    name: 'Home Depot',
    domain: 'homedepot.com',
    orderHistoryUrl: 'https://www.homedepot.com/myaccount/purchase-history',
    monarchMerchant: 'Home Depot',
  },
  [Retailer.Lowes]: {
    name: "Lowe's",
    domain: 'lowes.com',
    orderHistoryUrl: 'https://www.lowes.com/mylowes/orders',
    monarchMerchant: "Lowe's",
  },
  [Retailer.Ikea]: {
    name: 'IKEA',
    domain: 'ikea.com',
    orderHistoryUrl: 'https://www.ikea.com/us/en/profile/orders',
    monarchMerchant: 'IKEA',
  },
  [Retailer.BestBuy]: {
    name: 'Best Buy',
    domain: 'bestbuy.com',
    orderHistoryUrl: 'https://www.bestbuy.com/profile/ss/orders',
    monarchMerchant: 'Best Buy',
  },
};
