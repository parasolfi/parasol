import { createCipheriv, randomBytes, createHash } from 'node:crypto'
import { ethers } from 'ethers'
import { MemData, Indexer } from '@0gfoundation/0g-storage-ts-sdk'

const GALILEO_RPC = process.env.ZG_RPC_URL ?? 'https://evmrpc-testnet.0g.ai'
const INDEXER_URL = process.env.ZG_INDEXER_URL ?? 'https://indexer-storage-testnet-turbo.0g.ai'

// The risk profile is a business's financials: encrypted client-side before it
// leaves the process. 0G Storage is content-addressed storage, not a
// confidential environment — plaintext there would be readable by any node.
function profileKey(): Buffer {
  // No literal default: a key committed to the repo encrypts every profile
  // under a secret anyone reading this file already has, which is worse than
  // not uploading at all. Callers only reach here once a key is configured.
  const secret = process.env.ZG_COMPUTE_PRIVATE_KEY ?? process.env.ZG_DEPLOYER_PRIVATE_KEY
  if (!secret) throw new Error('ZG_COMPUTE_PRIVATE_KEY or ZG_DEPLOYER_PRIVATE_KEY required to encrypt a profile')
  return createHash('sha256').update(secret).digest()
}

function encrypt(plaintext: string): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', profileKey(), iv)
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body])
}

export interface StoredProfile {
  rootHash: string
  txHash: string
}

// The SDK waits for the storage node to catch up, which has taken long enough
// to stall issuance and make the whole server look dead to a health check.
// A policy is worth issuing without its profile archived, so the upload is
// bounded and its failure is not the request's failure.
const UPLOAD_TIMEOUT_MS = Number(process.env.ZG_STORAGE_TIMEOUT_MS ?? 20_000)

export async function storeEncryptedProfile(profile: object): Promise<StoredProfile | null> {
  const key = process.env.ZG_COMPUTE_PRIVATE_KEY ?? process.env.ZG_DEPLOYER_PRIVATE_KEY
  if (!key) return null

  const upload = async (): Promise<StoredProfile | null> => {
    const signer = new ethers.Wallet(key, new ethers.JsonRpcProvider(GALILEO_RPC))
    const data = new MemData(new Uint8Array(encrypt(JSON.stringify(profile))))
    const [tree] = await data.merkleTree()
    const rootHash = tree?.rootHash()
    if (!rootHash) return null
    const [tx, err] = await new Indexer(INDEXER_URL).upload(data, GALILEO_RPC, signer)
    if (err) return null
    return { rootHash, txHash: (tx as any)?.txHash ?? '' }
  }

  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => {
      console.warn(`[storage] 0G upload exceeded ${UPLOAD_TIMEOUT_MS}ms — issuing without an archived profile`)
      resolve(null)
    }, UPLOAD_TIMEOUT_MS),
  )

  try {
    return await Promise.race([upload(), timeout])
  } catch {
    return null
  }
}
