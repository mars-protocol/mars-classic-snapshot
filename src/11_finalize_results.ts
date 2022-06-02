/* eslint-disable @typescript-eslint/no-non-null-assertion */
import * as fs from "fs";
import * as path from "path";
import { bech32 } from "bech32";

import * as constants from "./constants";
import { isContract } from "./helpers";

type Entry = {
  terraAddress: string;
  marsAddress: string;
  isContract: boolean;
  snapshot1Amount: number;
  snapshot2Amount: number;
  finalAmount: number;
};

function loadCsv(filename: string) {
  const lines = fs.readFileSync(filename, "utf8").split("\n");
  return lines
    .slice(1, lines.length - 1)
    .map((line) => line.split(","))
    .map((line) => ({
      address: line[0]!,
      amount: Number(line[12]),
    }));
}

function convertPrefix(address: string, newPrefix: string) {
  const { words } = bech32.decode(address);
  return bech32.encode(newPrefix, words);
}

(async function () {
  const snapshot1 = loadCsv(
    path.join(__dirname, `../data/all_mars_balances_${constants.PRE_DEPEG_HEIGHT}.csv`)
  );
  const snapshot2 = loadCsv(
    path.join(__dirname, `../data/all_mars_balances_${constants.POST_DEPEG_HEIGHT}.csv`)
  );

  const users1 = snapshot1.map((entry) => entry.address);
  const users2 = snapshot2.map((entry) => entry.address);
  const users = Array.from(new Set([...users1, ...users2]));
  console.log("total unique users:", users.length);

  let entries: Entry[] = [];
  const total = users.length;
  let count = 0;
  for (const user of users) {
    const snapshot1Amount = Math.round(
      snapshot1.find((entry) => entry.address === user)?.amount ?? 0
    );
    const snapshot2Amount = Math.round(
      snapshot2.find((entry) => entry.address === user)?.amount ?? 0
    );

    const finalAmount = Math.round(snapshot1Amount * 0.5 + snapshot2Amount * 0.5);

    const userIsContract = await isContract(constants.REST_URL, user);

    entries.push({
      terraAddress: user,
      marsAddress: userIsContract ? "n/a" : convertPrefix(user, "mars"),
      isContract: userIsContract,
      snapshot1Amount,
      snapshot2Amount,
      finalAmount,
    });

    count += 1;
    console.log(
      `[${count}/${total}] user = ${user}, snapshot1Amount = ${snapshot1Amount}, snapshot2Amount = ${snapshot2Amount}, finalAmount = ${finalAmount}`, userIsContract ? "!!! IS A CONTRACT !!!" : ""
    );
  }

  entries = entries.sort((a, b) => {
    if (a.isContract && !b.isContract) {
      return -1;
    } else if (!a.isContract && b.isContract) {
      return 1;
    }
    return b.finalAmount - a.finalAmount;
  });

  const totalFinalAmount = entries.reduce((a, b) => a + b.finalAmount, 0);
  console.log("done! total final amount:", totalFinalAmount);

  const header = ["terra_address", "mars_address", "is_contract", "pre_depeg_amount", "post_depeg_amount", "final_amount"].join(",") + "\n";
  const rows = entries
    .map((entry) => `${entry.terraAddress},${entry.marsAddress},${entry.isContract},${entry.snapshot1Amount},${entry.snapshot2Amount},${entry.finalAmount}`)
    .join("\n");

  fs.writeFileSync(path.join(__dirname, "../data/final_amounts.csv"), header + rows);
})();
