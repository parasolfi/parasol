# Runbook démo — dimanche matin

Dérouler dans l'ordre, ~20 min avant de monter. Tout se joue depuis le worktree
(`.claude/worktrees/build-v2`) ou depuis main une fois la branche mergée.

## 1. Fork frais (obligatoire — les RPC publics perdent l'état en ~5 min)

```bash
pkill -f "anvil.*8546" ; ~/.foundry/bin/anvil --fork-url https://polygon.drpc.org --port 8546 &
```

## 2. Serveur avec le bon environnement

```bash
set -a; source .env; set +a
FORK_RPC_URL=http://127.0.0.1:8546 NUXT_IGNORE_LOCK=1 ./node_modules/.bin/nuxt dev --port 3100 &
```

### Mode réel (vraies positions sur Polymarket)

`EXECUTION_MODE=venue` bascule l'exécution du fork vers le vrai carnet. Le
navigateur signe et poste les ordres lui-même, puis le serveur vérifie la
livraison en lisant le solde ERC-1155 du client sur Polygon mainnet — il ne
croit pas le client sur parole, et n'a besoin d'aucune credential.

```bash
EXECUTION_MODE=venue NUXT_IGNORE_LOCK=1 ./node_modules/.bin/nuxt dev --port 3100 &
```

Prérequis, sinon `/api/cover` répond 409 « not settled » :

1. Le wallet client détient du **POL** (gas) et du **pUSD**. L'exchange règle en
   pUSD uniquement — `NegRiskCtfExchangeV2.getCollateral()` le confirme. De
   l'USDC.e est wrappé automatiquement par `ensureCollateral()` ; du pUSD déjà
   en place saute cette étape.
2. Le venue n'est pas géobloqué. `GET /api/market-rules` renvoie `geoBlocked`.

`min_order_size` vaut 5 parts par leg, donc un premier achat de validation
coûte de l'ordre du dollar. Faire ce test avant de compter dessus en démo :
rien de ce chemin n'a encore été exécuté avec un wallet financé.

Vérifier : `curl localhost:3100/api/catalog` retourne des options du jour.

## 3. Police d'hier (le moment payout de la démo)

```bash
rm -f .data/policies.json
node scripts/seed-demo-policy.mjs Madrid <wallet-démo>
curl -X POST localhost:3100/api/resolve        # -> Paid + USDC.e sur le wallet
~/.foundry/bin/cast call 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174 \
  "balanceOf(address)(uint256)" <wallet-démo> --rpc-url http://127.0.0.1:8546
```

Si le marché d'hier n'est pas encore résolu (fenêtre UMA) : relancer le seed avec
une autre ville résolue (`node scripts/seed-demo-policy.mjs London …`).

## 4. Chauffe de l'agent

Un message dans /cover → vérifier le badge : « Live on 0G Compute » attendu.
Badge « Offline fallback » = clé Router morte → vérifier `ZG_ROUTER_API_KEY`, sinon
assumer le fallback (il est labellisé honnêtement).

## 5. Répétition du parcours scène (2 min)

1. /cover → « I run outdoor events in Madrid » → réponse agent
2. « Above 33C people cancel, a bad day costs me 500 dollars » → quote
3. Adresse wallet → Cover me → police Active dans la liste
4. Scroller sur la police d'hier : Paid + lien attestation 0G
5. Montrer le wallet : les tokens de couverture + le payout USDC.e

## Pièges connus

- Anvil étranger sur 8545 : on tourne sur 8546, ne pas toucher au 8545.
- `pkill nuxt` rate le vrai process : tuer par port `lsof -ti :3100 | xargs kill`.
- Le marché du jour (Madrid July 26) ferme à 12:00 UTC — après ça, la quote démo
  doit viser un marché du 27 (le catalogue filtre tout seul).
- Ne JAMAIS tenter un VPN vers Polymarket pour passer en mode réel.
