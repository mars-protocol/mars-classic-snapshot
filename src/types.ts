export type WasmContractStoreResponse<T> = {
  query_result: T;
};

export type MultiQueryResponse = {
  success: boolean;
  data: string;
}[];

export type Cw20TokenInfoResponse = {
  name: string;
  symbol: string;
  decimals: number;
  total_supply: string;
};
