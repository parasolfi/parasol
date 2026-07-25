# Parasol v2 — Spec technique : exécution non-custodiale (variante A)

> ETHGlobal Lisbon 2026. Remplace le modèle AMM/LP d'`PROJECT.md` (archivé §15).
> **Parasol = courtier agentique au-dessus de la liquidité Polymarket.** L'agent (inférence 0G
> Compute) profile une boîte, structure un panier de couverture sur les marchés météo quotidiens
> de Polymarket, et le client exécute **avec son propre wallet** — Parasol ne touche jamais les fonds.
> Tracks : **0G "Best AI Product" $6k + The Graph $3k + ENS $1.5k**. Uniswap : sorti.
> v1.1 — passée en revue adversariale (fact-check sources + attaque du flow) le 25/07 au soir.

---

## 0. Principe directeur

**« Tes clés bougent ton argent. La clé de l'agent ne bouge que ses attestations. »**

- Le **client signe tout ce qui touche l'argent** (Polygon) : approvals, wrap, ordres CLOB, claim.
- L'**agent signe tout ce qui touche le dossier** (0G Chain) : émission de police, résolution
  observée, payout constaté — dans `PolicyRegistry`, avec son propre wallet 0G.
- Pitch : inférence privée (TEE) + exécution non-custodiale = un courtier auquel on ne confie rien.

## 1. Périmètre

**In scope (cœur)** : agent questionnaire (0G Compute Router) · catalogue de couvertures ·
moteur de panier déterministe · exécution non-custodiale EOA (signatureType 0) ·
`PolicyRegistry` sur 0G Galileo · watcher de résolution · subgraph The Graph (fork Polymarket,
version minimale par défaut) · front Nuxt branché + **déployé publiquement** (requirement
« live demo link » du track 0G).

