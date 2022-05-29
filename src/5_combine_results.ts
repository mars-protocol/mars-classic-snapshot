import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import axiosRetry from "axios-retry";

import { AccountWithBalance } from "./1_get_cw20_owners";
import * as constants from "./constants";

axiosRetry(axios);

type WasmContractInfoResponse = {
  contract_info: {
    address: string;
    creator: string;
    admin: string;
    code_id: string;
    init_msg: object;
  };
};

type Entry = {
  address: string;
  isContract: boolean;
  marsBalance: number;
  xmarsBalance: number;
  astroportMarsUstLpBalance: number;
  astroportXMarsMarsLpBalance: number;
  terraswapMarsUstLpBalance: number;
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
    fs.readFileSync(path.join(__dirname, `../data/mars_owners_${height}.json`), "utf8")
  );
  const xmarsBalances: AccountWithBalance[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, `../data/xmars_owners_${height}.json`), "utf8")
  );
  const astroportMarsUstLpBalances: AccountWithBalance[] = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, `../data/astroport_mars_ust_lp_owners_${height}.json`),
      "utf8"
    )
  );
  const astroportXMarsMarsLpBalances: AccountWithBalance[] = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, `../data/astroport_xmars_mars_lp_owners_${height}.json`),
      "utf8"
    )
  );
  const terraswapMarsUstLpBalances: AccountWithBalance[] = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, `../data/terraswap_mars_ust_lp_owners_${height}.json`),
      "utf8"
    )
  );

  const marsOwners = marsBalances.map((acct) => acct.address);
  const xmarsOwners = xmarsBalances.map((acct) => acct.address);
  const astroportMarsUstLpOwners = astroportMarsUstLpBalances.map((acct) => acct.address);
  const astroportXMarsMarsLpOwners = astroportXMarsMarsLpBalances.map((acct) => acct.address);
  const terraswapMarsUstLpOwners = terraswapMarsUstLpBalances.map((acct) => acct.address);

  const owners = new Set(
    marsOwners
      .concat(xmarsOwners)
      .concat(astroportMarsUstLpOwners)
      .concat(astroportXMarsMarsLpOwners)
      .concat(terraswapMarsUstLpOwners)
  );
  console.log("all owners:", owners.size);

  const entries: Entry[] = [];
  const total = owners.size;
  let count = 0;
  for (const owner of owners) {
    const entry = {
      address: owner,
      isContract: await isContract(constants.REST_URL, owner),
      marsBalance: 0,
      xmarsBalance: 0,
      astroportMarsUstLpBalance: 0,
      astroportXMarsMarsLpBalance: 0,
      terraswapMarsUstLpBalance: 0,
    };

    let index = marsBalances.findIndex((acct) => acct.address === owner);
    if (index > -1) {
      entry.marsBalance = marsBalances[index]?.balance ?? 0;
      marsBalances.splice(index, 1);
    }

    index = xmarsBalances.findIndex((acct) => acct.address === owner);
    if (index > -1) {
      entry.xmarsBalance = xmarsBalances[index]?.balance ?? 0;
      xmarsBalances.splice(index, 1);
    }

    index = astroportMarsUstLpBalances.findIndex((acct) => acct.address === owner);
    if (index > -1) {
      entry.astroportMarsUstLpBalance = astroportMarsUstLpBalances[index]?.balance ?? 0;
      astroportMarsUstLpBalances.splice(index, 1);
    }

    index = astroportXMarsMarsLpBalances.findIndex((acct) => acct.address === owner);
    if (index > -1) {
      entry.astroportXMarsMarsLpBalance = astroportXMarsMarsLpBalances[index]?.balance ?? 0;
      astroportXMarsMarsLpBalances.splice(index, 1);
    }

    index = terraswapMarsUstLpBalances.findIndex((acct) => acct.address === owner);
    if (index > -1) {
      entry.terraswapMarsUstLpBalance = terraswapMarsUstLpBalances[index]?.balance ?? 0;
      terraswapMarsUstLpBalances.splice(index, 1);
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
  const header =
    "address,is_contract,umars,uxmars,astroport_mars_ust_lp,astroport_xmars_mars_lp,terraswap_mars_ust_lp\n";
  const body = entries
    .map((entry) => {
      return [
        entry.address,
        entry.isContract,
        entry.marsBalance,
        entry.xmarsBalance,
        entry.astroportMarsUstLpBalance,
        entry.astroportXMarsMarsLpBalance,
        entry.terraswapMarsUstLpBalance,
      ].join(",");
    })
    .join("\n");

  fs.writeFileSync(path.join(__dirname, "../data/combined_owners.csv"), header + body);
})();
