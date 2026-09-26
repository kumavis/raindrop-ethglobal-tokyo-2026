# Raindrop: funding via the social graph.

## Abstract
Every cause – be it charity or business – grapples with the problem of funding effectively. Funding usually hits those who are the loudest: those who apply for the most grants, or who are obvious "whales". It is hard for grant committees to see the researchers, builders, teachers and organisers who are really moving things forward, and have to engage in a lot of guess work. Even when funding is applied for or decided by these people, the approval processes and distribution still takes months.

The thing is, the people closest to the work already know who is doing it. They know who they learn from, who is showing up to the quieter hackathons, and who is building consistently. Our goal is to turn that knowledge and trust into a persistent graph that can be used for effective funding distribution. Token holders endorse the people they believe in, and every round newly minted tokens "rain" across the network according to a trust score computed from those endorsements with the EigenTrust algorithm [1]. Endorsers keep their coins, and endorsements persist until changed, so the trust graph can replace grant applications and proposals. Anyone can spin up a Raindrop network around a mission, and the raindrop graph decides where the value flows.

## 1. It starts with a mission

Every movement begins with a cause bigger than any one person: open-source privacy tools, AI safety research, local climate resilience, a public-health campaign. Causes like these don't advance on their own. They advance because particular people do the work: writing the code, running the experiments, teaching the classes, organizing the meetups and spreading the word.

Anyone who cares about a mission eventually asks the same question: **how do we fund the people moving it forward?**

The tools we have today fit that question poorly:

- **Grant committees** can't see everyone. A handful of reviewers can't know the thousands of contributors in a healthy ecosystem, so funding goes to whoever is visible, well connected or good at writing proposals.
- **Proposal-based DAO voting** is a chore: every participant is asked to read every proposal and vote before a deadline, so turnout is low and decisions are episodic.
- **Airdrops** are one-shot guesses, usually based on account balances or activity on block explorers, which certainly do not capture the people actually driving research or community engagement. 
- **Patronage platforms** sometimes work, but every dollar of support comes out of the supporter's pocket, which caps how much any community can direct toward its contributors.

## 2. The social graph knows

The thesis is that the information a funder needs already exists and known across the relationships of the people around the work. A researcher knows which colleagues produce results, a developer knows which maintainers review their pull requests at 2 a.m., and an organiser knows who actually shows up.

No single person sees the whole picture, but together a community's judgments form a **social graph of trust**. If we can read that graph, we can let funding follow it.

Raindrop is a mechanism for doing that: **funding that follows trust.**

## 3. How Raindrop works

### 3.1 Endorse, don't pay

Suppose Ada holds tokens in a Raindrop network, and she thinks Ben's work is moving the mission forward. She **endorses** Ben. This is not a payment: Ada keeps her coins. Her endorsement says *"I think Ben should receive future funding."* It works more like electing Ben for future issuance than like tipping him. Because endorsing never reduces a supporter's balance, it may feel far cheaper than donating, consistent with findings on the endowment effect and loss aversion [2].

The contrast with a patronage platform such as Patreon is the heart of the design:

| | Patreon | Raindrop |
|---|---|---|
| Supporter action | subscribe | endorse |
| Supporter's balance | goes down every month | stays put |
| Where funding comes from | the supporter's wallet | new issuance, directed by the network |

### 3.2 Then it rains

Every round (e.g., when every block is produced), the protocol mints a small amount of new tokens and distributes them across the network in proportion to each account's **trust score**. Accounts that have earned endorsements get more of the rain. No one's existing balance is spent to fund the round.

### 3.3 Everyone endorses someone

Ada is not alone. Every holder can endorse whoever they believe in: a builder they work with, a teacher they learned from, a curator whose judgment they trust. Together these endorsements form a single graph that captures the community's collective judgment about who is advancing the mission.

### 3.4 Trust flows through the graph

Endorsements are transitive. When Ada endorses Ben and Ben endorses Carla, some of Ada's trust flows on to Carla. **Being endorsed by the endorsed counts for more**, which lets participants rely on each other's judgment.  

This is the way Google Search works: when a site is cited by another with high citations of its owns, the trust score pools. Accordingly, that is where the most relevant pages are ranked, or in the case of raindrop, is where the rain falls.

### 3.5 Change your mind anytime

