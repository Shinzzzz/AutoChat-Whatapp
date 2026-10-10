import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getEnv } from "./env.js";

/**
 * Object storage with two backends: AWS S3 when `S3_BUCKET` is set, otherwise the
 * local filesystem (dev). Stored objects are served back through the app's
 * `/api/files/[...key]` route, so callers get a stable URL that never expires.
 *
 * Imported via the subpath `@autochat/core/storage` (not re-exported from the
 * package index) so the AWS SDK never leaks into client bundles.
 */

export interface StoredObject {
  body: Buffer;
  contentType: string;
}

const LOCAL_DIR = process.env.UPLOADS_DIR || join(process.cwd(), ".uploads");

function useS3(): boolean {
  return !!getEnv().S3_BUCKET;
}

export async function putObject(
  key: string,
  body: Buffer | string,
  contentType = "application/octet-stream",
): Promise<string> {
  const buf = typeof body === "string" ? Buffer.from(body) : body;
  if (useS3()) {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const env = getEnv();
    const s3 = new S3Client({ region: env.AWS_REGION });
    await s3.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET!,
        Key: key,
        Body: buf,
        ContentType: contentType,
      }),
    );
  } else {
    const path = join(LOCAL_DIR, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, buf);
    await writeFile(`${path}.meta`, contentType);
  }
  return fileUrl(key);
}

export async function getObject(key: string): Promise<StoredObject | null> {
  if (useS3()) {
    try {
      const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
      const env = getEnv();
      const s3 = new S3Client({ region: env.AWS_REGION });
      const res = await s3.send(
        new GetObjectCommand({ Bucket: env.S3_BUCKET!, Key: key }),
      );
      const body = Buffer.from(await res.Body!.transformToByteArray());
      return { body, contentType: res.ContentType ?? "application/octet-stream" };
    } catch {
      return null;
    }
  }
  try {
    const path = join(LOCAL_DIR, key);
    const body = await readFile(path);
    let contentType = "application/octet-stream";
    try {
      contentType = (await readFile(`${path}.meta`, "utf8")).trim();
    } catch {
      /* no meta */
    }
    return { body, contentType };
  } catch {
    return null;
  }
}

/** Stable app URL for a stored object. */
export function fileUrl(key: string): string {
  const base = getEnv().PUBLIC_BASE_URL.replace(/\/$/, "");
  return `${base}/api/files/${key}`;
}
