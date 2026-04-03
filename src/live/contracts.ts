export interface BithumbRequestSigner {
  signRestRequest(input: {
    method: "GET" | "POST" | "DELETE";
    path: string;
    query?: Record<string, string | number | boolean>;
    body?: Record<string, string | number | boolean>;
  }): {
    authorizationHeader: string;
    nonce: string;
    timestamp: number;
    queryHash?: string;
  };
}

export interface BithumbPrivateClient {
  getAccounts(): Promise<unknown>;
  getOrderChance(market: string): Promise<unknown>;
  submitOrder(input: unknown): Promise<unknown>;
  getOrder(orderId: string): Promise<unknown>;
  cancelOrder(orderId: string): Promise<unknown>;
}
