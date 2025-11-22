import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import * as dotenv from "dotenv";

dotenv.config();

let s3Client: S3Client | null = null;

function getClient(): S3Client {
  if (s3Client) return s3Client;
  
  s3Client = new S3Client({
    region: process.env.AWS_REGION || "eu-central-1", // Update default or respect env
    // Omitted credentials to allow use of AWS_PROFILE and default provider chain
  });
  return s3Client;
}

export async function uploadToS3(bucket: string, key: string, body: string | Buffer, contentType: string = "text/plain") {
  try {
    const client = getClient();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    });
    await client.send(command);
    console.log(`Successfully uploaded ${key} to ${bucket}`);
  } catch (error) {
    console.error(`Error uploading to S3: ${error}`);
    throw error;
  }
}
