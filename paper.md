# Raindrop: Continuous token issuance via delegated trust propagation

## Abstract
We present Raindrop, a cryptoeconomic mechanism that continuously allocates new token issuance according to a token‑weighted trust network. Accounts publish persistent trust weights (trust delegations); the protocol aggregates these signals via the EigenTrust trust propagation algorithm to produce allocation weights each issuance round. The result is an adaptive, passive participation alternative to episodic votes or static distributions, with strong Sybil resistance properties.

## 1. Overview

Raindrop replaces discrete governance payouts and one‑time airdrops with ongoing micro‑allocations. Each issuance round mints a small quantity of tokens and distributes them in proportion to an allocation vector computed from (i) current token balances and (ii) account‑specified trust weights. Trust updates and balance changes alter subsequent allocations, producing a steady‑state, self‑adjusting flow of value.

## 2. Conceptual Framing

Raindrop is proposed as a mechanism for allocating newly issued tokens to accounts that advance the goals of a network, as inferred from the aggregated preferences of its participants. Throughout this paper, we use the term “trust” to denote an endorsement: a signal that a given account is expected to further the network’s objectives if allocated additional tokens.

Accounts holding the token are considered stakeholders, as their token balances reflect economic exposure to the network. We assume that the token is freely tradable on external markets. Consequently, one way to acquire influence within the system is to purchase tokens. This behavior is interpreted as supportive of the network’s goals, insofar as external demand puts upward pressure on the token’s price and thereby increases the network’s overall resource capacity.

Conversely, market participants who sell tokens may be doing so either to cover operational costs involved in contributing to the network or to express diminished confidence in the network’s ability to achieve its objectives. In either case, market actions indirectly communicate information about participants’ expectations and constraints, but Raindrop itself remains agnostic to individual motives.

Importantly, the definition of a network’s goals is determined by the community or system deploying Raindrop and is not encoded in, or constrained by, the Raindrop algorithm itself. Raindrop provides a general-purpose issuance and allocation mechanism; the substantive aims of any particular network lie outside its formal specification.

## 3. Mechanism

Raindrop employs the [EigenTrust trust propagation algorithm](https://nlp.stanford.edu/pubs/eigentrust.pdf) [1] to aggregate local trust delegations into a global allocation vector. EigenTrust provides a simple, convergent method to compute reputation under standard damping and normalization. 

The system maintains two classes of state for each account:
  - token balance
  - outgoing trust weights of other accounts

The system also encodes some static parameters:
  - Issuance policy parameters including issuance rate and issuance cadence
  - EigenTrust damping factor \(\alpha\), and convergence thresholds.

Each issuance round proceeds as follows: 
- The protocol computes the balance vector \(b\) of relative token balances
- The protocol encodes the trust network as a row‑stochastic trust matrix \(T\) (where row \(i\) encodes account \(i\)'s outgoing trust weights)
- The protocol computes the allocation vector \(g = \text{EigenTrust}(T, b, \alpha)\) [1], which aggregates local trust delegations into a normalized distribution of allocation weights that blends token balance‑proportional issuance influence with transitive endorsement.
- Second, the system mints \(\Delta S\) tokens according to the configured rate and cadence. 
- Third, it distributes \(\Delta S\) to accounts in proportion to \(g\), updating balances accordingly. Optionally, a fraction of transaction fees or issuance directed to a null address is burned, introducing deflationary pressure. 

Outside of issuance rounds, accounts may submit signed transactions to update their outgoing trust weights or send tokens at any time. These updated values will be used in the next issuance round. 

## 4. Sybil Resistance

In Raindrop, an account’s direct issuance influence is proportional to its token balance. For the purposes of this allocation mechanism, we define Sybil resistance as the property that total issuance influence is conserved with respect to underlying capital. That is, an account cannot increase its aggregate issuance influence by dividing its holdings among multiple pseudonymous accounts. Because the system normalizes influence using the balance vector \(b\), the total issuance influence attributable to a given amount of capital remains constant regardless of how it is distributed across identities.

Under this construction, Sybil resistance emerges without requiring external identity systems, attestations, or verification mechanisms; it holds purely by virtue of the issuance rule and balance-anchored trust propagation.

## 5. Properties

### 5.1 Structural Properties

The Raindrop allocation mechanism exhibits several properties that follow directly from its construction:
- Sybil-resistant issuance influence: As discussed previously, issuance influence is anchored to token balances, and dividing a balance across multiple identities does not increase aggregate issuance influence. This yields Sybil resistance without reliance on external identity systems.
- Real-time adaptability: Because trust weight updates immediately affect subsequent issuance rounds, Raindrop avoids the “snapshot problem” inherent in one-time airdrops or grant rounds, where allocations must be accurately decided up front.

### 5.2 Behavioral and Governance Considerations

The design also interacts with behavioral and governance dynamics noted in prior work, although these are interpretations rather than formal guarantees:
- Endorsement without asset transfer: Trust delegations redirect future issuance rather than existing balances. From a behavioral perspective, this may reduce the perceived cost of supporting others, consistent with findings on the endowment effect [2].
- Higher participation: Persistent trust delegations lower the frequency with which participants must actively submit preferences, potentially mitigating low participation rates observed in episodic voting or grant processes. Participants may endorse curators or trusted experts instead of directly seekings out funding candidates.
- Adaptive responsiveness: Continuous recomputation allows the allocation to adjust as community assessments evolve, which may address limitations of systems that rely on infrequent, discrete decision points.


## 6. Parameters

The system exposes several tunable parameters that jointly define the inflationary envelope and the responsiveness of the system to trust updates.

- **Initial token distribution** specifies the starting allocation across accounts. Because subsequent issuance is balance‑weighted, this distribution must be non‑zero.
- **Issuance rate** specifies the quantity minted per issuance round, either as a fraction of total supply or a fixed amount.
- **Issuance cadence** (e.g., hourly, daily, or weekly) determines the frequency of issuance rounds. While a frequent cadence is reccomended, it must be balanced against the engineering constraints of calculating and performing the distribution.
- **Damping factor** \(\alpha \in (0,1)\) is an EigenTrust parameter that balances inherited token weight against delegated trust in the propagation step.
- **Convergence threshold** is an EigenTrust parameter that defines the stopping criteria for the iterative trust propagation and issuance computation (e.g., maximum norm change between successive trust vectors or a fixed iteration budget), trading off computational cost against numerical precision. Note that the calculator of a distribution could shift the distribution in their favor up to the numerical precision of convergence threshold.

## 7. Conclusion

Raindrop implements a live issuance policy that channels a portion of monetary flow toward socially endorsed contributors while preserving market participation and avoiding reliance on external identity systems. By coupling continuous issuance with delegated trust propagation, the mechanism transforms static distributions and episodic governance into an ongoing process of collective valuation. 

The design aims to produce adaptive, fairer token allocation that responds to sustained contribution and community endorsement, offering a path toward self‑adjusting economic systems in which issuance influence flows according to the evolving trust and participation of network members.

## References

[1] Kamvar, S. D., Schlosser, M. T., & Garcia-Molina, H. (2003). The EigenTrust algorithm for reputation management in P2P networks. *Proceedings of the 12th International Conference on World Wide Web*, 640–651. https://nlp.stanford.edu/pubs/eigentrust.pdf

[2] Kahneman, D., Knetsch, J. L., & Thaler, R. H. (1991). Anomalies: The endowment effect, loss aversion, and status quo bias. *Journal of Economic Perspectives*, 5(1), 193–206. https://pubs.aeaweb.org/doi/pdfplus/10.1257/jep.5.1.193

