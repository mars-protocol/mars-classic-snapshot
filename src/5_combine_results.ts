import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import axiosRetry from "axios-retry";

import { AccountWithBalance } from "./query_cw20";
import * as constants from "./constants";

axiosRetry(axios);

type Entry = {
  address: string;
  hasPubKey: boolean;
  marsBalancePre: number;
  xmarsBalancePre: number;
};

async function accountHasPubKey(restUrl: string, address: string) {
  try {
    const { data: { account } } = await axios.get(`${restUrl}/cosmos/auth/v1beta1/accounts/${address}`);
    return "pub_key" in account && !!account["pub_key"];
  } catch {
    return false;
  }
}

(async function () {
  const marsBalancesPre: AccountWithBalance[] = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, `../data/mars_balances_${constants.PRE_ATTACK_HEIGHT}.json`),
      "utf8"
    )
  );
  const xmarsBalancesPre: AccountWithBalance[] = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, `../data/xmars_balances_${constants.PRE_ATTACK_HEIGHT}.json`),
      "utf8"
    )
  );

  const marsOwnersPre = marsBalancesPre.map((acct) => acct.address);
  const xmarsOwnersPre = xmarsBalancesPre.map((acct) => acct.address);
  const owners = new Set(marsOwnersPre.concat(xmarsOwnersPre));
  console.log("all unique mars or xmars owners:", owners.size);

  const entries: Entry[] = [];
  const total = owners.size;
  let count = 0;
  for (const owner of owners) {
    const hasPubKey = await accountHasPubKey(constants.REST_URL, owner);
    const entry = {
      address: owner,
      hasPubKey,
      marsBalancePre: 0,
      xmarsBalancePre: 0,
    };

    let index = marsBalancesPre.findIndex((acct) => acct.address === owner);
    if (index > -1) {
      (entry.marsBalancePre = marsBalancesPre[index]?.balance ?? 0),
        marsBalancesPre.splice(index, 1);
    }

    index = xmarsBalancesPre.findIndex((acct) => acct.address === owner);
    if (index > -1) {
      (entry.xmarsBalancePre = xmarsBalancesPre[index]?.balance ?? 0),
        xmarsBalancesPre.splice(index, 1);
    }

    entries.push(entry);

    count += 1;
    console.log(`[${count}/${total}] address = ${owner}, ${hasPubKey ? "" : "ADDRESS MAY BE A CONTRACT"}`);
  }

  // sort addresses alphabetically
  entries.sort((a, b) => {
    if (a.address < b.address) {
      return -1;
    } else if (a.address > b.address) {
      return 1;
    } else {
      return 0;
    }
  });

  // convert to CSV
  const header = "address,has_pubkey,mars_pre,xmars_pre\n";
  const body = entries
    .map(({ address, hasPubKey, marsBalancePre, xmarsBalancePre }) => {
      return `${address},${hasPubKey},${marsBalancePre},${xmarsBalancePre}`;
    })
    .join("\n");

  fs.writeFileSync(path.join(__dirname, "../data/combined_owners.csv"), header + body);
})();
