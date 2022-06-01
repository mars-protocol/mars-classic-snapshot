/* eslint-disable @typescript-eslint/no-non-null-assertion */
import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import axiosRetry from "axios-retry";

import * as constants from "./constants";
import { encodeBase64, decodeBase64, sumArrayOfNumbers, isContract } from "./helpers";
import {
  WasmSmartQueryResponse,
  MultiQueryResponse,
  Cw20TokenInfoResponse,
  AccountWithBalance,
  AccountWithBalanceAndReward,
} from "./types";

axiosRetry(axios);

//--------------------------------------------------------------------------------------------------
// Mars tokens can exist in various forms. here are all the ones that we index in this snapshot
//--------------------------------------------------------------------------------------------------

const MARS_TOKEN_TYPES = [
  // MARS tokens in wallet
  "in_wallet",
  // staked at Mars staking contract in the form as xMARS tokens; converted to equivalent MARS amount
  "staked",
  // MARS tokens being unstaked at Mars staking contract
  "unstaking",
  // MARS tokens in Terraswap MARS-UST pair
  "in_terraswap_mars_ust_pair",
  // MARS tokens in Astroport MARS-UST pair (not staked in generator)
  "in_astroport_mars_ust_pair",
  // MARS tokens in Astroport XMARS-MARS pair
  "in_astroport_xmars_mars_pair",
  // Astroport MARS-UST LP tokens in Astro generator, as well as pending reward
  "in_generator",
  // Astroport MARS-UST LP tokens in ApolloDAO autocompounder, as well as pending reward
  "in_apollo",
  // Astroport MARS-UST LP tokens in Spectrum protocol autocompounder, as well as pending reward
  "in_spec",
  // Astroport MARS-UST LP tokens in lockdrop phase 2, as well as pending generator pending reward
  "in_auction",
  // MARS tokens deposited in Mars Council when creating proposals
  "in_council",
] as const;

type MarsTokenType = typeof MARS_TOKEN_TYPES[number];

type MarsTokenBalances = { [key in MarsTokenType]: number };

//--------------------------------------------------------------------------------------------------
// an entry is a row in the final output CSV file
//--------------------------------------------------------------------------------------------------

class Entry {
  terraAddress: string;
  marsTokens: MarsTokenBalances;

  isContract = false;

  constructor(terraAddress: string) {
    this.terraAddress = terraAddress;

    this.marsTokens = {} as MarsTokenBalances;
    for (const marsTokenType of MARS_TOKEN_TYPES) {
      this.marsTokens[marsTokenType] = 0;
    }
  }

  sum() {
    return Object.values(this.marsTokens).reduce(
      (prevValue, currValue) => prevValue + currValue,
      0
    );
  }

  toCsvRow() {
    return [this.terraAddress, this.isContract]
      .concat(MARS_TOKEN_TYPES.map((ty) => this.marsTokens[ty].toString()))
      .concat(this.sum().toString())
      .join(",");
  }
}

//--------------------------------------------------------------------------------------------------
// array of entries
//--------------------------------------------------------------------------------------------------

class Entries {
  entries: Entry[];
  communityPoolTotal = 0;
  vestingTotal = 0;

  constructor(entries?: Entry[]) {
    this.entries = entries ?? [];
  }

  addAmountByAddress(address: string, tokenType: MarsTokenType, amount: number) {
    const entry = this.entries.find((entry) => entry.terraAddress === address);
    if (!!entry) {
      entry.marsTokens[tokenType] += amount;
    } else {
      const newEntry = new Entry(address);
      newEntry.marsTokens[tokenType] = amount;
      this.entries.push(newEntry);
    }
  }

  removeEntryByAddress(address: string) {
    const index = this.indexOfAddress(address);
    if (index > -1) {
      this.entries.splice(index, 1);
    }
  }

  indexOfAddress(address: string) {
    return this.entries.map((entry) => entry.terraAddress).indexOf(address);
  }

  entryOfAddress(address: string) {
    return this.entries[this.indexOfAddress(address)];
  }

  sort() {
    this.entries.sort((a, b) => {
      if (a.isContract && !b.isContract) {
        return -1;
      }
      if (!a.isContract && b.isContract) {
        return 1;
      }
      return b.sum() - a.sum();
    });
  }

  sum() {
    return sumArrayOfNumbers(this.entries.map((entry) => entry.sum()));
  }

  toCsv() {
    const header =
      ["address", "is_contract"].concat(MARS_TOKEN_TYPES).concat(["total"]).join(",") + "\n";
    const body = this.entries.map((entry) => entry.toCsvRow()).join("\n");
    return header + body;
  }

