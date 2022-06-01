import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { Flipside, Query } from "@flipsidecrypto/sdk";

import * as constants from "./constants";
import { encodeBase64, decodeBase64 } from "./helpers";
import {
  WasmSmartQueryResponse,
  MultiQueryResponse,
  AccountWithBalanceAndReward,
  UserInfoResponse,
} from "./types";

// Initialize `Flipside` with your API key
const flipside = new Flipside(constants.FLIPSIDE_API_KEY, "https://node-api.flipsidecrypto.com");

/**
 * @notice Find all users who have deposited UST into Mars auction contract
 */
async function getAllUstDepositors() {
  const START_HEIGHT = 6556921; // the block height when Mars auction contract was instantiated

  const query: Query = {
    sql: `
      select * from terra.event_actions
        where action_contract_address = '${constants.MARS_AUCTION}'
        and block_id between ${START_HEIGHT} and ${constants.POST_DEPEG_HEIGHT}
        and action_method = 'Auction::ExecuteMsg::deposit_ust'
    `,
  };
  const result = await flipside.query.run(query);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const depositorsWithDups = result.records?.map((r) => (r["action_log"] as any)["user_address"] as string) ?? [];

  // remove dups
  const depositors = Array.from(new Set(depositorsWithDups));

  return depositors;
}

/**
 * @notice Find all users who have deposited MARS into Mars auction contract
 */
async function getAllMarsDepositors() {
  const START_HEIGHT = 6556921; // the block height when Mars auction contract was instantiated

  const query: Query = {
    sql: `
      select * from terra.event_actions
        where action_contract_address = '${constants.MARS_AUCTION}'
        and block_id between ${START_HEIGHT} and ${constants.POST_DEPEG_HEIGHT}
        and action_method = 'Auction::ExecuteMsg::DepositMarsTokens'
    `,
  };
  const result = await flipside.query.run(query);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const depositorsWithDups = result.records?.map((r) => (r["action_log"] as any)["user"] as string) ?? [];

  // remove dups
  const depositors = Array.from(new Set(depositorsWithDups));

  return depositors;
}

async function getAuctionParticipants(restUrl: string, depositors: string[], height: number) {
  const total = depositors.length;
  const batchSize = 5;

  let count = 0;
  const accountsWithBalances: AccountWithBalanceAndReward[] = [];

  for (let start = 0; start < total; start += batchSize) {
    const end = start + batchSize;
    const slice = depositors.slice(start, end > total ? total : end);

    const queryMsg = encodeBase64(
      slice.map((depositor) => ({
        wasm: {
          smart: {
            contract_addr: constants.MARS_AUCTION,
            msg: encodeBase64({
              user_info: {
                address: depositor,
              },
            }),
          },
        },
      }))
    );

    const response = await axios.get<WasmSmartQueryResponse<MultiQueryResponse>>(
      `${restUrl}/terra/wasm/v1beta1/contracts/${constants.MULTIQUERY}/store?height=${height}&query_msg=${queryMsg}`
    );
    const results = response.data.query_result;

    slice.forEach((depositor, index) => {
      const result = results[index];

      let balance = 0;
      let pendingReward = 0;

      if (result && result.success) {
        const userInfo: UserInfoResponse = decodeBase64(result.data);
        balance = Number(userInfo.lp_shares) - Number(userInfo.withdrawn_lp_shares);
        pendingReward = Number(userInfo.withdrawable_mars_incentives);
      }

      accountsWithBalances.push({
        address: depositor,
        balance,
        pendingReward,
      });

      count += 1;
      console.log(`[${count}/${total}] depositor = ${depositor}, balance = ${balance}`);
    });
  }

  return accountsWithBalances;
}

const height = constants.PRE_DEPEG_HEIGHT;

(async function () {
  console.log("fetching list of UST depositors...");
  const depositorsUst = await getAllUstDepositors();
  console.log(`done! UST depositors: ${depositorsUst.length}`);

  console.log("fetching list of MARS depositors...");
  const depositorsMars = await getAllMarsDepositors();
  console.log(`done! MARS depositors: ${depositorsMars.length}`);

  const depositors = Array.from(new Set([...depositorsUst, ...depositorsMars]));
  console.log(`total unique depositors: ${depositors.length}`);

  const accountsWithBalances = await getAuctionParticipants(constants.REST_URL, depositors, height);

  fs.writeFileSync(
    path.join(__dirname, `../data/auction_participants_${height}.json`),
    JSON.stringify(accountsWithBalances, null, 2)
  );
})();
