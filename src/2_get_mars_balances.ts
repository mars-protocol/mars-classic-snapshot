import * as fs from "fs";
import * as path from "path";
import { LCDClient } from "@terra-money/terra.js";

import { getCw20Balances } from "./query_cw20";

const lcd = new LCDClient({
  chainID: "columbus-5",
  URL: "http://172.255.98.36:1317/",
});

const TOKEN_ADDRESS = "terra12hgwnpupflfpuual532wgrxu2gjp0tcagzgx4n";
const TOKEN_NAME = "mars";
const HEIGHT = 7544910; // pre-attack

(async function () {
  const owners = JSON.parse(
    fs.readFileSync(path.join(__dirname, `../data/${TOKEN_NAME}_owners_${HEIGHT}.json`), "utf8")
  );
  console.log("loaded token owners! total:", owners.length);

  const accountsWithBalances = await getCw20Balances(lcd, TOKEN_ADDRESS, owners, HEIGHT);

  fs.writeFileSync(
    path.join(__dirname, `../data/${TOKEN_NAME}_balances_${HEIGHT}.json`),
    JSON.stringify(accountsWithBalances, null, 2)
  );
})();
