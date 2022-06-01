import requests
import json
import base64
import numpy as np
import pandas as pd


def getApolloCompounderTxs(debug=True):
    offset = 0
    apollo_entry_address = "terra1g7jjjkt5uvkjeyhp8ecdz4e4hvtn83sud3tmh2"
    apollo_mars_ust_address = "terra1au5kxqz46r6qtqqk2nur4wr2yd457zp4fscuzx"
    mars_ust_lp_token = "terra1ww6sqvfgmktp0afcmvg78st6z89x5zr3tmvpss"
    apollocompounder_txs = pd.DataFrame([], columns=['TxHash', 'Block Height', 'User Address', 'LP token deposited', 'LP token Withdrawn'])

    while(1):
        URL = "https://fcd.terra.dev/v1/txs?offset=" + str(offset) + "&account=" + apollo_mars_ust_address + "&limit=100"
        response = requests.get(url=URL).json()
        print(URL)

        for tx in response['txs']:
            txhash = tx['txhash']
            block_height = tx['height']

            lp_deposited = 0
            lp_withdrawn = 0

            # IF TX FAILED // EXCEEDS BLOCK HEIGHT
            if not tx.get('logs'):
                continue

            # PROCESS MSGs
            msg_number = 0
            for msg in tx['tx']['value']['msg']:
                if msg['type'] == "wasm/MsgExecuteContract":
                    sender = msg['value']['sender']
                    contract = msg['value']['contract']

                    if type(msg['value']['execute_msg']).__name__ == "dict":
                        decodedMsg = json.loads(json.dumps(msg['value']['execute_msg']))
                    else:
                        decodedMsg = json.loads(base64.b64decode(msg['value']['execute_msg']).decode("utf-8"))

                    # WITHDRAW LP TOKENS
                    if decodedMsg.get('withdraw_from_strategy') != None and contract == apollo_entry_address:
                        print(txhash)
                        if int(decodedMsg['withdraw_from_strategy']['strategy_id']) == 50:
                            lp_withdrawn = lp_withdrawn + int(decodedMsg['withdraw_from_strategy']['amount'])

                    # DEPOSIT LP TOKENS via ZAP
                    if decodedMsg.get('zap_into_strategy') != None and contract == apollo_entry_address:
                        print(txhash)
                        if int(decodedMsg['zap_into_strategy']['strategy_id']) == 50:
                            events = tx['logs'][msg_number]['events']
                            for event in events:
                                if event['type'] == "from_contract":
                                    for attribute in event['attributes']:
                                        if attribute['key'] == 'share':
                                            lp_deposited = lp_deposited + int(attribute['value'])
                                            print(f"{txhash} lp_deposited = {lp_deposited}")
                                            break

                    # DEPOSIT LP TOKENS (DIRECTLY)
                    elif decodedMsg.get('send') != None and decodedMsg['send']['contract'] == apollo_entry_address and contract == mars_ust_lp_token:
                        print(txhash)
                        lp_deposited = lp_deposited + int(decodedMsg['send']['amount'])
                        print(f"{txhash} lp_deposited = {lp_deposited}")

                    else:
                        pass

                msg_number = msg_number + 1

            if lp_deposited > 0 or lp_withdrawn > 0:
                apollocompounder_txs.loc[len(apollocompounder_txs.index)] = [txhash, block_height, sender, lp_deposited, lp_withdrawn]
                apollocompounder_txs.to_csv(f'./mars_apollocompounder_txs.csv', index=False)

        if response.get("next"):
            offset = int(response["next"])
        else:
            break

        apollocompounder_txs.to_csv(f'./mars_apollocompounder_txs.csv', index=False)

    if debug:
        print(f"SUCCESSFULLY SAVED TO mars_apollocompounder_txs.csv")


getApolloCompounderTxs()
