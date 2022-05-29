import { Flipside, Query } from "@flipsidecrypto/sdk";
import * as constants from "./constants";
import * as fs from "fs";
import * as path from "path";

// Initialize `Flipside` with your API key
const flipside = new Flipside(
  "",
  "https://node-api.flipsidecrypto.com"
);

const START_HEIGHT = 6531019;

async function getAllUnstakers() {
    const query: Query = {
        sql: `
            select * from terra.event_actions
                where action_contract_address = '${constants.MARS_STAKING}'
                and block_id between ${START_HEIGHT} and ${constants.POST_ATTACK_HEIGHT} 
                and action_method = 'unstake'
            `
    };
    const result = await flipside.query.run(query);
    return result.records!.map(r => (r['action_log'] as any)['staker']);
}

(async function () {
    const unstakers = await getAllUnstakers();
    console.log(`done! number of unstakers: ${unstakers.length}`);
  
    unstakers.sort((a, b) => {
      if (a < b) {
        return -1;
      } else if (a > b) {
        return 1;
      } else {
        return 0;
      }
    });
  
    fs.writeFileSync(
      path.join(__dirname, "../data/xmars_unstakers.json"),
      JSON.stringify(unstakers, null, 2)
    );
  })();