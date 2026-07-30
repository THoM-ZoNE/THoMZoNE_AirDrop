import { prisma } from "../lib/prisma.js";

export async function acquireLock(key: string) {
  try {
    await prisma.jobLock.create({
      data: {
        key,
        lockedAt: new Date()
      }
    });
    return true;
  } catch {
    return false;
  }
}

export async function releaseLock(key: string) {
  await prisma.jobLock.deleteMany({
    where: { key }
  });
}