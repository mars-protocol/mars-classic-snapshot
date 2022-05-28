import axios from "axios";

import * as constants from "./constants";
import { encodeBase64, decodeBase64 } from "./helpers";
import { WasmContractStoreResponse, MultiQueryResponse } from "./types";

async function getXMarsExchangeRatio(
  restUrl: string,
  marsStakingAddress: string,
  height: number
) {
  const queryMsg = encodeBase64([
    {
      wasm: {
        smart: {
          contract_addr: marsStakingAddress,
          msg: encodeBase64({
            mars_per_x_mars: {},
          }),
        },
      },
    },
    {
      wasm: {
        smart: {
          contract_addr: marsStakingAddress,
          msg: encodeBase64({
            x_mars_per_mars: {},
          }),
        },
      },
    },
  ]);
  const response = await axios.get<WasmContractStoreResponse<MultiQueryResponse>>(
    `${restUrl}/terra/wasm/v1beta1/contracts/${constants.MULTIQUERY}/store?height=${height}&query_msg=${queryMsg}`
  );
  const results = response.data.query_result;

  const marsPerXMars = results[0] ? decodeBase64(results[0].data) : undefined;
  const xMarsPerMars = results[1] ? decodeBase64(results[1].data) : undefined;

  return { marsPerXMars, xMarsPerMars };
}

const height = constants.PRE_ATTACK_HEIGHT;

(async function () {
  const response = await getXMarsExchangeRatio(constants.REST_URL, constants.MARS_STAKING, height);
  console.log(response);
})();
