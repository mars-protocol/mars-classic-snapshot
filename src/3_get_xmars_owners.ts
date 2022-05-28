import * as fs from "fs";
import * as path from "path";
import { LCDClient } from "@terra-money/terra.js";

import { getCw20Owners } from "./query_cw20";

const lcd = new LCDClient({
  chainID: "columbus-5",
  URL: "http://172.255.98.36:1317/",
});

const TOKEN_ADDRESS = "terra1a04v570f9cxp49mk06vjsm8axsswndpwwt67k4";
const TOKEN_NAME = "xmars";
const HEIGHT = 7544910; // pre-attack

(async function () {
  const accounts = await getCw20Owners(lcd, TOKEN_ADDRESS, HEIGHT);

  fs.writeFileSync(
    path.join(__dirname, `../data/${TOKEN_NAME}_owners_${HEIGHT}.json`),
    JSON.stringify(accounts, null, 2)
  );
})();
