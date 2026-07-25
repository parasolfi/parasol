# Parasol — projet

> Titre de travail. ETHGlobal Lisbon 2026 — projet neuf, ~36h.
> **Design v2 (décidé 25/07 au soir, après feedback mentor) : courtier agentique non-custodial
> au-dessus de la liquidité Polymarket.** Stack : **0G Compute + The Graph + ENS**, argent sur
> **Polygon** (contrats Polymarket). Uniswap : sorti. Le modèle v1 (AMM/LP) est archivé en §9.
> **La spec technique qui fait foi : `SPEC.md`.**

---

## 0. TL;DR — le modèle

Les prediction markets sont déjà de l'assurance paramétrique — il leur manque le courtier.
Polymarket price la proba qu'il fasse ≥ 32°C à Madrid demain (marchés météo quotidiens en
buckets, vraie liquidité, résolution automatique). **Parasol est la couche de traduction** : un
agent (inférence **0G Compute**, TEE) profile une boîte via un questionnaire, traduit son
exposition en un panier de positions YES sur les buckets au-dessus de son seuil de douleur, et
le client exécute **avec son propre wallet**. Prime = proba implicite × payout — pricée par le
marché, pas par un modèle maison.

Histoire démo : *un organisateur d'événements à Madrid se couvre contre la canicule de demain* —
et les marchés quotidiens résolvent pendant le hackathon : achat samedi, payout réel dimanche.

## 1. Le principe

**« Tes clés bougent ton argent. La clé de l'agent ne bouge que ses attestations. »**

- **Client** (EOA MetaMask, signatureType 0, aucun proxy) : approvals, wrap pUSD, ordres CLOB,
  redeem. Parasol ne touche jamais les fonds.
- **Agent** (wallet 0G) : inférence sur 0G Compute Router + écritures dans `PolicyRegistry`
  (0G Galileo) — émission, résolution observée, payout constaté.
- Pitch : inférence privée (TEE, le profil financier de la boîte ne sort pas en clair) +
  exécution non-custodiale = un courtier auquel on ne confie rien.

## 2. Le flow v2

```
catalogue   : Gamma API (events météo live) — le LLM choisit dedans, n'invente jamais
questionnaire → agent (0G Router) → { eventId, seuil, payout } (JSON validé)
panier (code pur) : N parts YES par bucket ≥ seuil (tail préféré = 1 ordre) ; prime = N × Σ ask
souscription : client signe EIP-712 (domaine NegRiskCtfExchangeV2), GTC au best ask
émission    : agent → PolicyRegistry.issue() sur Galileo (+ ENS text records, stretch)
résolution J+1 : watcher (subgraph) → setStatus ; client redeem CTF ; agent → Paid
```

Fallback si geoblock au venue : mode fork Polygon (impersonation de holders réels, prix live
mainnet, re-fork chaque matin) — UX client identique, annoncé honnêtement. Cf. `SPEC.md` §10.

## 3. Les sponsors — chacun natif, aucun bolté

- **0G — $6k (Best AI Product)** : le cerveau. Inférence du questionnaire sur le Compute Router
  (OpenAI-compatible), `PolicyRegistry` déployé sur Galileo (remplit « contract deployment
  addresses »), preuve d'inférence = débits on-chain du contrat de paiement. Stretch : profil
  chiffré sur 0G Storage. Coupé : Agentic ID (ERC-7857 draft, pré-audit).
- **The Graph — $3k** : les yeux. Fork des subgraphs open source Polymarket (resolution +
  orderbook) déployé sur Studio, consommé réellement par le watcher et le catalogue. Stretch :
  vue normalisée `CoverMarket`.
- **ENS — $1.5k (stretch, booth dimanche)** : un nom par police
  (`madrid-heat-0726.parasol.eth`) + text records → registry 0G.

## 4. Ce qui carry / ce qui meurt

- **Carry** : le savoir CTF du POC (`poc/` — Polymarket tourne sur le même ConditionalTokens
  `0x4D97…6045`), le front Nuxt (`parasol/` — le QuoteCard devient l'écran de quote réel),
  le fork Polygon sans clé RPC.
- **Meurt** : pool Uniswap v4, Trading API, FreezeHook, MiniAMM, tout le modèle assureur=LP.

## 5. Pièges connus (vérifiés contre les sources le 25/07)

1. **CLOB v2 uniquement** : les SDK v1 sont morts depuis le 28/04/2026, sans rétro-compat —
   seul `@polymarket/clob-client-v2` est autorisé dans le repo.
2. **Marchés météo = negRisk** : ordres signés contre `NegRiskCtfExchangeV2`, jamais l'exchange
   standard ; adapter v1 (`0xd91E…`) déprécié, interdit pour le redeem.
3. **Collatéral = pUSD** (wrap USDC.e via CollateralOnramp), plus l'USDC.e direct.
4. **0G Galileo** : chain 16602, `evm_version = "cancun"` obligatoire, faucet 0.1 0G/jour/wallet.
5. **Geoblock** : ordres bloqués dans 33 juridictions ; test au venue à H0, jamais de VPN.
6. Adresses complètes et confirmées : `SPEC.md` §5.

## 6. Plan (~30h) — 4 pistes parallèles

- **Gate 0 (ce soir, bloquant)** : faucet Galileo · POL + USDC.e wallet démo · geoblock check →
  fige le mode · première inférence Router · check attestation TEE · heures réelles de
  finalisation des marchés d'hier.
- **A — Marchés & exécution** (12 h) : catalogue Gamma → moteur panier → jambe CLOB → mode fork.
- **B — Agent & 0G** (7 h) : Router + schéma → PolicyRegistry → watcher résolution.
- **C — Subgraph** (3-5 h) : fork resolution-subgraph → Studio (+ CoverMarket si gate passée).
- **D — Front & livrables** (9 h) : écrans → déploiement public → e2e → polices J-1 → vidéo →
  soumissions.

Coupes dans l'ordre : Storage → ENS → CoverMarket → fork réduit au chemin démo. Jamais coupé :
piste B, la jambe d'exécution, le déploiement public. Démo : deux polices J-1 pré-émises cette
nuit (une quasi certaine de payer, une incertaine) — le script ne dépend jamais d'une résolution
en direct. Détail : `SPEC.md` §11-13.

## 7. Décisions prises

1. Non-custodial **variante A** (EOA direct) ; variante B (session key) en stretch lointain.
2. Agentic ID coupé (roadmap README). 3. Subgraph minimal par défaut, vue riche en stretch.
4. Persona démo : organisateur d'événements, Madrid (marché température quotidien, ~$32K vol).
5. Le pitch ne claim que ce que l'endpoint prouve (TEE vérifiée à H0, deux versions du close).

## 8. Ouvertes

1. Adresse **NegRiskAdapter v2** pour le redeem (page Contracts + test sur fork).
2. Geoblock du venue (décide réel vs fork à H0).
3. ENS : selon booth dimanche matin.

## 9. Historique — v1 archivée

v1 (jusqu'au 25/07) : assurance paramétrique en modèle AMM — assureurs = LP d'une pool Uniswap
v4 `wYES/USDC`, user = swap, keeper bornant le prix, CTF Gnosis wrappé ERC-20. POC construit et
testé (`poc/` : forge 4/4, e2e viem 8/8). Abandonné : fragmentation de la liquidité par
événement, cold-start par pool, narration jugée artificielle par les mentors. Le POC reste la
référence CTF (split/redeem — même contrat de base que Polymarket).
