export type WasmContractStoreResponse<T> = {
  query_result: T;
};

export type MultiQueryResponse = {
  success: boolean;
  data: string;
}[];
