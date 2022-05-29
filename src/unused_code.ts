// this file contains code that we ended up not using
import axios from "axios";
import axiosRetry from "axios-retry";

import * as constants from "./constants";
import { decodeBase64 } from "./helpers";

axiosRetry(axios);

export interface TxsResponse {
  tx_responses: TxResponse[];
  pagination: {
    total: string;
  };
}

export interface TxResponse {
  timestamp: string;
  height: string;
  txhash: string;
  events: Event[];
}

export interface Event {
  type: string;
  attributes: {
    key: string;
    value: string;
  }[];
}

/**
 * @notice Download all tx responses in a certain block
 */
export async function getTxsInBlock(height: number) {
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

export function decodeEvent(event: Event) {
  return {
    type: event.type,
    attributes: event.attributes.map((attr) => ({
      key: decodeBase64(attr.key),
      value: decodeBase64(attr.value),
    })),
  };
}

/**
 * @notice Find all user addresses that had executed unstake at Mars staking contract. We do this by
 * querying all txs that had interacted with this contract, and look for once that had emitted the
 * `unstake` event.
 * @dev Deprecated: we use Flipside API now
 */
export async function getAllUnstakers(startHeight: number, endHeight: number) {
  const unstakers: Set<string> = new Set();

  for (let height = startHeight; height <= endHeight; height++) {
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