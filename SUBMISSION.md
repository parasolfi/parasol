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
- **0G Compute** — the broker's inference. Two integration paths wired:
  1. Compute Router (OpenAI-compatible, `ZG_ROUTER_API_KEY`)
  2. Direct compute SDK (`@0gfoundation/0g-compute-ts-sdk`): wallet-signed requests to a live
     testnet provider (`qwen/qwen2.5-omni-7b` at `0xa48f…7836`), settled on-chain. Ledger flow
     validated end-to-end on a Galileo fork (see `scripts/test-zg-fork-rehearsal.mjs`); the
     provider's account check against the real chain is the exact boundary that makes the
     inference proof unfakeable.
- **0G Chain (Galileo)** — `PolicyRegistry`: the agent's wallet writes issuance, resolution and
  payout attestations for every policy. Non-custodial split: the client's keys move money (on
  Polygon), the agent's key moves only attestations (on 0G).
- Roadmap (not shipped): 0G Storage for encrypted risk profiles, Agentic ID (ERC-7857) for the
  broker's identity.

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