**Stretch (dans l'ordre, gate : e2e cœur vert)** : vue `CoverMarket` enrichie du subgraph →
ENS par police → 0G Storage (profil chiffré) → variante B (session key).

**Out (roadmap README uniquement)** : Agentic ID (ERC-7857 draft, pré-audit, pas de factory
canonique) · onramp fiat · multi-venues (Kalshi) · toute la jambe Uniswap v4.

## 2. Architecture

```
[Front Nuxt + wagmi/viem]  ← le wallet client (MetaMask, EOA) vit ici
   │ chat questionnaire            │ signatures EIP-712 + tx Polygon
   ▼                               ▼
[Backend Node (Nuxt server routes)]
   ├── catalogue   → Gamma API (events météo live) rafraîchi ~5 min   [source de vérité]
   ├── /api/agent  → 0G Compute Router (HTTPS, OpenAI SDK)            [cerveau]
   ├── /api/quote  → CLOB books + getClobMarketInfo (lecture publique)[prix]
   ├── /api/graph  → subgraph The Graph (résolution)                  [yeux data]
   ├── /api/clob/* → proxy CORS vers clob.polymarket.com              [relais ordres SIGNÉS]
   ├── watcher     → cron résolution → PolicyRegistry.setStatus       [non-surveillé, nuit]
   └── wallet agent 0G → PolicyRegistry (Galileo)                     [attestations]
```

Le backend **ne détient aucune clé Polygon**. Il construit des ordres non signés, le navigateur
les fait signer par le wallet, le backend ne fait que relayer le résultat signé (proxy CORS).
Les creds API L2 du client (HMAC) sont conservés **côté navigateur** (session) et joints par
requête ; ils ne permettent pas de créer un ordre valide sans la signature EIP-712 du client.

**⚠ Règle absolue CLOB v2** : depuis le 28/04/2026, les SDK v1 (`@polymarket/clob-client`,
`py-clob-client`) **ne fonctionnent plus en production, sans rétro-compatibilité**. Tout tutoriel
ou exemple trouvé en ligne qui importe ces paquets est mort. Seul `@polymarket/clob-client-v2`
est autorisé dans le repo (à greper en revue).

## 3. Rôles et clés

| Clé | Où | Signe |
|---|---|---|
| EOA client (MetaMask) | Navigateur | Approvals, `wrap()`, auth CLOB L1, ordres (signatureType **0**, `funder` = lui-même), redeem |
| Wallet agent 0G | Backend (env var) | Tx `PolicyRegistry`, paiement inférence Router |
| (aucun wallet opérateur Polygon) | — | — |

Le wallet client démo doit être financé en **POL (gas) + USDC.e** avant tout — cf. §13 pre-flight.

## 4. Flux

### 4.1 Onboarding client (une fois, écran « Activate » — jamais en live sur scène, cf. §13)

1. `USDC.e.approve(CollateralOnramp, amount)` — tx
2. `CollateralOnramp.wrap(amount)` → pUSD/PMCT (collatéral CLOB v2) — tx
3. `PMCT.approve(NegRiskCtfExchangeV2, amount)` — tx
4. Auth CLOB L1 : signature EIP-712 `ClobAuth` (hors-chain, gratuite) → dérive `{key, secret,
   passphrase}` via `POST /auth/api-key` — creds stockés en session navigateur

Le front force la chaîne (`wallet_switchEthereumChain` → Polygon) avant la première tx.

### 4.2 Devis — **catalogue d'abord, le LLM ne construit jamais un slug**

1. **Catalogue** (backend, indépendant du chat) : Gamma interrogé **par tag/catégorie météo**
   (pas par slug construit — la convention de slug n'est pas fiable, vérifié live : un slug
   deviné retourne vide). Pour chaque event live : ville, péril, date, buckets
   `{tokenId = JSON.parse(market.clobTokenIds)[0], outcome, negRisk}`. Rafraîchi ~5 min, en cache.
2. Chat questionnaire → `/api/agent` → **0G Router** (SDK OpenAI vanilla). Le prompt système
   **injecte le catalogue** : l'agent choisit dans la liste, il n'invente jamais (ville, date).
   Sortie contrainte au schéma :
   ```json
   { "eventId": "<du catalogue>", "peril": "heat", "threshold_c": 33,
     "payout_usdc": 500, "rationale": "...", "coverable": true }
   ```
   Si l'exposition du client ne matche **aucun** event du catalogue → `coverable: false` + message
   honnête (« pas encore couvrable — voici ce qui l'est »). C'est une feature produit, pas un échec.
   Validation serveur du JSON ; **max 2 re-prompts**, puis bascule provider fallback (§7), puis
   formulaire manuel (le chat n'est jamais un point de défaillance unique).
3. Prix live : CLOB book par tokenId + `getClobMarketInfo(tokenId)` → `mos`, `mts`, fee rate.
4. **Moteur de panier (code pur, zéro LLM)** :
   - Si `threshold_c` ≥ début du bucket tail (« X°C or higher ») → **panier = 1 ordre**.
     L'agent est promppté pour **préférer les seuils qui tombent sur le tail** (moins de
     signatures, moins de frais) et le proposer au client quand son seuil est proche.
   - Sinon : tous les buckets ≥ seuil + tail = N ordres, annoncé tel quel dans l'UI
     (« ce devis = 3 signatures »).
   - `N parts = payout_usdc` (parts à $1) ; prime = Σ (N × best ask_i) + taker fees.
5. Quote affichée : prime, payout, proba implicite, marchés sous-jacents, nb de signatures,
   bouton « Cover me ».

### 4.3 Souscription

1. Backend construit les ordres non signés : **limit GTC au best ask** (slippage borné),
   domaine EIP-712 **NegRiskCtfExchangeV2** (flag `negRisk: true` passé au client — sinon rejet
   de signature). Timeout 10 s sans fill → cancel + re-quote au nouveau ask.
2. Navigateur : signature(s) EIP-712 → backend relaie `POST /order` (headers L2 client).
3. **Détection de fill** : polling backend du statut d'ordre (2 s) + réconciliation idempotente
   au démarrage (clé = orderId) — un backend qui redémarre ne perd pas une police payée.
4. **Sémantique multi-ordres** : `PolicyRegistry.issue()` n'est appelé que sur le panier
   **entièrement rempli**. Fill partiel après timeout → legs non remplis annulés, le client
   choisit : re-quote du complément ou police réduite (payout recalculé sur les legs remplis).
   Jamais de police émise silencieusement différente du devis.
5. Fill complet → **agent** : `PolicyRegistry.issue(holder, profileHash, eventSlug, tokenIds,
   shares, premium)` sur Galileo.
6. Stretch ENS : `madrid-heat-0726.parasol.eth` → text records `policy`, `chain` (16602), `registry`.

### 4.4 Résolution & claim (J+1)

1. **Watcher** (cron backend, tourne la nuit sans humain) : subgraph resolution → payout vector →
   `PolicyRegistry.setStatus(id, ResolvedYes|ResolvedNo)`. Tx idempotente, re-tentée, loggée.
2. Si sinistre : le **client** redeem ses parts CTF — ⚠ chemin negRisk v2 : l'adapter v1
   (`0xd91E…5296`) est **déprécié, ne pas l'utiliser** ; l'adresse de l'adapter v2 est à
   confirmer sur la page Contracts avant d'écrire le redeem (§14). Testable gratuitement en fork.
3. Agent constate → `setStatus(id, Paid)`.

## 5. Contrats et adresses — confirmées contre docs.polymarket.com/resources/contracts (25/07)

> Tout vit dans `config/addresses.ts` avec l'URL source en commentaire. Re-vérifier au premier
> `cast call` (bytecode non vide) avant toute approval.

**Polygon (137)** :
| Contrat | Adresse | Statut |
|---|---|---|
| ConditionalTokens (CTF) | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` | confirmé |
| NegRiskCtfExchangeV2 | `0xe2222d279d744050d28e00520010520000310F59` | confirmé |
| CTFExchangeV2 (binaires — référence) | `0xE111180000d2663C0091e4f400237545B87B996B` | confirmé |
| pUSD CollateralToken (proxy) | `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB` | confirmé |
| CollateralOnramp | `0x93070a847efEf7F70739046A929D47a521F5B8ee` | confirmé |
| CollateralOfframp | `0x2957922Eb93258b93368531d39fAcCA3B4dC5854` | confirmé |
| NegRiskAdapter v1 | `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` | **déprécié — interdit** |
| NegRiskAdapter v2 (redeem) | **à confirmer** (page Contracts) | ouvert (§14) |

**0G** (confirmé docs.0g.ai) :
| Réseau | Chain ID | RPC | Explorer |
|---|---|---|---|
| Galileo (testnet, cible) | **16602** | `https://evmrpc-testnet.0g.ai` | `chainscan-galileo.0g.ai` |
| Aristotle (mainnet) | 16661 | `https://evmrpc.0g.ai` | `chainscan.0g.ai` |

Faucet : `faucet.0g.ai` — **0.1 0G/wallet/jour** → réclamer sur tous les wallets équipe dès H0.

## 6. PolicyRegistry (0G Galileo)

```solidity
// foundry.toml : evm_version = "cancun"  ← OBLIGATOIRE (sinon invalid opcode au deploy,
// documenté par 0G). Vérification via l'API de chainscan-galileo (chemin exact à checker
// sur place — pas Etherscan).
contract PolicyRegistry {
    enum Status { Issued, ResolvedYes, ResolvedNo, Paid }
    struct Policy {
        address holder;       // EOA Polygon du client
        bytes32 profileHash;  // keccak256(profil) — ou rootHash 0G Storage (stretch)
        string  eventSlug;
        uint256 shares;       // N (6 dec.)
        uint256 premium;      // pUSD payé (6 dec.)
        uint64  issuedAt;
        Status  status;
    }
    address public immutable agent;
    uint256 public nextId;
    mapping(uint256 => Policy) public policies;
    mapping(uint256 => uint256[]) public policyTokenIds;

    event PolicyIssued(uint256 indexed id, address indexed holder, string eventSlug, bytes32 profileHash);
    event PolicyStatus(uint256 indexed id, Status status);

    modifier onlyAgent() { require(msg.sender == agent, "not agent"); _; }
    constructor() { agent = msg.sender; }

    function issue(address holder, bytes32 profileHash, string calldata eventSlug,
        uint256[] calldata tokenIds, uint256 shares, uint256 premium)
        external onlyAgent returns (uint256 id) { /* stocke, émet PolicyIssued */ }

    function setStatus(uint256 id, Status s) external onlyAgent { /* émet PolicyStatus */ }
}
```

## 7. Agent — 0G Compute

- SDK OpenAI vanilla, `baseURL: https://router-api.0g.ai/v1` (mainnet Router — confirmé).
  Testnet Router en secours : `https://router-api-testnet.integratenetwork.work/v1`.
- Setup : wallet → pc.0g.ai → dépôt → clé `sk-…`. À faire **dès H0**.
- Le LLM ne fait **que** : conversation + choix dans le catalogue + JSON (§4.2). Tout le
  pricing/panier est déterministe.
- **Fallback dégradé** : interface `inference(messages) → json`, provider secondaire derrière le
  même contrat d'appel, puis formulaire manuel. La démo peut montrer le swap de `baseURL`.
- **Preuve d'inférence (requirement track)** : débits on-chain du contrat de paiement Router +
  logs de requêtes. **Tâche explicite** : vérifier dès H0 que le modèle choisi renvoie une
  attestation TEE exploitable. Si oui → le pitch dit « privé (TEE) » ; si non → le pitch dit
  « inférence décentralisée réglée on-chain, TEE en roadmap ». **On ne claim sur scène que ce
  que l'endpoint prouve.**

## 8. Subgraph — The Graph

- **Défaut (cœur, ~3 h)** : fork de `Polymarket/resolution-subgraph` (+ orderbook si utile),
  déployé sur **Studio**, consommé réellement par le watcher (§4.4). C'est déjà un argument
  prize honnête : data indexée + consommateur réel.
- **Stretch (+2-3 h, si gate passée)** : vue normalisée `CoverMarket` `{eventSlug, city, peril,
  buckets, impliedProbability, resolved, payoutVector}` consommée aussi par le catalogue.
- Le prix live reste au CLOB (les books ne sont pas dans le subgraph) — dit tel quel au jury.

## 9. Front (parasol/, Nuxt existant)

- Le `QuoteCard` illustratif devient l'écran réel : chat → quote (§4.2.5) → « Activate »
  (3 tx, une fois) → « Cover me » (1..N signatures affichées d'avance) → page Police.
- Page Police : statut depuis `PolicyRegistry` (RPC Galileo public), ENS (stretch), liens
  chainscan + marché Polymarket.
- **Déploiement public** (requirement « live demo link ») : build nitro déployé (host au choix)
  + backend/creds qui survivent **après** la démo pour le judging asynchrone — budgété tâche 9.
- Copy : la météo est un *exemple* — « any event a public source can settle » reste la promesse.

## 10. Mode fork (fallback geoblock) — **v1.1, corrigé après revue**

`MODE=fork` (env) si `GET polymarket.com/api/geoblock` rejette le venue.

- **Interdit : minter les positions via `CTF.splitPosition`.** Les tokenIds negRisk sont dérivés
  par le **NegRiskAdapter** (oracle = l'adapter, collatéral auto-wrappé en WrappedCollateral,
  `questionId` requis) — un split direct sur le CTF produit des **tokenIds différents** de
  `clobTokenIds`, et casse silencieusement quote, registry et redeem.
- **Méthode : impersonation Anvil.** Sur le fork, repérer un **vrai holder** des tokenIds exacts
  du devis (holders ERC-1155 via polygonscan/subgraph), `anvil_impersonateAccount` +
  `anvil_setBalance` (gas), `safeTransferFrom` vers le client au prix **live du vrai CLOB** (lu
  en mainnet, hors fork). TokenIds garantis identiques, zéro dérivation.
- **Re-fork frais chaque matin de démo.** Un fork est figé à son bloc : la résolution de la nuit
  n'y apparaît jamais. Le matin, on re-fork mainnet (l'état de résolution est réel), et on
  re-matérialise la position J-1 du client par impersonation d'un holder gagnant. Le
  `PolicyRegistry` vit sur **Galileo réel**, pas sur le fork : les polices émises persistent à
  travers les re-forks.
- Framing démo, honnête : « settlement local à cause des restrictions géographiques — prix,
  marchés et résolutions sont les vrais, lus en mainnet ».
- Ops : process anvil supervisé + `--dump-state` périodique ; un crash de laptop ne doit pas
  coûter l'état de scène.
- La décision réel/fork se prend au venue à H0 (le *mode* est figé, le fork lui se re-prend).

## 11. Plan de build — 4 pistes parallèles, ~30 h restantes

> La somme brute des tâches ≈ 31 h : **ça ne tient qu'en parallèle et avec les coupes par
> défaut déjà faites** (subgraph minimal, stretchs gated). Pas de plan où tout le monde dort peu
> ET tout est livré — les lignes de coupe sont le plan, pas l'exception.

**Gate 0 (ce soir, ~1 h 30, bloquant)** : faucet Galileo tous wallets · **POL + USDC.e sur le
wallet démo Polygon** · geoblock check venue → fige le mode · première inférence Router OK ·
check attestation TEE (§7) · relevé des heures réelles de finalisation des marchés d'hier (§12).

| Piste | Tâches | Est. |
|---|---|---|
| **A — Marchés & exécution** | catalogue Gamma (2 h) → moteur panier + tests (2 h) → jambe CLOB : auth navigateur, ordres negRisk, proxy, fills+réconciliation (5 h) → mode fork impersonation (3 h) | 12 h |
| **B — Agent & 0G** | Router + schéma + catalogue injecté + fallbacks (3 h) → PolicyRegistry deploy + intégration (2 h) → watcher résolution (2 h) | 7 h |
| **C — Subgraph** | fork resolution-subgraph → Studio → branchement watcher (3 h) · stretch CoverMarket (+2 h, gated) | 3-5 h |
| **D — Front & livrables** | écrans chat/quote/activate/cover/police (5 h) → déploiement public + e2e + polices J-1 + vidéo + README + soumissions (4 h) | 9 h |

Coupes dans l'ordre si ça déborde : S2 Storage → S1 ENS → stretch CoverMarket → réduire le mode
fork au chemin démo strict. **Jamais coupé** : piste B (éligibilité 0G), jambe CLOB ou fork
(la liquidité Polymarket est la raison d'être), déploiement public (requirement).

## 12. Démo (3 min) — la police J-1, dérisquée

**Cette nuit** : émettre **deux** polices sur les marchés du 25/07 —
1. une à seuil **quasi certain d'être atteint** (bucket ≥ 90 % de proba) : c'est elle qui montre
   le payout demain. On ne joue pas la météo sur scène, on la choisit ;
2. une à seuil incertain : si elle paie aussi, bonus ; sinon elle montre « résolue, pas de
   sinistre, le NO ne doit rien » — l'autre moitié du produit.

Vérifs Gate 0 : à quelle heure les marchés d'hier ont **réellement** finalisé (fenêtre de
challenge UMA comprise) → si la fenêtre déborde sur l'heure de démo, le plan B est une police
**J-2** déjà payée. Le script ne dépend jamais d'une résolution « en direct ».

Script : problème (30 s) → questionnaire live + quote, inférence 0G visible (45 s) — parcours
répété, seuil calé tail = 1 signature → achat (30 s) → page police + registry chainscan (30 s) →
**la police d'hier : résolue, payée, redeem à l'écran** (45 s) → close : non-custodial + (selon
§7) « privé TEE » ou « inférence réglée on-chain ».

## 13. Pre-flight scène (à dérouler 1 h avant, checklist affichée)

1. Wallet démo : POL ✓, USDC.e ✓, **onboarding §4.1 déjà fait** (aucune approval en live), chaîne = Polygon ✓
2. Backend up, catalogue frais, watcher loggé « OK » cette nuit ✓
3. Mode réel : geoblock re-testé / Mode fork : re-fork du matin fait, position J-1 re-matérialisée ✓
4. Police J-1 « quasi certaine » : statut `ResolvedYes` visible sur chainscan ✓ (sinon → plan B J-2)
5. Inférence Router : un appel de chauffe < 30 s avant de monter ✓ (sinon → fallback provider)
6. Parcours répété : les réponses du questionnaire mènent à un seuil tail = 1 signature ✓

## 14. Risques et inconnues restantes

| Risque | Parade |
|---|---|
| Geoblock venue | Testé à H0 ; mode fork (§10, impersonation) prêt avant toute tentative réelle |
| Adresse NegRiskAdapter v2 (redeem) inconnue | Page Contracts + test du redeem sur fork avant d'écrire le front claim ; v1 `0xd91E…` interdit |
| Flag negRisk oublié → rejets signature | Construction d'ordres centralisée en un module ; test 1 ordre minuscule avant démo |
| LLM hors catalogue / hors schéma | Catalogue injecté + validation + 2 retries + fallback provider + formulaire manuel (§4.2) |
| Fill partiel multi-ordres | Sémantique §4.3.4 (police = panier rempli, jamais silencieusement différente) |
| Backend crash entre fill et issue() | Réconciliation idempotente par orderId (§4.3.3) |
| Résolution nocturne sans humain | Watcher cron (§4.4) + vérif au pre-flight |
| Router 0G down / TEE absente | Fallback provider même interface ; pitch ajusté à ce que l'endpoint prouve (§7) |
| `evm_version` ≠ cancun | Pin foundry.toml, testé au premier deploy |
| Min size / tick surprenants | `getClobMarketInfo` par token, jamais de constantes |
| Books fins → slippage | Limit GTC au best ask + timeout/cancel ; jamais market FOK sur gros N |
| Faucet à sec (0.1/jour) | Réclamer H0 multi-wallets ; Discord 0G si besoin |

## 15. Historique

Le modèle AMM/LP (assureurs = LP Uniswap v4, POC `poc/` 4/4) est abandonné au profit de la
liquidité Polymarket : fragmentation par événement, cold-start par pool, narration jugée
artificielle. Le POC reste la référence CTF (split/redeem) — même contrat de base.
