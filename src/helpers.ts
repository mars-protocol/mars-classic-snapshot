export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(
  callback: Promise<T>,
  sleepTime = 30000,
  incrementalSleepTime = 30000
): Promise<T> {
  try {
    return await callback;
  } catch (err) {
    console.log(err);
    console.log(`contract query failed! retrying in ${sleepTime} ms...`);
    await sleep(sleepTime);
    return await retry(callback, sleepTime + incrementalSleepTime);
  }
}
