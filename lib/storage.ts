import { Files } from "files-sdk";
import { neon } from "files-sdk/neon";

/**
 * Neon Object Storage client for the `uploads` bucket.
 * Automatically reads AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
 * AWS_ENDPOINT_URL_S3, and AWS_REGION from environment variables.
 */
export const storage = new Files({
  adapter: neon({
    bucket: process.env.STORAGE_BUCKET || "uploads",
  }),
});

