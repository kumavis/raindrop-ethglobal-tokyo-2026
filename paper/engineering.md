# Raindrop: Engineering Challenges

*Draft v0.1. Companion to `paper.md`. It sets out the problems we need to solve to build Raindrop, with a proposed solution to each. None of this is final.*

## Starting point

We suggest building Raindrop as smart contracts on an existing EVM L2, such as Base or Optimism, rather than as a chain of its own. An L2 inherits Ethereum's security, works with existing wallets and DeFi, and makes each action cheap. A factory contract can deploy one independent Raindrop network per mission.

The core of the design is a split between what runs off-chain and what is checked on-chain:

- **On-chain:** balances, endorsements, commitments to each round's results, and claims.
- **Off-chain:** the EigenTrust computation.

Most of the challenges below come from that split.

---

## 1. Computing trust scores

**Challenge.** EigenTrust (`paper.md` §4.2) repeats a matrix–vector multiply until the result settles. With 1M accounts and up to 32 endorsements each, one round is about 1.6B multiply-adds. That takes seconds on a laptop and is impossible within EVM gas limits.

**Solution.** Run the computation off-chain. Specify it exactly: unsigned fixed-point arithmetic with `WAD = 1e18` and every division rounding down. Any implementation then produces the same result, and because integer addition doesn't depend on order, the summation order doesn't matter. Accounts with no endorsements get a self-edge, as in `paper.md` and the explainer simulation.

## 2. Trusting the computation

**Challenge.** Whoever computes a round decides who gets paid. `paper.md` §7 already admits the computer can bias results up to the convergence threshold. Without on-chain verification, the computer controls the money supply.

**Solution.** Check the answer, don't recompute it. A proposed trust vector \(g\) is valid if every account satisfies the formula within a small tolerance:

$$|g_j - \alpha b_j - \textstyle\sum_i c_{ij}| \le \tau_{rel}\, g_j + \tau_{abs}, \qquad c_{ij} = (1-\alpha)\, g_i\, w_{ij} / W_i$$

Here \(c_{ij}\) is the trust flowing from account \(i\) to account \(j\), \(w_{ij}\) is the weight of \(i\)'s endorsement of \(j\), and \(W_i\) is the sum of \(i\)'s endorsement weights. The formula is a contraction, so passing this check limits the error to \((\tau_{rel} + N\tau_{abs})/\alpha\). With reasonable settings, that caps the computer's possible bias at about **4 × 10⁻⁹ of a round's issuance**. The check is local, account by account, so it can be enforced in stages:

| Phase | How results are trusted |
|---|---|
| 0: MVP | A single trusted computer publishes results. |
| 1: Optimistic | Computers post a bond. During a challenge window, anyone can submit a one-step fraud proof that some account fails the check. The computer's bond is slashed. |
| 2: Validity | A zero-knowledge proof of each round, from a zkVM such as SP1 or RISC Zero, or from OpenRank, which offers EigenTrust as verifiable compute. |

Phase 0 should already use the Phase 1 data formats, so moving to Phase 1 needs no migration.

**Open.** At what size does proving each round (Phase 2) become cheaper than bonds plus the challenge delay (Phase 1)?

## 3. Freezing and proving the inputs

**Challenge.** Each round needs a balance for every account at a fixed moment, and fraud proofs need to prove those inputs later. A simple snapshot also invites renting tokens just before the snapshot.

**Solution.**
- **Balances:** give the token a time-weighted average balance (TWAB) accumulator, as PoolTogether v5 does. Each account's average over the round is then an O(1) lookup that can be proven on-chain, and a balance held for one block barely counts.
- **Endorsements:** have the registry checkpoint a hash of each account's edge list and emit the full list as an event. A fraud proof submits the list and the contract checks it against the hash.

## 4. Heavily endorsed accounts

**Challenge.** To check one account's score, you need every endorsement it receives. A popular account might have 100k endorsers, far too many for one proof.

**Solution.** Commit each round's results as two sorted **Merkle-sum trees**, where every internal node carries the sums of its children:

- an **account tree**, sorted by address, holding each account's balance, score, inflow and payout;
- an **edge tree**, sorted by `(target, source)`, holding each endorsement's contribution.

Because the edge tree is sorted by target, all of an account's incoming endorsements sit in one contiguous range, and their total can be proven from O(log E) nodes. Every fraud proof then costs O(log N + `MAX_OUT`): a wrong balance, a wrong contribution, a missing or made-up edge, a missing account, a wrong payout, or sums that don't add up.

## 5. Paying out at scale

**Challenge.** Sending tokens to every account every round isn't feasible.

**Solution.** Use **cumulative Merkle claims.** Each round's account tree records each account's total rain to date, and a claim pays that total minus what has already been claimed. One claim covers any number of rounds. When a round is proposed, the contract checks that total rain hasn't grown by more than that round's issuance, which caps minting even before any challenge.

**Open.** Should unclaimed rain count toward an account's balance? Counting it spares small holders from paying gas just to keep their weight, but it makes balance proofs more complicated.

## 6. Data availability

**Challenge.** Users need their leaf of the account tree to claim, and challengers need it to prove fraud. A computer could withhold that data to avoid being challenged.

**Solution.** The inputs can be rebuilt from on-chain data, so anyone can recompute a round. Publish the output trees to IPFS or Arweave, mirrored by an indexer. Add a **withholding challenge**: anyone can demand a specific leaf, and the computer must reveal it on-chain within the window or be slashed.

## 7. Spam and state growth

**Challenge.** Accounts with dust balances and thousands of edges cost almost nothing to create but make computation and proofs larger.

**Solution.** Cap each account's outgoing endorsements (`MAX_OUT`, for example 32). Set a minimum balance for an account to be included, and a separate minimum for its endorsements to count.

## 8. Tokens held by contracts

**Challenge.** AMM pools, lending markets and bridges hold tokens but can't choose whom to endorse. Bridged tokens sit in a bridge contract and currently earn nothing.

**Solution.** Keep a short, governed exclusion list of contracts whose balances are left out of `b`.

**Open.** Should rain that would go to excluded contracts be burned or redistributed? Should LPs be able to endorse through their pool? How should bridged balances be handled?

## 9. Onboarding and gas

**Challenge.** Endorsing someone you met "this afternoon" has to be easy for people who don't hold ETH.

**Solution.** On an L2, updating endorsements costs about 60–90k gas and a claim about 70–100k: roughly a cent or less. These are estimates to measure on the target chain. ERC-4337 paymasters and passkey smart wallets can make endorsing and claiming gasless and free of seed phrases.

## 10. Parameters and governance

**Challenge.** Values such as α, the issuance rate and the cadence decide who gets funded. Changing them is a political decision.

**Solution.** Start with these values:

| Parameter | Value | Why |
|---|---|---|
| Cadence | 1 day | pipelines with a 24h challenge window |
| α | 0.5 | matches the explainer simulation |
| `MAX_OUT` | 32 | limits spam and proof size |
| \(\tau_{rel}, \tau_{abs}\) | 1e-9, 1e3 wei | caps bias at about 4 × 10⁻⁹ per round |
| Proposer bond | ≥ 10 × one round's issuance | slashing must outweigh any gain |

Change parameters only through a timelock. Each network decides who governs.

---

## What engineering can't solve

Averaging balances over the round, verification and spam limits deal with the *implementation* attacks in `adversarial-review.md`: renting balances, a biased computer, spam and contract-held tokens. The *mechanism* problems remain: the opportunity cost of endorsing, bribery and trust sinks. They need changes to the economic design, not the engineering (see `paper.md` §8).