Endorsements persist until you change them. There are no proposals and no voting periods. If you meet someone building something great, you can endorse them the same afternoon. If a project stalls, you can move your endorsement. The next round uses the latest graph.

### 3.6 Every round, it rains again

Because issuance is continuous, Raindrop has no "snapshot problem." An airdrop has to be right the first time. Raindrop only has to be roughly right *this round*, and it corrects itself as the community's assessments change.

### 3.7 Newcomers get found

A newcomer with no tokens and no history can still get funded: once someone endorses them, the rain finds them. Discovery is spread across the whole community rather than bottlenecked on a committee's attention.

### 3.8 Three ways to get rain

An account's share of each round grows in three ways:

1. **Get endorsed.** Someone points their trust, and therefore the rain, your way.
2. **Get a gift.** Someone sends you tokens to jumpstart you. A balance carries its own baseline share of issuance.
3. **Buy in.** Anyone can buy tokens on the open market. Buying earns a baseline share, and market demand lifts the value of the whole network.

## 4. The mechanism

### 4.1 State

For each account \(i\), the protocol keeps:

- a token balance \(B_i\), and
- a set of outgoing endorsement weights \(w_{ij} \ge 0\) toward other accounts \(j\).

It also fixes a small set of parameters: the issuance rate, the issuance cadence, the damping factor \(\alpha\) and a convergence threshold.

### 4.2 Each round

1. **Balance vector.** Compute relative balances \(b_i = B_i / \sum_k B_k\).
2. **Trust matrix.** Normalize each account's outgoing endorsements into a row-stochastic matrix \(C\), with \(C_{ij} = w_{ij} / \sum_k w_{ik}\). An account with no endorsements keeps its own weight (\(C_{ii} = 1\)).
3. **Trust propagation.** Compute the trust score vector \(g\) as the fixed point of EigenTrust [1], using balances as the pre-trusted distribution:
\[
g = \alpha\, b + (1-\alpha)\, C^{\top} g
\]
Each round, a fraction \(\alpha\) of every account's weight stays anchored to its balance, and the remaining \((1-\alpha)\) flows along its endorsements. The computation iterates until successive vectors differ by less than the convergence threshold.
4. **Mint.** Create \(\Delta S\) new tokens according to the issuance rate.
5. **Rain.** Credit each account \(i\) with \(g_i \cdot \Delta S\).

Between rounds, accounts may transfer tokens or update their endorsements at any time. Changes take effect in the next round.

### 4.3 Where does the money come from?

If nobody pays out of pocket, who pays? The honest answer is that **issuance doesn't create value, it moves it.** Minting new tokens doesn't make the pie bigger. It redraws the slices, shifting a share of the network toward the places the community says it's needed. Holders who don't receive endorsements are diluted slightly. That dilution is the collective budget a Raindrop community spends on its contributors, and the graph decides how it is spent.

**To grow the pie, grow the network.** The value of every slice depends on how many people care about the network, use it and want to hold its token. Funding the people who advance the mission is how a network earns that demand.

## 5. The mission is what makes it work

### 5.1 Isn't that a pyramid scheme?

A token that funds its holders by recruiting more holders would be one. The difference is **what the network is for**. A Raindrop network that exists only to pump its own price has nothing to fund except its own promotion. A network organized around a mission has something real to point its issuance at.

### 5.2 Give the network a mission

Raindrop doesn't define what a network's goals are: they are independently chosen by the community that launches it. This could be privacy tech, AI safety, open science, a neighbourhood, or an art movement. Each mission gives endorsements a meaning. The question each holder answers is not "who is my friend?" but **"who is moving this mission forward?"**

### 5.3 Endorse the work, not the wallet

In a privacy-tech network, that might be the cryptographer shipping a new library, the educator writing tutorials, the organizer running workshops or the advocate spreading the word. Raindrop is agnostic about *what kind* of work counts. Whatever moves the mission is fair game, and the community's endorsements decide.

### 5.4 Value flows to the real work

Put the pieces together and you get a funding loop:

1. Supporters of a mission buy into its network, which raises the value of its tokens.
2. The community's endorsements, propagated through the trust graph, route new issuance to the people advancing the mission.
3. Those contributors do the work, which makes the mission more credible and attracts more supporters.

Anyone can buy in. **The graph decides where the value goes.**

