// import * as fs from "fs";
// import * as path from "path";
// import axios from "axios";
import { Flipside, Query } from "@flipsidecrypto/sdk";

import * as constants from "./constants";
// import { encodeBase64, decodeBase64IntoObject } from "./helpers";
// import { WasmContractStoreResponse, MultiQueryResponse } from "./types";

// Initialize `Flipside` with your API key
const flipside = new Flipside(constants.FLIPSIDE_API_KEY, "https://node-api.flipsidecrypto.com");

/**
 * @notice Find all users who have staked Astroport MARS-UST LP tokens at the Mars LP staking contract
 */
 async function getAllStakers() {
  const START_HEIGHT = 6745928; // this was the height when Mars LP staking contract was instantiated

  const query: Query = {
    sql: `
      select * from terra.event_actions
        where action_contract_address = '${constants.MARS_LP_STAKING}'
        and block_id between ${START_HEIGHT} and ${constants.POST_ATTACK_HEIGHT}
        and action_method = 'Staking::ExecuteMsg::Bond'
    `,
  };
  const result = await flipside.query.run(query);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return result.records?.map((r) => ((r["action_log"] as any)["user"] as string)) ?? [];
}

// const height = constants.PRE_ATTACK_HEIGHT;

(async function () {
  console.log("fetching list of stakers from flipside...");
  const stakers = await getAllStakers();
  console.log(`done! number of stakers: ${stakers.length}`);

  // const claims = await getUnstakeClaims(constants.REST_URL, unstakers, height);
  // fs.writeFileSync(
  //   path.join(__dirname, "../data/unstake_claims.json"),
  //   JSON.stringify(claims, null, 2)
  // );
})();
