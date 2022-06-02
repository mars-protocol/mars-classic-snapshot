import * as fs from "fs";
import * as path from "path";
import axios from "axios";

import * as constants from "./constants";
import { encodeBase64, decodeBase64 } from "./helpers";
import {
  WasmSmartQueryResponse,
  MultiQueryResponse,
  RewardInfoResponse,
  AccountWithBalance,
} from "./types";

export async function getAccountsWithBalances(users: string[], height: number) {
  const total = users.length;
  const batchSize = 5;

  let count = 0;
  let accountsWithBalances: AccountWithBalance[] = [];

  for (let start = 0; start < total; start += batchSize) {
    const end = start + batchSize;
    const slice = users.slice(start, end > total ? total : end);

    const queryMsg = encodeBase64(
      slice.map((user) => ({
        wasm: {
          smart: {
            contract_addr: constants.SPECTRUM_MARS_UST_FARM,
            msg: encodeBase64({
              reward_info: {
                staker_addr: user,
              },
            }),
          },
        },
      }))
    );

    const response = await axios.get<WasmSmartQueryResponse<MultiQueryResponse>>(
      `${constants.REST_URL}/terra/wasm/v1beta1/contracts/${constants.MULTIQUERY}/store?height=${height}&query_msg=${queryMsg}`
    );
    const results = response.data.query_result;

    slice.forEach((user, index) => {
      const result = results[index];
      let balance = 0;

      if (result && result.success) {
        const rewardInfoResponse: RewardInfoResponse = decodeBase64(result.data);
        if (rewardInfoResponse.reward_infos.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          balance = Number(rewardInfoResponse.reward_infos[0]!.bond_amount);
          accountsWithBalances.push({ address: user, balance });
        }
      }

      count += 1;
      console.log(`[${count}/${total}] user = ${user}, balance = ${balance}`);
    });
  }

  accountsWithBalances = accountsWithBalances.filter((account) => account.balance > 0);

  const totalBalance = accountsWithBalances.reduce((a, b) => a + b.balance, 0);
  console.log("total balance:", totalBalance);

  return accountsWithBalances;
}

const height = constants.POST_DEPEG_HEIGHT;

(async function () {
  console.log("loading user addresses...");
  const lines = fs.readFileSync(path.join(__dirname, "../data/mars_speccompounder_txs.csv"), "utf8").split("\n");
  const usersWithDups = lines.slice(1, lines.length - 1).map((line) => line.split(",")[2] as string);
  const users = Array.from(new Set(usersWithDups));
  console.log(`total number of non-duplicate users: ${users.length}`);

  const accountsWithBalances = await getAccountsWithBalances(users, height);
  fs.writeFileSync(
    path.join(__dirname, `../data/spec_users_${height}.json`),
    JSON.stringify(accountsWithBalances, null, 2)
  );
})();
