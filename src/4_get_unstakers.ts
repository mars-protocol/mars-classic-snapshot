import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import axiosRetry from "axios-retry";

import * as constants from "./constants";
import { decodeBase64 } from "./helpers";

axiosRetry(axios);

const START_HEIGHT = 6531019; // this is the block where Mars staking contract was deployed
const END_HEIGHT = constants.POST_ATTACK_HEIGHT;

interface TxsResponse {
  tx_responses: TxResponse[];
  pagination: {
    total: string;
  };
}

interface TxResponse {
  timestamp: string;
  height: string;
  txhash: string;
  events: Event[];
}

interface Event {
  type: string;
  attributes: {
    key: string;
    value: string;
  }[];
}

async function getTxsInBlock(height: number) {
  let txs: TxResponse[] = [];
  let offset = 0;

  while (true) {
    const { data } = await axios.get<TxsResponse>(
      `${constants.BACKUP_REST_URL}/cosmos/tx/v1beta1/txs?events=tx.height=${height}&pagination.offset=${offset}`
    );

    txs = txs.concat(data.tx_responses);
    offset += data.tx_responses.length;

    if (offset >= Number(data.pagination.total)) {
      break;
    }
  }

  return txs;
}

function decodeEvent(event: Event) {
  return {
    type: event.type,
    attributes: event.attributes.map((attr) => ({
      key: decodeBase64(attr.key),
      value: decodeBase64(attr.value),
    })),
  };
}

/**
 * @dev Find all user addresses that had executed unstake at Mars staking contract. We do this by
 * querying all txs that had interacted with this contract, and look for once that had emitted the
 * `unstake` event.
 */
async function getAllUnstakers() {
  const unstakers: Set<string> = new Set();

  for (let height = START_HEIGHT; height <= END_HEIGHT; height++) {
    const txs = await getTxsInBlock(height);
    console.log(`fetched ${txs.length} txs, height = ${height}`);

    // look for events that have the following attributes:
    // type: wasm
    // contract_address: constants.MARS_STAKING
    // action: unstake
    // staker: terra1...
    for (const tx of txs) {
      for (const eventRaw of tx.events) {
        if (eventRaw.type === "wasm") {
          const event = decodeEvent(eventRaw);

          const contractAddrAttr = event.attributes.find((attr) => attr.key === "contract_address");
          if (!contractAddrAttr || contractAddrAttr.value !== constants.MARS_STAKING) {
            continue;
          }

          const actionAttr = event.attributes.find((attr) => attr.key === "action");
          if (!actionAttr || actionAttr.value !== "unstake") {
            continue;
          }

          const stakerAttr = event.attributes.find((attr) => attr.key === "staker");
          if (!stakerAttr) {
            continue;
          }

          unstakers.add(stakerAttr.value);

          console.log(`found unstaker ${stakerAttr.value}, txhash = ${tx.txhash}`);
        }
      }
    }
  }

  return Array.from(unstakers);
}

(async function () {
  const unstakers = await getAllUnstakers();
  console.log(`done! number of unstakers: ${unstakers.length}`);

  unstakers.sort((a, b) => {
    if (a < b) {
      return -1;
    } else if (a > b) {
      return 1;
    } else {
      return 0;
    }
  });

  fs.writeFileSync(
    path.join(__dirname, "../data/xmars_unstakers.json"),
    JSON.stringify(unstakers, null, 2)
  );
})();
