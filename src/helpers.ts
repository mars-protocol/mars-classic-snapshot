import axios from "axios";
import axiosRetry from "axios-retry";

axiosRetry(axios);

export async function isContract(restUrl: string, address: string) {
  try {
    await axios.get<unknown>(`${restUrl}/terra/wasm/v1beta1/contracts/${address}`);
    return true;
  } catch {
    return false;
  }
}

export function sumArrayOfNumbers(numbers: number[]) {
  return numbers.reduce((partialSum, a) => partialSum + a, 0);
}

export function encodeBase64(obj: object | string | number) {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

export function decodeBase64<T>(str: string): T {
  return JSON.parse(Buffer.from(str, "base64").toString("utf8"));
}
