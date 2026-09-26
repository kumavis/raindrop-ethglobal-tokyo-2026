# Adversarial Review: Raindrop

*Review of `paper.md` (white paper first draft). This review looks for ways the mechanism could fail or be exploited.*

## Summary

The core idea breaks down as designed. The Sybil-resistance claim holds only in a narrow sense. The bigger problem is that the incentives reward holders for never endorsing anyone, and every delegation creates an issuance stream that can be openly bought.

**Assumption.** The math below assumes the standard EigenTrust form, with balances as the pre-trust vector:

$$g = \alpha b + (1-\alpha)\, C^\top g$$

The paper never states the formula, so the authors should check that this matches what they intend.

---

## 1. The critical flaw: delegating always loses money

- **Self-trust beats endorsing.** Under the formula above, an account that delegates all its trust keeps only α of its pro-rata issuance and gives away (1−α). An account that trusts itself keeps 100%. If self-trust is banned, two accounts owned by the same person that trust each other do the same thing at no cost. Every token of endorsement is issuance the endorser gives up.
- **The equilibrium is that nobody delegates.** If every rational holder trusts themselves, g = b. Issuance is then strictly pro-rata, which works like a stock split, and nothing reaches contributors.
- **The mechanism works against its own goal.** Holders who delegate get diluted every round compared with holders who don't. Over time the share of supply held by generous delegators shrinks, and the self-trusters' share grows.
- **Section 5.2 is misleading.** "Endorsement without asset transfer" is wrong economically. Redirecting your issuance costs exactly as much as handing over the tokens it would have produced. Using the endowment effect as a feature means the design relies on participants not noticing what it costs them.

## 2. Delegation will be bought, not given

Since delegating costs the delegator, recipients will pay for it:

- **Bribe and kickback markets.** A recipient can offer "delegate to me and I'll return 80% of what you send." A smart contract can enforce this trustlessly because trust edges are public. The recipient keeps the spread, and the delegator does better than self-trust. The "endorsed contributor" ends up being whoever runs the best rebate program.
- **There is direct precedent.** Curve's gauge voting is nearly this mechanism: token-weighted, continuous direction of emissions. It produced Convex, Votium, Hidden Hand and a large market in paid votes. The paper should cite it and explain why Raindrop would turn out differently. Other prior art it omits includes conviction voting, liquid democracy, Gitcoin quadratic funding, Optimism RetroPGF and SourceCred.
- **Delegation becomes a separate tradable asset.** A wrapped token that delegates programmatically, similar to vlCVX, splits influence from economic exposure.

## 3. Influence without exposure

Section 2 assumes that holding the token means having a stake in the network. That assumption fails in several ways:

- **Empty voting.** An attacker borrows the token and shorts it or hedges with perps. They then have full influence and no price exposure, so they can send issuance anywhere, including to themselves, and carry no risk.
- **Renting balance at snapshot time.** Balances are read once per round. You can borrow tokens just before the snapshot, collect issuance and repay. A flash loan works if the snapshot is inside a block. The more frequent the cadence the paper recommends, the cheaper the rental.
- **Buying tokens is not the same as supporting the network.** A competitor or attacker can buy in cheaply, route issuance to themselves and sell. When contributors sell issuance to pay costs, the price falls, capture gets cheaper, and there is more selling. That is a death spiral.

## 4. The Sybil resistance claim is narrow

- **"Splitting doesn't help" only covers outgoing influence.** Splitting a balance is neutral for pre-trust mass. What the paper actually proves is one-token-one-vote, which is plutocracy renamed rather than Sybil resistance.
- **Incoming trust is fully open to Sybils.** Delegators who split trust evenly across a list are exposed: curator lists, "all projects in category X", or wallet defaults. Anyone can flood such a list with fake accounts, and a single entity can pose as N contributors.
- **Rank sinks.** This is a known EigenTrust and PageRank weakness. A closed ring of accounts keeps all incoming trust, and the only leak is the α reset back to b. An honest curator who passes trust on loses (1−α) of it each hop. The algorithm rewards being a dead end, so curators have a reason to be sinks, not routers.
- **Transitivity lets curators redirect your trust.** You trust a curator, and the curator trusts their own accounts.

