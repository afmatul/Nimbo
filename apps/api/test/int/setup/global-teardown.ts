export default async function globalTeardown(): Promise<void> {
  await globalThis.nimboTestInfra?.stopAll();
}
