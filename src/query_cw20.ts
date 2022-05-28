import { LCDClient } from "@terra-money/terra.js";

import { retry } from "./helpers";

export type AllAccountsResponse = {
  accounts: string[];
};

export type Cw20BalanceResponse = {
  balance: string;
};

export type AccountWithBalance = {
  address: string;
  balance: number;
};

export async function getCw20Owners(lcd: LCDClient, tokenAddress: string, height?: number) {
  let accounts: string[] = [];
  let startAfter: string | undefined = undefined;

  // fetch all acocunts
  while (true) {
    const response: AllAccountsResponse = await retry(
      lcd.wasm.contractQuery(
        tokenAddress,
        {
          all_accounts: {
            start_after: startAfter,
            limit: 30,
          },
        },
        {
          height: height?.toString(),
        }
      )
    );

    if (response.accounts.length === 0) {
      break;
    }

    accounts = accounts.concat(response.accounts);
    startAfter = response.accounts[response.accounts.length - 1];

    console.log(`fetched ${response.accounts.length} accounts, startAfter =`, startAfter);
  }

  console.log(`fetched a total of ${accounts.length} accounts!`);

  return accounts;
}

export async function getCw20Balances(
  lcd: LCDClient,
  tokenAddress: string,
  owners: string[],
  height?: number
) {
  const total = owners.length;
  let count = 0;
  let accountsWithBalances: AccountWithBalance[] = [];

  for (const owner of owners) {
    const response: Cw20BalanceResponse = await retry(
      lcd.wasm.contractQuery(
        tokenAddress,
        {
          balance: {
            address: owner,
          },
        },
        {
          height: height?.toString(),
        }
      )
    );

    accountsWithBalances.push({
      address: owner,
      balance: Number(response.balance),
    });

    count += 1;
    console.log(`[${count}/${total}] address = ${owner}, balance = ${response.balance}`);
  }

  // remove all accounts with zero balances
  accountsWithBalances = accountsWithBalances.filter((account) => account.balance > 0);

  // sort accounts descedingly based on balance
  accountsWithBalances.sort((a, b) => {
    if (a.balance > b.balance) {
      return -1;
    } else if (a.balance < b.balance) {
      return 1;
    } else {
      return 0;
    }
  });

  return accountsWithBalances;
}
