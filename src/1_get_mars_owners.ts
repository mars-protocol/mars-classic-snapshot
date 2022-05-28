import * as fs from "fs";
import * as path from "path";

import { getCw20Owners } from "./query_cw20";
import * as constants from "./constants";

const tokenName = "mars";
const height = constants.PRE_ATTACK_HEIGHT;

(async function () {
  const accounts = await getCw20Owners(constants.REST_URL, constants.MARS_TOKEN, height);

  fs.writeFileSync(
    path.join(__dirname, `../data/${tokenName}_owners_${height}.json`),
    JSON.stringify(accounts, null, 2)
  );
})();
