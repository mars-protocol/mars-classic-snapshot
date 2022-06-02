/* eslint-disable @typescript-eslint/no-non-null-assertion */
import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { Flipside, Query } from "@flipsidecrypto/sdk";

import * as constants from "./constants";
import { encodeBase64, decodeBase64 } from "./helpers";
import {
  WasmSmartQueryResponse,
  MultiQueryResponse,
  PendingTokenResponse,
  AccountWithBalanceAndReward,
} from "./types";

// Initialize `Flipside` with your API key
const flipside = new Flipside(constants.FLIPSIDE_API_KEY, "https://node-api.flipsidecrypto.com");

/**
 * @notice Find all users who have provided liquidity to Astroport MARS-UST pool
 */
async function getAllLiquidityProviders() {
  const START_HEIGHT = 5713559; // this was the height when Astroport factory contract was instantiated

  const query: Query = {
    sql: `
      select * from terra.event_actions
        where action_contract_address = '${constants.ASTROPORT_MARS_UST_PAIR}'
        and block_id between ${START_HEIGHT} and ${constants.POST_DEPEG_HEIGHT}
        and action_method = 'provide_liquidity'
    `,
  };
  const result = await flipside.query.run(query);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stakersWithDups = result.records?.map((r) => (r["action_log"] as any)["receiver"] as string) ?? [];

  // remove dups
  const stakers = Array.from(new Set(stakersWithDups));

  return stakers;
}

async function getAllLpTokenSenders() {
  const START_HEIGHT = 5713559; // this was the height when Astroport factory contract was instantiated

  const query: Query = {
    sql: `
      select * from terra.event_actions
        where action_contract_address = '${constants.ASTROPORT_MARS_UST_LP}'
        and block_id between ${START_HEIGHT} and ${constants.POST_DEPEG_HEIGHT}
        and action_method = 'send'
    `,
  };
  const result = await flipside.query.run(query);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stakersWithDups = result.records?.map((r) => (r["action_log"] as any)["from"] as string) ?? [];

  // remove dups
  const stakers = Array.from(new Set(stakersWithDups));

  return stakers;
}

export async function getLiquidityProviderInfos(
  restUrl: string,
  liquidityProviders: string[],
  height: number
) {
  const total = liquidityProviders.length;
  const batchSize = 10;

  let count = 0;
  const accountsWithBalances: AccountWithBalanceAndReward[] = [];

  for (let start = 0; start < total; start += batchSize) {
    const end = start + batchSize;
    const slice = liquidityProviders.slice(start, end > total ? total : end);

    // query deposit amount
    const queryMsg1 = encodeBase64(
      slice.map((liquidityProvider) => ({
        wasm: {
          smart: {
            contract_addr: constants.ASTRO_GENERATOR,
            msg: encodeBase64({
              deposit: {
                user: liquidityProvider,
                lp_token: constants.ASTROPORT_MARS_UST_LP,
              },
            }),
          },
        },
      }))
    );

    const response1 = await axios.get<WasmSmartQueryResponse<MultiQueryResponse>>(
      `${restUrl}/terra/wasm/v1beta1/contracts/${constants.MULTIQUERY}/store?height=${height}&query_msg=${queryMsg1}`
    );
    const results1 = response1.data.query_result;

    // query pending reward
    const queryMsg2 = encodeBase64(
      slice.map((liquidityProvider) => ({
        wasm: {
          smart: {
            contract_addr: constants.ASTRO_GENERATOR,
            msg: encodeBase64({
              pending_token: {
                user: liquidityProvider,
                lp_token: constants.ASTROPORT_MARS_UST_LP,
              },
            }),
          },
        },
      }))
    );

    const response2 = await axios.get<WasmSmartQueryResponse<MultiQueryResponse>>(
      `${restUrl}/terra/wasm/v1beta1/contracts/${constants.MULTIQUERY}/store?height=${height}&query_msg=${queryMsg2}`
    );
    const results2 = response2.data.query_result;

    slice.forEach((staker, index) => {
      const result1 = results1[index];
      const result2 = results2[index];

      let balance = 0; // amount of MARS-UST LP tokens deposited in generator
      let pendingReward = 0; // amount of pending MARS reward

      if (result1 && result1.success) {
        const deposit: string = decodeBase64(result1.data);
        balance = Number(deposit);
      }

      if (result2 && result2.success) {
        const pendingTokenResponse: PendingTokenResponse = decodeBase64(result2.data);
        pendingReward = Number(pendingTokenResponse.pending_on_proxy);
      }

      if (balance > 0 || pendingReward > 0) {
        accountsWithBalances.push({
          address: staker,
          balance,
          pendingReward,
        });
      }

      count += 1;
      console.log(`[${count}/${total}] staker = ${staker}, balance = ${balance}`);
    });
  }

  const totalBalance = accountsWithBalances.reduce((a, b) => a + b.balance, 0);
  const totalPendingReward = accountsWithBalances.reduce((a, b) => a + b.pendingReward, 0);
  console.log(
    `done! total balance = ${totalBalance}, total pending reward = ${totalPendingReward}`
  );

  // remove zero balances
  return accountsWithBalances.filter((account) => account.balance > 0);
}

const height = constants.POST_DEPEG_HEIGHT;

(async function () {
  console.log("fetching list of liquidity providers from flipside...");
  const liquidityProviders = await getAllLiquidityProviders();

  console.log("fetching list of users who have sent Astroport MARS-UST LP tokens...");
  const senders = await getAllLpTokenSenders();

  const users = Array.from(new Set([...liquidityProviders, ...senders]));
  console.log(`done! number of users: ${users.length}`);

  const claims = await getLiquidityProviderInfos(constants.REST_URL, users, height);
  fs.writeFileSync(
    path.join(__dirname, `../data/mars_lp_stakers_${height}.json`),
    JSON.stringify(claims, null, 2)
  );
})();
