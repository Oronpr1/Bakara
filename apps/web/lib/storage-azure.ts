import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import type { FileStore } from "./storage";

/**
 * Azure Blob store in the college's own subscription. Signs in with the app's managed
 * identity (no keys), and refuses to overwrite an existing blob so versions stay frozen.
 * Pair with blob versioning and an immutability policy on the container for full protection.
 */
export class AzureBlobFileStore implements FileStore {
  private container: ContainerClient;

  constructor(accountUrl: string, containerName: string) {
    this.container = new BlobServiceClient(accountUrl, new DefaultAzureCredential()).getContainerClient(containerName);
  }

  async put(key: string, bytes: Uint8Array, contentType: string) {
    await this.container.getBlockBlobClient(key).uploadData(bytes, {
      blobHTTPHeaders: { blobContentType: contentType },
      conditions: { ifNoneMatch: "*" },
    });
  }

  async get(key: string) {
    return new Uint8Array(await this.container.getBlockBlobClient(key).downloadToBuffer());
  }
}
