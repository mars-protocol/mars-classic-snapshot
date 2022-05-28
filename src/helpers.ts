export function encodeBase64(obj: object | string | number) {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

export function decodeBase64<T>(str: string): T {
  return JSON.parse(Buffer.from(str, "base64").toString("utf8"));
}
