import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { bech32 } from "bech32";

import * as constants from "./constants";
import { decodeBase64 } from "./helpers";
import { WasmRawQueryResponse, AccountWithBalance, ApolloUserInfo } from "./types";

// https://github.com/CosmWasm/cosmwasm/blob/v1.0.0/packages/storage/src/length_prefixed.rs#L33
// https://thewebdev.info/2022/02/09/how-to-convert-a-32-bit-integer-into-4-bytes-of-data-in-javascript/
function encodeLength(num: number) {
  if (num > 0xffff) {
    throw "only supports numbers up to length 0xFFFF";
  }
  const arr = new ArrayBuffer(4);
  const view = new DataView(arr);
  view.setUint32(0, num, false);
  const buf = Buffer.from(arr);
  return buf.slice(2, 4);
}

// https://github.com/CosmWasm/cosmwasm/blob/v1.0.0/packages/storage/src/length_prefixed.rs#L9
function toLengthPrefixed(namespace: string) {
  const bytes = Buffer.from(namespace, "utf8");
  const prepend = encodeLength(bytes.length);
  return Buffer.concat([prepend, bytes]);
}

function addrCanonicalize(humanAddr: string) {
  const { words } = bech32.decode(humanAddr);
  const bytes = bech32.fromWords(words);
  return Buffer.from(bytes);
}

export async function getAccountsWithBalances(users: string[], height: number) {
  const total = users.length;

  let count = 0;
  let accountsWithBalances: AccountWithBalance[] = [];

  for (const user of users) {
    const keyBytes = Buffer.concat([toLengthPrefixed("user"), addrCanonicalize(user)]);

    // for some reason we need to replace `+` with `-`, and `/` with `_`, otherwise will get
    // `illegal base64 data at input byte x` error
    const key = keyBytes.toString("base64").replaceAll("+", "-").replaceAll("/", "_");

    let balance = 0;

    const response = await axios.get<WasmRawQueryResponse>(
      `${constants.REST_URL}/terra/wasm/v1beta1/contracts/${constants.APOLLO_MARS_UST_FARM}/store/raw?height=${height}&key=${key}`
    );
    const rawResponse = response.data.data;

    if (!!rawResponse) {
      const userInfo: ApolloUserInfo = decodeBase64(rawResponse);
      balance = Number(userInfo.shares);
      accountsWithBalances.push({ address: user, balance });
    }

    count += 1;
    console.log(`[${count}/${total}] user = ${user}, balance = ${balance}`);
  }

  accountsWithBalances = accountsWithBalances.filter((account) => account.balance > 0);

  const totalBalance = accountsWithBalances.reduce((a, b) => a + b.balance, 0);
  console.log("total balance:", totalBalance);

  return accountsWithBalances;
}

const height = constants.PRE_DEPEG_HEIGHT;

(async function () {
  console.log("loading user addresses...");

  const lines = fs
    .readFileSync(path.join(__dirname, "../data/mars_apollocompounder_txs.csv"), "utf8")
    .split("\n");

  const usersWithDups = lines
    .slice(1, lines.length - 1) // remove the 1st and last lines
    .map((line) => line.split(",")[2] as string); // split each line by the delimiter

  const users = Array.from(new Set(usersWithDups));

  console.log(`total number of non-duplicate users: ${users.length}`);

  const accountsWithBalances = await getAccountsWithBalances(users, height);

  fs.writeFileSync(
    path.join(__dirname, `../data/apollo_users_${height}.json`),
    JSON.stringify(accountsWithBalances, null, 2)
  );
})();
