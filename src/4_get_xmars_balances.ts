import * as fs from "fs";
import * as path from "path";

import { getCw20Balances } from "./query_cw20";
import * as constants from "./constants";

const tokenName = "xmars";
const height = constants.PRE_ATTACK_HEIGHT;

(async function () {
  const owners = JSON.parse(
    fs.readFileSync(path.join(__dirname, `../data/${tokenName}_owners_${height}.json`), "utf8")
  );
  console.log("loaded token owners! total:", owners.length);

  const accountsWithBalances = await getCw20Balances(
    constants.REST_URL,
    constants.XMARS_TOKEN,
    owners,
    height
  );

  fs.writeFileSync(
    path.join(__dirname, `../data/${tokenName}_balances_${height}.json`),
    JSON.stringify(accountsWithBalances, null, 2)
  );
})();