  checkTotal() {
    const entriesTotal = this.sum();
    const total = entriesTotal + this.communityPoolTotal + this.vestingTotal;
    console.log(
      `CHECK TOTAL: ${entriesTotal} (entries) + ${this.communityPoolTotal} (community pool) + ${this.vestingTotal} (vesting) = ${total}`
    );
  }
}

//--------------------------------------------------------------------------------------------------
// main
//--------------------------------------------------------------------------------------------------

const height = constants.PRE_DEPEG_HEIGHT;
const entries = new Entries();

(async function () {
  // query stuff
  const queryMsg = encodeBase64([
    {
      wasm: {
        smart: {
          contract_addr: constants.MARS_STAKING,
          msg: encodeBase64({
            mars_per_x_mars: {},
          }),
        },
      },
    },
    {
      wasm: {
        smart: {
          contract_addr: constants.TERRASWAP_MARS_UST_LP,
          msg: encodeBase64({
            token_info: {},
          }),
        },
      },
    },
    {
      wasm: {
        smart: {
          contract_addr: constants.ASTROPORT_MARS_UST_LP,
          msg: encodeBase64({
            token_info: {},
          }),
        },
      },
    },
    {
      wasm: {
        smart: {
          contract_addr: constants.ASTROPORT_XMARS_MARS_LP,
          msg: encodeBase64({
            token_info: {},
          }),
        },
      },
    },
  ]);
  const response = await axios.get<WasmSmartQueryResponse<MultiQueryResponse>>(
    `${constants.REST_URL}/terra/wasm/v1beta1/contracts/${constants.MULTIQUERY}/store?height=${height}&query_msg=${queryMsg}`
  );
  const results = response.data.query_result;

  const marsPerXMars = Number(decodeBase64(results[0]!.data));
  console.log("fetched xmars/mars exchange ratio! marsPerXMars =", marsPerXMars);

  const terraswapMarsUstLp: Cw20TokenInfoResponse = decodeBase64(results[1]!.data);
  const terraswapMarsUstTotalShares = Number(terraswapMarsUstLp.total_supply);
  console.log("fetched Terraswap MARS-UST LP info! total shares =", terraswapMarsUstTotalShares);

  const astroportMarsUstLp: Cw20TokenInfoResponse = decodeBase64(results[2]!.data);
  const astroportMarsUstTotalShares = Number(astroportMarsUstLp.total_supply);
  console.log("fetched Astroport MARS-UST LP info! total shares =", astroportMarsUstTotalShares);

  const astroportXMarsMarsLp: Cw20TokenInfoResponse = decodeBase64(results[3]!.data);
  const astroportXMarsMarsTotalShares = Number(astroportXMarsMarsLp.total_supply);
  console.log(
    "fetched Astroport XMARS-MARS LP info! total shares =",
    astroportXMarsMarsTotalShares
  );

  //------------------------------------------------------------------------------------------------
  // load mars token holders and initialize entries
  //------------------------------------------------------------------------------------------------

  const marsBalances: AccountWithBalance[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, `../data/mars_owners_${height}.json`), "utf8")
  );
  console.log("loaded mars token holders! total addresses =", marsBalances.length);

  for (const { address, balance } of marsBalances) {
    entries.addAmountByAddress(address, "in_wallet", balance);
  }
  console.log("initialized entries! total addresses =", entries.entries.length);

  entries.checkTotal();

  //------------------------------------------------------------------------------------------------
  // handle mars staking contract
  // MARS tokens held in the staking contract can be assigned to 2 types of users:
  // - holders of xMARS tokens
  // - users who have initiated unstaking and have not withdrawn yet
  //------------------------------------------------------------------------------------------------

  // add holders on xmars tokens
  const xmarsBalances: AccountWithBalance[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, `../data/xmars_owners_${height}.json`), "utf8")
  );
  console.log("loaded xmars token holders! total addresses =", marsBalances.length);

  for (const { address, balance } of xmarsBalances) {
    entries.addAmountByAddress(address, "staked", balance * marsPerXMars);
  }
  console.log("appended xmars holders to entries");

  // add users with unstaking claims
  const claims: AccountWithBalance[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, `../data/unstake_claims_${height}.json`), "utf8")
  );
  console.log("loaded unstaking claims! total addresses =", claims.length);

  for (const { address, balance } of claims) {
    entries.addAmountByAddress(address, "unstaking", balance);
  }
  console.log("appended unstaking claims to entires");

  // remove the staking contract from entries
  entries.removeEntryByAddress(constants.MARS_STAKING);
  console.log("removed staking contract from entries");

  // check total MARS tokens. must be close to 1B (can tolerate small deviations, due to rounding errors)
  entries.checkTotal();

  //------------------------------------------------------------------------------------------------
  // handle Terraswap MARS-UST pair contract
  //------------------------------------------------------------------------------------------------

  // add holders of the LP token
  const terraswapMarsUstLpBalances: AccountWithBalance[] = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, `../data/terraswap_mars_ust_lp_owners_${height}.json`),
      "utf8"
    )
  );
  console.log(
    "loaded owners of Terraswap MARS-UST LP tokens! total =",
    terraswapMarsUstLpBalances.length
  );

  const terraswapMarsUstPoolEntry = entries.entryOfAddress(constants.TERRASWAP_MARS_UST_PAIR);
  const marsInTerraswapMarsUstPool = terraswapMarsUstPoolEntry?.sum() ?? 0;

  for (const { address, balance } of terraswapMarsUstLpBalances) {
    entries.addAmountByAddress(
      address,
      "in_terraswap_mars_ust_pair",
      (balance * marsInTerraswapMarsUstPool) / terraswapMarsUstTotalShares
    );
  }
  console.log("appended Terraswap MARS-UST LP positions to entires");

  // remove the pair contract
  entries.removeEntryByAddress(constants.TERRASWAP_MARS_UST_PAIR);
  console.log("removed Terraswap MARS-UST pair contract from entries");

  // check total MARS tokens. must be close to 1B (can tolerate small deviations, due to rounding errors)
  entries.checkTotal();

  //------------------------------------------------------------------------------------------------
  // handle Astroport MARS-UST pair contract
  //------------------------------------------------------------------------------------------------

  // add holders of the LP token
  const astroportMarsUstLpBalances: AccountWithBalance[] = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, `../data/astroport_mars_ust_lp_owners_${height}.json`),
      "utf8"
    )
  );
  console.log(
    "loaded owners of Astroport MARS-UST LP tokens! total =",
    astroportMarsUstLpBalances.length
  );

  const astroportMarsUstPoolEntry = entries.entryOfAddress(constants.ASTROPORT_MARS_UST_PAIR);
  const marsInAstroportMarsUstPool = astroportMarsUstPoolEntry?.sum() ?? 0;

  for (const { address, balance } of astroportMarsUstLpBalances) {
    entries.addAmountByAddress(
      address,
      "in_astroport_mars_ust_pair",
      (balance * marsInAstroportMarsUstPool) / astroportMarsUstTotalShares
    );
  }
  console.log("appended Astroport MARS-UST LP positions to entires");

  // remove the pair contract
  entries.removeEntryByAddress(constants.ASTROPORT_MARS_UST_PAIR);
  console.log("removed Astroport MARS-UST pair contract from entries");

  // check total MARS tokens. must be close to 1B (can tolerate small deviations, due to rounding errors)
  entries.checkTotal();

  //------------------------------------------------------------------------------------------------
  // handle Astroport XMARS-MARS pair contract
  //------------------------------------------------------------------------------------------------

  // add holders of the LP token
  const astroportXMarsMarsLpBalances: AccountWithBalance[] = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, `../data/astroport_xmars_mars_lp_owners_${height}.json`),
      "utf8"
    )
  );
  console.log(
    "loaded owners of Astroport XMARS-MARS LP tokens! total =",
    astroportXMarsMarsLpBalances.length
  );

  const astroportXMarsMarsPoolEntry = entries.entryOfAddress(constants.ASTROPORT_XMARS_MARS_PAIR);
  const marsInAstroportXMarsMarsPool = astroportXMarsMarsPoolEntry?.sum() ?? 0;

  for (const { address, balance } of astroportXMarsMarsLpBalances) {
    entries.addAmountByAddress(
      address,
      "in_astroport_xmars_mars_pair",
      (balance * marsInAstroportXMarsMarsPool) / astroportXMarsMarsTotalShares
    );
  }
  console.log("appended Astroport XMARS-MARS LP positions to entires");

  // remove the pair contract
  entries.removeEntryByAddress(constants.ASTROPORT_XMARS_MARS_PAIR);
  console.log("removed Astroport XMARS-MARS pair contract from entries");

  // check total MARS tokens. must be close to 1B (can tolerate small deviations, due to rounding errors)
  entries.checkTotal();

  //------------------------------------------------------------------------------------------------
  // handle Mars staking contract
  //------------------------------------------------------------------------------------------------

  // add stakers of Astroport MARS-UST LP tokens at Astro generator
  const generatorStakerBalances: AccountWithBalanceAndReward[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, `../data/mars_lp_stakers_${height}.json`), "utf8")
  );
  console.log(
    "loaded stakers of MARS-UST LP tokens as Astro generator! total =",
    generatorStakerBalances.length
  );

  for (const { address, balance, pendingReward } of generatorStakerBalances) {
    entries.addAmountByAddress(
      address,
      "in_generator",
      (balance * marsInAstroportMarsUstPool) / astroportMarsUstTotalShares + pendingReward
    );
  }
  console.log("appended Astro generator stakers to entires");

  // all undistributed rewards in Mars staking and generator proxy contracts are clawed back to the
  // community pool
  const totalStakerPendingReward = generatorStakerBalances.reduce((a, b) => a + b.pendingReward, 0);
  const marsStakingEntry = entries.entryOfAddress(constants.MARS_LP_STAKING);
  const generatorProxyEntry = entries.entryOfAddress(constants.ASTRO_GENERATOR_PROXY);

  entries.communityPoolTotal +=
    marsStakingEntry!.marsTokens.in_wallet +
    generatorProxyEntry!.marsTokens.in_wallet -
    totalStakerPendingReward;

  entries.removeEntryByAddress(constants.MARS_LP_STAKING);
  entries.removeEntryByAddress(constants.ASTRO_GENERATOR_PROXY);

  console.log("clawed back undistributed incentives in Mars LP staking and Astro generator");

  // check total MARS tokens. must be close to 1B (can tolerate small deviations, due to rounding errors)
  entries.checkTotal();

  //------------------------------------------------------------------------------------------------
  // handle Mars auction, i.e. lockdrop phase 2
  //------------------------------------------------------------------------------------------------

  // get users who have deposited in lockdrop phase 2
  const auctionParticipants: AccountWithBalanceAndReward[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, `../data/auction_participants_${height}.json`), "utf8")
  );
  console.log("loaded auction participants! total =", auctionParticipants.length);

  const auctionEntry = entries.entryOfAddress(constants.MARS_AUCTION)!;
  // move numbers around - just internal accounting
  auctionEntry.marsTokens.in_wallet += auctionEntry.marsTokens.in_generator;
  auctionEntry.marsTokens.in_generator = 0;

  for (const { address, balance, pendingReward } of auctionParticipants) {
    // the amount the user is entitled to
    const amount = (balance * marsInAstroportMarsUstPool) / astroportMarsUstTotalShares + pendingReward;

    // we deduct this from auction contract's balance
    auctionEntry.marsTokens.in_wallet -= amount;

    entries.addAmountByAddress(address, "in_auction", amount);
  }
  console.log("appended Mars auction participants to entires");

  // the rest of the amount owned by the auction contract is clawed back
  entries.communityPoolTotal += auctionEntry.sum();
  entries.removeEntryByAddress(constants.MARS_AUCTION);
  console.log("clawed back undistributed incentives in Mars auction");

  // check total MARS tokens. must be close to 1B (can tolerate small deviations, due to rounding errors)
  entries.checkTotal();

  //------------------------------------------------------------------------------------------------
  // handle Apollo MARS-UST autocompounder
  //------------------------------------------------------------------------------------------------

  //------------------------------------------------------------------------------------------------
  // handle Spectrum MARS-UST autocompounder
  //------------------------------------------------------------------------------------------------

  const specUsers: AccountWithBalance[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, `../data/spec_users_${height}.json`), "utf8")
  );
  console.log("loaded spec users! total =", specUsers.length);

  const totalShares = specUsers.reduce((a, b) => a + b.balance, 0);
  const specEntry = entries.entryOfAddress(constants.SPECTRUM_MARS_UST_FARM)!;

  for (const { address, balance } of specUsers) {
    entries.addAmountByAddress(address, "in_spec", specEntry.sum() * balance / totalShares);
  }
  console.log("appended spec users to entires");

  entries.removeEntryByAddress(constants.SPECTRUM_MARS_UST_FARM);
  console.log("removed spec autocompounder contract from entries");

  entries.checkTotal();

  //------------------------------------------------------------------------------------------------
  // handle council depositors
  //------------------------------------------------------------------------------------------------

  // get users who deposited MARS tokens at council
  const councilDepositors: AccountWithBalance[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, `../data/council_depositors_${height}.json`), "utf8")
  );
  console.log("loaded council depositors! total =", councilDepositors.length);

  for (const { address, balance } of councilDepositors) {
    entries.addAmountByAddress(address, "in_council", balance);
  }
  console.log("appended council depositors to entires");

  entries.removeEntryByAddress(constants.MARS_COUNCIL);
  console.log("removed council contract from entries");

  entries.checkTotal();

  //------------------------------------------------------------------------------------------------
  // claw backs
  // - two small Terraswap pools: MARS-EUT and MARS-SET, each has exactly 0.000001 MARS
  // - unclaimed tokens in airdrops
  // - unclaimed tokens in lockdrop phases 1 & 2
  // - tokens in admin multisig
  // - tokens in vesting
  // - 1 MARS sent to the xMARS contract by mistake
  // - small amount of tokens owned by Astro fee pool and Pylon governance
  //------------------------------------------------------------------------------------------------

  const terraswapMarsEutPairEntry = entries.entryOfAddress(constants.TERRASWAP_MARS_EUT_PAIR)!;
  entries.communityPoolTotal += terraswapMarsEutPairEntry.sum();
  entries.removeEntryByAddress(constants.TERRASWAP_MARS_EUT_PAIR);

  const terraswapMarsSetPairEntry = entries.entryOfAddress(constants.TERRASWAP_MARS_SET_PAIR)!;
  entries.communityPoolTotal += terraswapMarsSetPairEntry.sum();
  entries.removeEntryByAddress(constants.TERRASWAP_MARS_SET_PAIR);

  console.log("clawed back tokens in Terraswap EUT, SET pairs");

  const airdropEntry = entries.entryOfAddress(constants.MARS_AIRDROP)!;
  entries.communityPoolTotal += airdropEntry.sum();
  entries.removeEntryByAddress(constants.MARS_AIRDROP);
  console.log("clawed back unclaimed airdrops");

  const lockdropEntry = entries.entryOfAddress(constants.MARS_LOCKDROP)!;
  entries.communityPoolTotal += lockdropEntry.sum();
  entries.removeEntryByAddress(constants.MARS_LOCKDROP);
  console.log("clawed back unclaimed tokens in lockdrop phase 1");

  const adminMultisigEntry = entries.entryOfAddress(constants.MARS_ADMIN_MULTISIG)!;
  entries.communityPoolTotal += adminMultisigEntry.sum();
  entries.removeEntryByAddress(constants.MARS_ADMIN_MULTISIG);
  console.log("clawed back unclaimed tokens in admin multisig");

  const vestingEntry = entries.entryOfAddress(constants.MARS_VESTING)!;
  entries.vestingTotal += vestingEntry.sum();
  entries.removeEntryByAddress(constants.MARS_VESTING);
  console.log("clawed back unclaimed tokens in vesting");

  const xMarsEntry = entries.entryOfAddress(constants.XMARS_TOKEN)!;
  entries.communityPoolTotal += xMarsEntry.sum();
  entries.removeEntryByAddress(constants.XMARS_TOKEN);
  console.log("clawed back tokens sent to xMars contract by mistake by someone");

  const astroFeePoolEntry = entries.entryOfAddress(constants.ASTROPORT_FEE_POOL)!;
  entries.communityPoolTotal += astroFeePoolEntry.sum();
  entries.removeEntryByAddress(constants.ASTROPORT_FEE_POOL);
  console.log("clawed back tokens held by astro fee pool");

  const pylonGovEntry = entries.entryOfAddress(constants.PYLON_GOVERNANCE)!;
  entries.communityPoolTotal += pylonGovEntry.sum();
  entries.removeEntryByAddress(constants.PYLON_GOVERNANCE);
  console.log("clawed back tokens held by pylon governance");

  entries.checkTotal();

  console.log("done!")

  //------------------------------------------------------------------------------------------------
  // done!!
  //------------------------------------------------------------------------------------------------

  // determine whether each address is a contract
  const total = entries.entries.length;
  let count = 0;
  for (const entry of entries.entries) {
    entry.isContract = await isContract(constants.REST_URL, entry.terraAddress);

    count += 1;
    if (entry.isContract) {
      console.log(`[${count}/${total}] address = ${entry.terraAddress} !!! IS A CONTRACT !!!`);
    } else {
      console.log(`[${count}/${total}] address = ${entry.terraAddress}`);
    }
  }

  // sort entries. first by whether it is a contract (put all contract in front) then by its MARS
  // amount (in descending order)
  entries.sort();

  // write data to CSV file
  fs.writeFileSync(
    path.join(__dirname, `../data/all_mars_balances_${height}.csv`),
    entries.toCsv()
  );
})();
