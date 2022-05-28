import axios from "axios";
import axiosRetry from "axios-retry";

import { encodeBase64 } from "./helpers";

axiosRetry(axios);

export type WasmContractStoreResponse<T> = {
  query_result: T;
};

export type Cw20AllAccountsResponse = {
  accounts: string[];
};

export type Cw20BalanceResponse = {
  balance: string;
};

export type AccountWithBalance = {
  address: string;
  balance: number;
};

export async function getCw20Owners(restUrl: string, tokenAddress: string, height: number) {
  let accounts: string[] = [];
  let startAfter: string | undefined = undefined;

  while (true) {
    const query = encodeBase64({
      all_accounts: {
        start_after: startAfter,
        limit: 30,
      },
    });
    const response = await axios.get<WasmContractStoreResponse<Cw20AllAccountsResponse>>(
      `${restUrl}/terra/wasm/v1beta1/contracts/${tokenAddress}/store?height=${height}&query_msg=${query}`
    );
    const result = response.data.query_result;

    if (result.accounts.length === 0) {
      break;
    }

    accounts = accounts.concat(result.accounts);
    startAfter = result.accounts[result.accounts.length - 1];

    console.log(`fetched ${result.accounts.length} accounts, startAfter =`, startAfter);
  }

  console.log(`fetched a total of ${accounts.length} accounts!`);

  return accounts;
}

export async function getCw20Balances(
  restUrl: string,
  tokenAddress: string,
  owners: string[],
  height: number
) {
  const total = owners.length;
  let count = 0;
  let accountsWithBalances: AccountWithBalance[] = [];

  for (const owner of owners) {
    const query = encodeBase64({
      balance: {
        address: owner,
      },
    });
    const response = await axios.get<WasmContractStoreResponse<Cw20BalanceResponse>>(
      `${restUrl}/terra/wasm/v1beta1/contracts/${tokenAddress}/store?height=${height}&query_msg=${query}`
    );
    const result = response.data.query_result;

    accountsWithBalances.push({
      address: owner,
      balance: Number(result.balance),
    });

    count += 1;
    console.log(`[${count}/${total}] address = ${owner}, balance = ${result.balance}`);
  }

  // remove all accounts with zero balances
  accountsWithBalances = accountsWithBalances.filter((account) => account.balance > 0);

  // sort accounts descedingly based on balance
  accountsWithBalances.sort((a, b) => {
    if (a.balance > b.balance) {
      return -1;
    } else if (a.balance < b.balance) {
      return 1;
    } else {
      return 0;
    }
  });

  return accountsWithBalances;
}