## 6. Sybil resistance

A common failure of social funding systems is the fake crowd: one person creating a thousand accounts to look like a movement. Raindrop's baseline share is anchored to token balances, so splitting a balance across many accounts doesn't increase its total weight. The pre-trust term \(\alpha\, b\) is the same whether a given amount of capital sits in one account or a thousand. Splitting into many accounts doesn't fool the rain.

We want to be precise about what this does and doesn't guarantee. Balance anchoring makes each holder's *own* influence conserved under splitting. It does not stop a single entity from posing as many contributors to collect endorsements from others. That depends on endorsers exercising judgment about who they endorse, which is exactly the local knowledge the social graph is meant to capture. Section 8 discusses this and other open problems.

## 7. Parameters

- **Initial distribution.** Raindrop needs a non-zero starting distribution, because issuance weight is anchored to balances. The genesis distribution shapes early influence and should be designed deliberately, for example spread across a mission's existing contributor community.
- **Issuance rate.** The quantity minted per round, either as a fraction of supply or as a fixed amount. This sets the size of the community's funding budget, and the dilution holders accept to pay for it.
- **Issuance cadence.** How often it rains: hourly, daily or weekly. More frequent rounds make the network more responsive but cost more to compute and distribute.
- **Damping factor \(\alpha \in (0,1)\).** The share of each account's weight that stays anchored to its balance, compared with the share that flows along endorsements. A lower \(\alpha\) gives endorsements more power.
- **Convergence threshold.** The stopping criterion for trust propagation. Whoever computes the distribution can bias it by up to this precision, so it should be tight, and the computation should be verifiable.

## 8. Limitations and open problems

Raindrop is an early design, and we have published an [adversarial review](https://github.com/kumavis/raindrop-ethglobal-tokyo-2026/blob/main/paper/adversarial-review.md) alongside this paper. The most important open problems are:

- **Endorsement has an opportunity cost.** Under the formula in Section 4.2, an account that endorses others passes on \((1-\alpha)\) of its own share, while an account that endorses no one (or a ring of its own accounts) keeps all of it. A purely self-interested holder earns more by not endorsing. Raindrop relies on holders who care about the mission more than about maximizing their share. Designs that make endorsing free, for example by burning or pooling the non-delegated share, are an active area of work.
- **Bribery.** Public endorsements make it possible to pay holders for endorsements with enforceable kickbacks, as seen in the bribe markets around token-weighted emission voting. Receipt-free (private) endorsements are a candidate mitigation.
- **Borrowed influence.** Balances can be borrowed around snapshots, or held with a hedge so the holder has no price exposure. Time-weighted or locked balances would reduce this.
- **Trust sinks.** Accounts or rings that receive endorsements but never pass them on keep more of the trust flowing into them than honest curators do, a known weakness of EigenTrust-style propagation.
- **Verifiable computation.** Computing \(g\) for a large network each round will likely happen off-chain. It should be accompanied by a validity or fraud proof so the computer cannot bias the result.

We think these are solvable, and that the core idea is worth solving them for: a community's collective knowledge of who is doing the work is its most underused funding resource.

## 9. Conclusion:

Raindrop isn't one network. It's a pattern anyone can use: pick a mission, launch a token and let the social graph route funding to the people moving it forward. Supporters endorse the people they believe in and keep their coins. 

Contributors are found by the people who know their work, not by unrelated ETH account balances or rare NFT holders. In every round, the raindrop protocol rains again based on the latest endowment of the whole community.

For humanity's biggest dreams and hardest problems, the people doing the work are already known to someone. Raindrop tracks that knowledge and helps fund them.

**Fund the mission. Let the graph find the people.**

## References

[1] Kamvar, S. D., Schlosser, M. T., & Garcia-Molina, H. (2003). The EigenTrust algorithm for reputation management in P2P networks. *Proceedings of the 12th International Conference on World Wide Web*, 640–651. https://nlp.stanford.edu/pubs/eigentrust.pdf

[2] Kahneman, D., Knetsch, J. L., & Thaler, R. H. (1991). Anomalies: The endowment effect, loss aversion, and status quo bias. *Journal of Economic Perspectives*, 5(1), 193–206. https://pubs.aeaweb.org/doi/pdfplus/10.1257/jep.5.1.193
