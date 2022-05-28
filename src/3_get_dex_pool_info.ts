import axios from "axios";

import * as constants from "./constants";
import { encodeBase64 } from "./helpers";
import { WasmContractStoreResponse } from "./types";

type AssetInfo = {token: {contract_addr: string}} | { native_token: {denom: string} }

type Asset = {
  info: AssetInfo,
  amount: string,
}

type PoolResponse = {
  assets: Asset[],
  total_share: string,
}

async function getXMarsExchangeRatio(
  restUrl: string,
  pairAddress: string,
  height: number
) {
  const queryMsg = encodeBase64({ pool: {} });
  const response = await axios.get<WasmContractStoreResponse<PoolResponse>>(
    `${restUrl}/terra/wasm/v1beta1/contracts/${pairAddress}/store?height=${height}&query_msg=${queryMsg}`
  );
  return response.data.query_result;
}

// const pair = constants.ASTROPORT_MARS_UST_PAIR;
// const pair = constants.ASTROPORT_XMARS_MARS_PAIR;
const pair = constants.TERRASWAP_MARS_UST_PAIR;

const height = constants.PRE_ATTACK_HEIGHT;

(async function () {
  const response = await getXMarsExchangeRatio(constants.REST_URL, pair, height);
  console.log(JSON.stringify(response, null, 2));
})();