## 5. Funding becomes permanent power

- **Issuance received turns into balance, and balance is influence.** Once a contributor has been funded, they can self-trust forever. An endorsement can be withdrawn from future rounds, but its effect is permanent. Early recipients dig in, and funding compounds for them (a Matthew effect).
- **Genesis holders set issuance forever.** Because influence is anchored to balances, the starting distribution controls every future round. Section 6 treats this as a one-line parameter, but it is the most important decision in the system.
- **Custodians and wallets become kingmakers.** Exchanges will delegate customer balances to themselves or sell those delegations. Wallets that set default trust capture everyone who never changes the default, as happened with Lido and exchange staking.

## 6. Computation and consensus attacks

- **Who computes g?** Running EigenTrust over N accounts every round can't be done on-chain at scale. That leaves an off-chain oracle, which is a trust assumption. Section 6 already admits "the calculator could shift the distribution in their favor." That is a vulnerability, not a footnote. Without a ZK or fraud proof, the computer controls the money supply.
- **The computer can front-run.** They know the result before anyone else and can trade on it.
- **Block producers can interfere.** They can censor or reorder trust updates just before a snapshot, and last-block trust updates are a source of MEV.
- **Spam and denial of service.** Accounts with no balance and millions of trust edges add computation cost without adding to b. The design needs minimum balances, per-edge fees or caps on edges.
- **Distribution cost.** Paying out to every account every hour is not feasible. A claim model with a Merkle root brings back the trusted-computer problem, and handling of dust and rounding is unspecified.

## 7. Gaps in the specification an attacker will use

1. **Direction of α.** The paper says it "balances inherited token weight against delegated trust" without saying which direction.
2. **Accounts that set no trust.** Where does their mass go: to b, uniformly, or burned? This decides whether doing nothing is generous or selfish.
3. **Self-loops and cycles.** Are they allowed? Banning self-loops doesn't help, because cycles between Sybil accounts do the same thing.
4. **Row normalization discards intensity.** Trusting one account at 0.0001 becomes 100% after normalization.
5. **What counts in b?** The paper doesn't say how contracts are treated: AMM pools, bridges, treasuries, burn addresses and lost keys. Lost keys and pool contracts that can't set trust still get issuance, or dump it somewhere unspecified.
6. **Who governs the issuance rate?** Issuance is a tax on holders, so holders will vote to reduce it. The paper doesn't say how rate changes are governed.
7. **Burning is optional and hand-waved.** Nothing offsets the constant selling by contributors.

## 8. Social and legal risks (secondary)

- **Public trust edges invite coercion.** Anyone can see who delegates to whom, which enables "delegate to us or else," retaliation and doxxing. The same public edges are what make bribes enforceable. Hiding them fixes bribery but breaks verifiability.
- **"Real-time adaptability" also means funding can vanish.** A whale can cut a contributor's income overnight, so contributors come to depend on large holders.
- **Tax and securities.** Issuance every hour may create a taxable event every hour, and ongoing issuance to endorsed accounts raises securities questions.

---

## What a stronger version would need

- **Make endorsing free, or self-trust worthless.** For example, the portion that isn't delegated could be burned or sent to a treasury. The paper would still need to explain how Sybil rings are stopped from recapturing it.
- **Make delegations receipt-free** so bribes can't be enforced, as in MACI-style private voting. This is the only credible defence against bribery we know of, and it costs public auditability.
- **Use time-weighted or locked balances** to stop balance rental. Note that ve-style locking has bribe markets of its own.
- **Verifiable computation.** Publish g with a ZK proof, or with a fraud-proof window.
- **Simulate with rational, adversarial agents** (self-trusters, bribers, renters, rings) before claiming the properties in Section 5. As written, the claims describe honest behaviour, not equilibrium behaviour.
- **Address Curve gauges directly.** They are the closest real-world test of this design, and they became a bribe market.

## Minor edits

- "reccomended" → "recommended" (Section 6)
- "seekings" → "seeking" (Section 5.2)
- Section 3 lists "Second" and "Third" steps with no "First".
