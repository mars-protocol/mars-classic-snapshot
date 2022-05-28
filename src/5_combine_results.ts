import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import axiosRetry from "axios-retry";

import { AccountWithBalance } from "./query_cw20";
import * as constants from "./constants";

axiosRetry(axios);

type WasmContractInfoResponse = {
  contract_info: {
    address: string;
    creator: string;
    admin: string;
    code_id: string;
    init_msg: object;
  }
};

type Entry = {
  address: string;
  isContract: boolean;
  marsBalance: number;
  xmarsBalance: number;
};

async function isContract(restUrl: string, address: string) {
  try {
    await axios.get<WasmContractInfoResponse>(`${restUrl}/terra/wasm/v1beta1/contracts/${address}`);
    return true;
  } catch {
    return false;
  }
}

const height = constants.PRE_ATTACK_HEIGHT;

(async function () {
  const marsBalances: AccountWithBalance[] = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, `../data/mars_balances_${height}.json`),
      "utf8"
    )
  );
  const xmarsBalances: AccountWithBalance[] = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, `../data/xmars_balances_${height}.json`),
      "utf8"
    )
  );

  const marsOwners = marsBalances.map((acct) => acct.address);
  const xmarsOwners = xmarsBalances.map((acct) => acct.address);
  const owners = new Set(marsOwners.concat(xmarsOwners));
  console.log("all unique mars or xmars owners:", owners.size);

  const entries: Entry[] = [];
  const total = owners.size;
  let count = 0;
  for (const owner of owners) {
    const entry = {
      address: owner,
      isContract: await isContract(constants.REST_URL, owner),
      marsBalance: 0,
      xmarsBalance: 0,
    };

    let index = marsBalances.findIndex((acct) => acct.address === owner);
    if (index > -1) {
      (entry.marsBalance = marsBalances[index]?.balance ?? 0),
        marsBalances.splice(index, 1);
    }

    index = xmarsBalances.findIndex((acct) => acct.address === owner);
    if (index > -1) {
      (entry.xmarsBalance = xmarsBalances[index]?.balance ?? 0),
        xmarsBalances.splice(index, 1);
    }

    entries.push(entry);

    count += 1;
    console.log(
      `[${count}/${total}] address = ${owner}${entry.isContract ? ", ADDRESS IS A CONTRACT" : ""}`
    );
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
  const header = "address,is_contract,umars,uxmars\n";
  const body = entries
    .map(({ address, isContract, marsBalance, xmarsBalance }) => {
      return `${address},${isContract},${marsBalance},${xmarsBalance}`;
    })
    .join("\n");

  fs.writeFileSync(path.join(__dirname, "../data/combined_owners.csv"), header + body);
})();
