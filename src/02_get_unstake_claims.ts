/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { Flipside, Query } from "@flipsidecrypto/sdk";

import * as constants from "./constants";
import { encodeBase64, decodeBase64 } from "./helpers";
import {
  TxsResponse,
  WasmSmartQueryResponse,
  MultiQueryResponse,
  ClaimResponse,
  AccountWithBalance,
} from "./types";

// Initialize `Flipside` with your API key
const flipside = new Flipside(constants.FLIPSIDE_API_KEY, "https://node-api.flipsidecrypto.com");

/**
 * @notice Find all users who have initiated unstaking at Mars staking contract (i.e. burn xMARS,
 * withdraw MARS).
 */
async function getAllUnstakers() {
  const query: Query = {
    sql: `
      select * from terra.event_actions
        where action_contract_address = '${constants.MARS_STAKING}'
    `,
  };
  const result = await flipside.query.run(query);

  const txhashes = result.records!.map((r) => r["tx_id"] as string);

  const senders = new Set<string>();
  const total = txhashes.length;
  let count = 0;
  for (const txhash of txhashes) {
    const { data } = await axios.get<TxsResponse>(`${constants.BACKUP_REST_URL}cosmos/tx/v1beta1/txs/${txhash}`);

    for (const msg of data.tx.body.messages) {
      if (!!msg.sender) {
        senders.add(msg.sender);
      }
    }

    count += 1;
    console.log(`[${count}/${total}] total senders: ${senders.size}`);
  }

  return Array.from(senders);
}

/**
 * @dev For each unstaker, find their MARS token amount that is being unstaked but not yet withdrawn
 * in the MARS staking contract.
 */
async function getUnstakeClaims(restUrl: string, stakers: string[], height: number) {
  const total = stakers.length;
  const batchSize = 20;

  let count = 0;
  let accountsWithBalances: AccountWithBalance[] = [];

  for (let start = 0; start < total; start += batchSize) {
    const end = start + batchSize;
    const slice = stakers.slice(start, end > total ? total : end);

    const queryMsg = encodeBase64(
      slice.map((staker) => ({
        wasm: {
          smart: {
            contract_addr: constants.MARS_STAKING,
            msg: encodeBase64({
              claim: {
                user_address: staker,
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

    slice.forEach((staker, index) => {
      const result = results[index];
      let balance = 0;

      if (result) {
        if (result.success) {
          const { claim }: ClaimResponse = decodeBase64(result.data);
          if (claim) {
            balance = Number(claim.amount);
          }
        } else {
          // throw `query failed for staker ${staker}!!!`;
        }
      }

      accountsWithBalances.push({ address: staker, balance });

      count += 1;
      console.log(`[${count}/${total}] staker = ${staker}, balance = ${balance}`);
    });
  }

  // filter out zeroes
  accountsWithBalances = accountsWithBalances.filter((acct) => acct.balance > 0);

  const totalBalance = accountsWithBalances.reduce((a, b) => a + b.balance, 0);
  console.log("done! total balance:", totalBalance);

  return accountsWithBalances;
}

const height = constants.POST_DEPEG_HEIGHT;

(async function () {
  console.log("fetching list of unstakers from flipside...");
  const unstakers = await getAllUnstakers();
  console.log(`done! number of unstakers: ${unstakers.length}`);

  const claims = await getUnstakeClaims(constants.REST_URL, unstakers, height);

  fs.writeFileSync(
    path.join(__dirname, `../data/unstake_claims_${height}.json`),
    JSON.stringify(claims, null, 2)
  );
})();
