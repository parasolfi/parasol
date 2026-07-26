import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'
import { ethers } from 'ethers'
import { MemData, Indexer } from '@0gfoundation/0g-storage-ts-sdk'

const GALILEO_RPC = process.env.ZG_RPC_URL ?? 'https://evmrpc-testnet.0g.ai'
const INDEXER_URL = process.env.ZG_INDEXER_URL ?? 'https://indexer-storage-testnet-turbo.0g.ai'

// The risk profile is a business's financials: encrypted client-side before it
// leaves the process. 0G Storage is content-addressed storage, not a
// confidential environment — plaintext there would be readable by any node.
function profileKey(): Buffer {
  const secret = process.env.ZG_COMPUTE_PRIVATE_KEY ?? process.env.ZG_DEPLOYER_PRIVATE_KEY ?? 'parasol-dev'
  return createHash('sha256').update(secret).digest()
}

function encrypt(plaintext: string): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', profileKey(), iv)
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body])
}

export function decryptProfile(blob: Buffer): string {
  const decipher = createDecipheriv('aes-256-gcm', profileKey(), blob.subarray(0, 12))
  decipher.setAuthTag(blob.subarray(12, 28))
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]).toString('utf8')
}

export interface StoredProfile {
  rootHash: string
  txHash: string
}

export async function storeEncryptedProfile(profile: object): Promise<StoredProfile | null> {
  const key = process.env.ZG_COMPUTE_PRIVATE_KEY ?? process.env.ZG_DEPLOYER_PRIVATE_KEY
  if (!key) return null
  try {
    const signer = new ethers.Wallet(key, new ethers.JsonRpcProvider(GALILEO_RPC))
    const data = new MemData(new Uint8Array(encrypt(JSON.stringify(profile))))
    const [tree] = await data.merkleTree()
    const rootHash = tree?.rootHash()
    if (!rootHash) return null
    const [tx, err] = await new Indexer(INDEXER_URL).upload(data, GALILEO_RPC, signer)
    if (err) return null
    return { rootHash, txHash: (tx as any)?.txHash ?? '' }
  } catch {
    return null
  }
}
