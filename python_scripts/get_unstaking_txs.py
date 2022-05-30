import requests
import json
import base64
import numpy as np
import pandas as pd


def get_Staking_Claims_txs( debug=True):

    offset = 0    
    staking_address = "terra1y8wwr5q24msk55x9smwn0ptyt24fxpwm4l7tjl"
    xmars_address = "terra1a04v570f9cxp49mk06vjsm8axsswndpwwt67k4"
    staking_txs = pd.DataFrame([], columns = ['TxHash','Block Height','User Address','MARS Claimed','MARS Claimable'])

    while(1):
        URL = "https://fcd.terra.dev/v1/txs?offset=" + str(offset) + "&account=" + staking_address + "&limit=100"
        response = requests.get(url = URL).json()

        for tx in response['txs']:
            txhash = tx['txhash']
            block_height = tx['height']

            MARS_claimed = 0
            MARS_claimable = 0
            
            # IF TX FAILED // EXCEEDS BLOCK HEIGHT
            if not tx.get('logs'):
                continue

            # PROCESS MSGs
            msg_number = 0

            for msg in tx['tx']['value']['msg']:
                if msg['type'] == "wasm/MsgExecuteContract":
                    sender =  msg['value']['sender']
                    coins = msg['value']['coins']
                    contract = msg['value']['contract']


                    if type(msg['value']['execute_msg']).__name__ == "dict" :
                        decodedMsg =   json.loads ( json.dumps(msg['value']['execute_msg']) )
                    else:
                        decodedMsg = json.loads( base64.b64decode(msg['value']['execute_msg']).decode("utf-8") )
                    
                    # Claim MARS
                    if decodedMsg.get('claim')!=None and contract == staking_address:
                        events = tx['logs'][msg_number]['events']
                        for event in events:
                            if event['type'] == "from_contract":
                                for attribute in event['attributes']:
                                    if attribute['key'] == 'mars_claimed':
                                        MARS_claimed = MARS_claimed + int(attribute['value'])
                        print(f" {txhash} send: MARS Claimed  = {MARS_claimed}  ")

                    # BURN xMARS : Lockdown begins
                    elif decodedMsg.get('send')!=None and decodedMsg['send']['contract'] == staking_address and contract == xmars_address:
                        events = tx['logs'][msg_number]['events']
                        for event in events:
                            if event['type'] == "from_contract":
                                for attribute in event['attributes']:
                                    if attribute['key'] == 'mars_claimable':
                                        MARS_claimable = MARS_claimable + int(attribute['value'])
                                        break
                        print(f" {txhash} send: MARS Claimable  = {MARS_claimable}  ")
                    
                    
            if MARS_claimable > 0 or MARS_claimed > 0:
                staking_txs.loc[len(staking_txs.index)] = [txhash,block_height,sender,MARS_claimed,MARS_claimable]
                staking_txs.to_csv(f'./mars_staking_txs.csv', index=False)

        if response.get("next"):
            offset = int(response["next"])
        else:
            break

        staking_txs.to_csv(f'./mars_staking_txs.csv', index=False)

    if debug:
        print(f"SUCCESSFULLY SAVED TO mars_staking_txs.csv")



get_Staking_Claims_txs()