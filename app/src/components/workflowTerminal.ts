export interface TerminalChunkPlan {
  gap: boolean;
  skipBytes: number;
  nextOffset: number;
}

export function planTerminalChunk(
  currentOffset: number,
  chunkOffset: number,
  chunkLength: number,
): TerminalChunkPlan {
  const chunkEnd = chunkOffset + chunkLength;
  if (chunkEnd <= currentOffset) {
    return { gap: false, skipBytes: chunkLength, nextOffset: currentOffset };
  }
  if (chunkOffset > currentOffset) {
    return { gap: true, skipBytes: 0, nextOffset: currentOffset };
  }
  return {
    gap: false,
    skipBytes: Math.max(0, currentOffset - chunkOffset),
    nextOffset: chunkEnd,
  };
}
