import requests
import json
import base64
import numpy as np
import pandas as pd


def getSpecCompounderTxs(debug=True):
    offset = 0
    spec_entry_address = "terra1mwnu40j5q8c42kv59kqx0u2peyku94564wwhvd"
    spec_mars_ust_address = "terra1d55nmhuq75r3vf93hwkau2stts4mpe9h22herz"
    mars_ust_lp_token = "terra1ww6sqvfgmktp0afcmvg78st6z89x5zr3tmvpss"
    mars_speccompounder_txs = pd.DataFrame([], columns=['TxHash', 'Block Height', 'User Address', 'LP token deposited', 'LP token Withdrawn'])

    while(1):
        URL = "https://fcd.terra.dev/v1/txs?offset=" + str(offset) + "&account=" + spec_mars_ust_address + "&limit=100"
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
                    if decodedMsg.get('unbond') != None and contract == spec_mars_ust_address:
                        lp_withdrawn = lp_withdrawn + int(decodedMsg['unbond']['amount'])
                        print(f"{txhash} lp_withdrawn = {lp_withdrawn}")

                    # DEPOSIT LP TOKENS via ZAP
                    elif decodedMsg.get('zap_to_bond') != None and contract == spec_entry_address:
                        if decodedMsg['zap_to_bond']['contract'] == spec_mars_ust_address:
                            events = tx['logs'][msg_number]['events']
                            for event in events:
                                if event['type'] == "from_contract":
                                    for attribute in event['attributes']:
                                        if attribute['key'] == 'share':
                                            lp_deposited = lp_deposited + int(attribute['value'])
                                            print(f"{txhash} lp_deposited = {lp_deposited}")
                                            break

                    # DEPOSIT LP TOKENS
                    elif decodedMsg.get('bond') != None and contract == spec_entry_address:
                        if decodedMsg['bond']['contract'] == spec_mars_ust_address:
                            events = tx['logs'][msg_number]['events']
                            for event in events:
                                if event['type'] == "from_contract":
                                    for attribute in event['attributes']:
                                        if attribute['key'] == 'share':
                                            lp_deposited = lp_deposited + int(attribute['value'])
                                            print(f"{txhash} lp_deposited = {lp_deposited}")
                                            break

                    # DEPOSIT LP TOKENS (DIRECTLY)
                    elif decodedMsg.get('send') != None and decodedMsg['send']['contract'] == spec_mars_ust_address and contract == mars_ust_lp_token:
                        lp_deposited = lp_deposited + int(decodedMsg['send']['amount'])
                        print(f"{txhash} lp_deposited = {lp_deposited}")

                    else:
                        if decodedMsg.get('withdraw') != None or decodedMsg.get('mint') != None or decodedMsg.get('compound') != None or decodedMsg.get('increase_allowance') != None:
                            pass
                        else:
                            print(txhash)
                            print(decodedMsg)
                            print("\n")
                            pass

                msg_number = msg_number + 1

            if lp_deposited > 0 or lp_withdrawn > 0:
                mars_speccompounder_txs.loc[len(mars_speccompounder_txs.index)] = [txhash, block_height, sender, lp_deposited, lp_withdrawn]
                mars_speccompounder_txs.to_csv(f'./mars_speccompounder_txs.csv', index=False)

        if response.get("next"):
            offset = int(response["next"])
        else:
            break

        mars_speccompounder_txs.to_csv(f'./mars_speccompounder_txs.csv', index=False)

    if debug:
        print(f"SUCCESSFULLY SAVED TO mars_speccompounder_txs.csv")


getSpecCompounderTxs()
