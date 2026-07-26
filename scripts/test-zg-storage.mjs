import { createCipheriv, randomBytes, createHash } from 'node:crypto'
import { ethers } from 'ethers'
import { MemData, Indexer } from '@0gfoundation/0g-storage-ts-sdk'

const RPC = 'https://evmrpc-testnet.0g.ai'
const INDEXER = 'https://indexer-storage-testnet-turbo.0g.ai'

const key = createHash('sha256').update(process.env.ZG_COMPUTE_PRIVATE_KEY).digest()
const iv = randomBytes(12)
const cipher = createCipheriv('aes-256-gcm', key, iv)
const payload = JSON.stringify({ holder: '0xdemo', profile: 'icecream seller, Madrid, 33C', premium: 22 })
const blob = Buffer.concat([iv, Buffer.alloc(0), cipher.update(payload, 'utf8'), cipher.final(), cipher.getAuthTag()])
console.log('blob chiffré:', blob.length, 'octets')

const signer = new ethers.Wallet(process.env.ZG_COMPUTE_PRIVATE_KEY, new ethers.JsonRpcProvider(RPC))
const data = new MemData(new Uint8Array(blob))
const [tree] = await data.merkleTree()
console.log('rootHash:', tree.rootHash())

const [tx, err] = await new Indexer(INDEXER).upload(data, RPC, signer)
if (err) {
  console.log('ECHEC upload:', String(err).slice(0, 200))
  process.exit(1)
}
console.log('upload OK, txHash:', tx?.txHash ?? JSON.stringify(tx).slice(0, 120))
