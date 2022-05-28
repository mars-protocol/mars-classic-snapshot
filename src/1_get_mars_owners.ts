import * as fs from "fs";
import * as path from "path";
import { getCw20Owners } from "./query_cw20";

const REST_URL = "http://172.255.98.36:1317";

const TOKEN_ADDRESS = "terra12hgwnpupflfpuual532wgrxu2gjp0tcagzgx4n";
const TOKEN_NAME = "mars";
const HEIGHT = 7544910; // pre-attack

(async function () {
  const accounts = await getCw20Owners(REST_URL, TOKEN_ADDRESS, HEIGHT);

  fs.writeFileSync(
    path.join(__dirname, `../data/${TOKEN_NAME}_owners_${HEIGHT}.json`),
    JSON.stringify(accounts, null, 2)
  );
})();
