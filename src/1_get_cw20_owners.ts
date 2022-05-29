import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import axiosRetry from "axios-retry";

import * as constants from "./constants";
import { encodeBase64, decodeBase64IntoObject } from "./helpers";
import { WasmContractStoreResponse, MultiQueryResponse } from "./types";

axiosRetry(axios);

type Cw20AllAccountsResponse = {
  accounts: string[];
};

type Cw20BalanceResponse = {
  balance: string;
};

export type AccountWithBalance = {
  address: string;
  balance: number;
};

async function getCw20Owners(restUrl: string, tokenAddress: string, height: number) {
  let accounts: string[] = [];
  let startAfter: string | undefined = undefined;

  while (true) {
    const queryMsg = encodeBase64({
      all_accounts: {
        start_after: startAfter,
        limit: 30,
      },
    });
    const response = await axios.get<WasmContractStoreResponse<Cw20AllAccountsResponse>>(
      `${restUrl}/terra/wasm/v1beta1/contracts/${tokenAddress}/store?height=${height}&query_msg=${queryMsg}`
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

async function getCw20Balances(
  restUrl: string,
  tokenAddress: string,
  owners: string[],
  height: number
) {
  const total = owners.length;
  const batchSize = 30;
  let count = 0;
  let accountsWithBalances: AccountWithBalance[] = [];

  for (let start = 0; start < total; start += batchSize) {
    const end = start + batchSize;
    const slice = owners.slice(start, end > total ? total : end);
    const queryMsg = encodeBase64(
      slice.map((owner) => ({
        wasm: {
          smart: {
            contract_addr: tokenAddress,
            msg: encodeBase64({
              balance: {
                address: owner,
              },
            }),
          },
        },
      }))
    );
    const response = await axios.get<WasmContractStoreResponse<MultiQueryResponse>>(
      `${restUrl}/terra/wasm/v1beta1/contracts/${constants.MULTIQUERY}/store?height=${height}&query_msg=${queryMsg}`
    );
    const results = response.data.query_result;

    slice.forEach((owner, index) => {
      const result = results[index];
      if (result) {
        const balanceResponse: Cw20BalanceResponse = decodeBase64IntoObject(result.data);
        accountsWithBalances.push({
          address: owner,
          balance: Number(balanceResponse.balance),
        });

        count += 1;
        console.log(`[${count}/${total}] address = ${owner}, balance = ${balanceResponse.balance}`);
      }
    });
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

const tokenAddress = constants.MARS_TOKEN;
const tokenName = "mars";
// const tokenAddress = constants.XMARS_TOKEN;
// const tokenName = "xmars";
// const tokenAddress = constants.ASTROPORT_MARS_UST_LP;
// const tokenName = "astroport_mars_ust_lp";
// const tokenAddress = constants.ASTROPORT_XMARS_MARS_LP;
// const tokenName = "astroport_xmars_mars_lp";
// const tokenAddress = constants.TERRASWAP_MARS_UST_LP;
// const tokenName = "terraswap_mars_ust_lp";

const height = constants.PRE_ATTACK_HEIGHT;

(async function () {
  const accounts = await getCw20Owners(constants.REST_URL, tokenAddress, height);

  const accountsWithBalances = await getCw20Balances(
    constants.REST_URL,
    tokenAddress,
    accounts,
    height
  );

  fs.writeFileSync(
    path.join(__dirname, `../data/${tokenName}_owners_${height}.json`),
    JSON.stringify(accountsWithBalances, null, 2)
  );
})();
