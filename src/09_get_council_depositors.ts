import * as fs from "fs";
import * as path from "path";
import axios from "axios";

import * as constants from "./constants";
import { encodeBase64 } from "./helpers";
import { WasmSmartQueryResponse, ProposalsResponse, AccountWithBalance } from "./types";

const height = constants.POST_DEPEG_HEIGHT;

(async function () {
  const queryMsg = encodeBase64({
    proposals: {
      limit: 10, // we know there were less than 10 proposals in both snapshots
    },
  });

  const response = await axios.get<WasmSmartQueryResponse<ProposalsResponse>>(
    `${constants.REST_URL}/terra/wasm/v1beta1/contracts/${constants.MARS_COUNCIL}/store?height=${height}&query_msg=${queryMsg}`
  );
  const result = response.data.query_result;

  const accountsWithBalances: AccountWithBalance[] = [];

  for (const { submitter_address, status, deposit_amount } of result.proposal_list) {
    // deposit should have been refunded or confiscated if the proposal passes, fails, or executes
    // therefore we only look for once that are active
    if (status === "active") {
      accountsWithBalances.push({
        address: submitter_address,
        balance: Number(deposit_amount),
      });
    }
  }

  console.log(accountsWithBalances);

  fs.writeFileSync(
    path.join(__dirname, `../data/council_depositors_${height}.json`),
    JSON.stringify(accountsWithBalances, null, 2)
  );
})();
