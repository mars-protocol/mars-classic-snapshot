//--------------------------------------------------------------------------------------------------
// cosmos basic types
//--------------------------------------------------------------------------------------------------

export interface TxsResponse {
  tx: {
    body: {
      messages: [
        {
          sender?: string;
        }
      ];
    };
  };
}

//--------------------------------------------------------------------------------------------------
// wasm module types
//--------------------------------------------------------------------------------------------------

export type WasmSmartQueryResponse<T> = {
  query_result: T;
};

export type WasmRawQueryResponse = {
  data: string;
};

export type MultiQueryResponse = {
  success: boolean;
  data: string;
}[];

//--------------------------------------------------------------------------------------------------
// cw20 types
//--------------------------------------------------------------------------------------------------

export type Cw20TokenInfoResponse = {
  name: string;
  symbol: string;
  decimals: number;
  total_supply: string;
};

export type Cw20AllAccountsResponse = {
  accounts: string[];
};

export type Cw20BalanceResponse = {
  balance: string;
};

//--------------------------------------------------------------------------------------------------
// mars protocol types
//--------------------------------------------------------------------------------------------------

// Mars staking
export type ClaimResponse = {
  claim?: {
    created_at_block: number;
    cooldown_end_timestamp: number;
    amount: string;
  };
};

// Mars council
export interface ProposalsResponse {
  proposal_count: number;
  proposal_list: {
    submitter_address: string;
    status: "active" | "passed" | "rejected" | "executed";
    deposit_amount: string;
  }[];
}

// Mars auction (i.e. lockdrop phase 2)
export type UserInfoResponse = {
  mars_deposited: string;
  ust_deposited: string;
  ust_withdrawn_flag: boolean;
  lp_shares: string;
  withdrawn_lp_shares: string;
  withdrawable_lp_shares: string;
  total_auction_incentives: string;
  withdrawn_auction_incentives: string;
  withdrawable_auction_incentives: string;
  mars_reward_index: string;
  withdrawable_mars_incentives: string;
  withdrawn_mars_incentives: string;
  astro_reward_index: string;
  withdrawable_astro_incentives: string;
  withdrawn_astro_incentives: string;
};

//--------------------------------------------------------------------------------------------------
// astroport types
//--------------------------------------------------------------------------------------------------

// Astro generator
export type PendingTokenResponse = {
  pending: string;
  pending_on_proxy: string;
};

//--------------------------------------------------------------------------------------------------
// apollo types
//--------------------------------------------------------------------------------------------------

export type ApolloUserInfo = {
  shares: string;
};

export type ApolloStategyInfoResponse = {
  global_index: string;
  total_bond_amount: string;
  total_shares: string;
};

//--------------------------------------------------------------------------------------------------
// spectrum types
//--------------------------------------------------------------------------------------------------

// Spectrum token-UST farm
export interface RewardInfoResponse {
  staker_addr: string;
  reward_infos: {
    bond_amount: string;
  }[];
}

//--------------------------------------------------------------------------------------------------
// output types
//--------------------------------------------------------------------------------------------------

export type AccountWithBalance = {
  address: string;
  balance: number;
};

export type AccountWithBalanceAndReward = {
  address: string;
  balance: number;
  pendingReward: number;
};
