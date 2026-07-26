# Dossier de soumission — à coller dans le formulaire

## Project name
Parasol

## Short description
An AI broker that turns prediction markets into parametric insurance. The agent interviews a
business owner, structures a cover basket on live Polymarket weather markets, executes it into the
client's own wallet (non-custodial), and attests every policy on 0G. Premium = market odds ×
payout. No claim, no adjuster, no custody.

## Contract deployment addresses
- PolicyRegistry — 0G Galileo (16602): `0x504C64EBb9816AA9238404244fC8849d849B5A6e`
  https://chainscan-galileo.0g.ai/address/0x504C64EBb9816AA9238404244fC8849d849B5A6e
- First live attestation tx: `0xca3e654620159f8f3f9d52189232ab991e78587136f525eb8a7ed6f66b098e74`

## Public GitHub repo
https://github.com/parasolfi/parasol (branch `feat/broker-v2`, PR #1)

## Live demo link
https://presence-brussels-enhance-stays.trycloudflare.com/cover
(tunnel depuis la machine démo — regénérer l'URL au matin si le laptop a redémarré,
et la mettre à jour ici + dans le formulaire)

## Demo video
_À enregistrer — script dans `VIDEO.md`, < 3 min._

## 0G features used
- **0G Compute** — the broker's inference, running live. Two paths wired: the Compute Router
  (`ZG_ROUTER_API_KEY`) and the direct SDK broker (`@0gfoundation/0g-compute-ts-sdk`) —
  wallet-signed requests to provider `0xa48f…7836` (`qwen/qwen2.5-omni-7b`), ledger funded on
  Galileo, settled on-chain per call. The provider verifies the account against the real chain,
  which is what makes the inference proof unfakeable (see
  `scripts/test-zg-fork-rehearsal.mjs`: the same flow on a fork is refused).
- **0G Storage** — the client's risk profile (their revenue exposure, thresholds, losses) is
  AES-256-GCM encrypted in-process and uploaded via `@0gfoundation/0g-storage-ts-sdk`; only the
  root hash leaves. Example: root `0xa7730771f24e026261c1d9c4e5598d3a15aac31302ec48508794a3b4bb0fe4d1`,
  upload tx `0xf33147b4754c74db1d6fb56713434798db4914dcef57fc1003eb602b182dd158`.
- **0G Chain (Galileo)** — `PolicyRegistry`: the agent's wallet attests issuance, resolution and
  payout, committing to the 0G Storage root hash. Non-custodial split: the client's key
  authorizes and holds (Polygon), the agent's key only attests (0G).
- Roadmap (not shipped): Agentic ID (ERC-7857) for the broker's identity — the reference
  implementation is still a draft branch and pre-audit per 0G's own docs.

## Team
- _Noms + Telegram + X à remplir_

## Notes for judges
- Weather is the demo, not the product: anything a public source can settle and a prediction
  market can price is insurable the same way.
- Geoblock note: order placement on Polymarket is geo-restricted; the demo settles on an Anvil
  fork of Polygon with the exact clobTokenIds at live CLOB prices, delivered by impersonating
  live holders. Markets, prices and resolutions are all real mainnet data.
- The Graph: standardized prediction-market subgraphs (Polymarket + Azuro) and on-demand venue
  adapters (Polymarket, Azuro, Kalshi) feed the catalog — see the `subgraphs/` and `adapters/`
  trees and the `feat/graph-indexer` branch.
