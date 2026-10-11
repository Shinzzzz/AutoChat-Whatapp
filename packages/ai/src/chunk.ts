/**
 * Split a knowledge document into retrieval-sized chunks. Processes line by
 * line: markdown heading lines start a new section and are kept as a prefix on
 * each chunk for context; body lines pack up to ~`maxChars`.
 */
export function chunkText(content: string, maxChars = 900): string[] {
  const lines = content.split(/\r?\n/);
  const chunks: string[] = [];
  let heading = "";
  let buf = "";

  const flush = () => {
    const text = buf.trim();
    if (text) chunks.push(heading ? `${heading}\n${text}` : text);
    buf = "";
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (/^#{1,6}\s/.test(line)) {
      flush();
      heading = line.replace(/^#{1,6}\s/, "").trim();
      continue;
    }
    if (line === "") {
      if (buf.length >= maxChars) flush();
      continue;
    }
    if (buf.length + line.length + 1 > maxChars) flush();
    buf += (buf ? "\n" : "") + line;
  }
  flush();
  return chunks;
}
