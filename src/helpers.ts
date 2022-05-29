export function encodeBase64(obj: object | string | number) {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

export function decodeBase64(str: string) {
  return Buffer.from(str, "base64").toString("utf8");
}

export function decodeBase64IntoObject<T>(str: string): T {
  return JSON.parse(decodeBase64(str));
}
