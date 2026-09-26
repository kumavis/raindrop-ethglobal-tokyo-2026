# Design Note: A Stablecoin-Backed Variant of Raindrop

*Companion to `paper.md` and `adversarial-review.md`. This note looks at one alternative design: fund the rain from yield on stablecoin deposits instead of from inflationary issuance.*

## Summary

Funding the rain from stablecoin yield cleanly fixes the monetary problems: dilution, the pyramid question and price-driven capture. It doesn't fix the incentive or graph problems. It also turns Raindrop from a speculative token into something closer to donating your yield, which is more honest but has a much smaller funding ceiling.

## The design

- Users deposit stablecoins and receive Raindrop tokens 1:1.
- Deposits sit in a yield source, such as tokenized T-bills, sDAI or lending markets.
- Each round, the accrued yield is harvested and split across accounts using the same EigenTrust scores as the original design:

$$g = \alpha b + (1-\alpha)\, C^\top g$$

- Principal can be redeemed at par at any time. Only yield is distributed.

Compared with `paper.md`, the endorsement graph and the trust propagation are unchanged. What changes is where the rain comes from: yield on deposits instead of minting new tokens.

---

## 1. What it fixes

| Shortcoming in the original | Why yield helps |
|---|---|
| **"Where does the money come from?"** | The money is real external yield, not dilution. No one outside the system pays for it. |
| **Pyramid-scheme concern** | There's no price to pump and no need for new buyers to prop up old ones. |
| **Capture-and-dump, sell-pressure death spiral** | A pegged token can't be dumped. Contributors receive stablecoins, so they don't sell into a falling market. |
| **Genesis holders set issuance forever** | Anyone can mint at par, so being early brings no price advantage and influence is contestable. |
| **Borrowing and shorting for influence without exposure** | A pegged token has no price exposure for anyone, so there's nothing to hedge. This changes the problem more than it solves it; see Section 3. |
| **Contributor income is volatile** | Contributors are paid in dollars, which is much better for people funding real work. |
| **Balance rental around snapshots** | Yield accrues continuously, so each account can be weighted by balance × time held during the round. That removes the snapshot, and a flash deposit earns about zero. |

## 2. What it doesn't fix

- **The core opportunity cost remains, but it becomes explicit.** Under self-trust (or a ring of your own accounts), Raindrop is just a yield-bearing stablecoin wrapper. Endorsing someone means donating your yield. This is an improvement in honesty: nobody is misled by "nobody pays out of pocket." You pay with your yield and keep your principal. But the only depositors who fund anyone are ones who meant to give.
- **Bribery and self-trust are still one trade-off.** While self-trust is allowed, kickbacks can't beat it, but they can still draw endorsements away from honest contributors. If self-trust is blocked, rebates become the main way to get value back. See `adversarial-review.md`, Section 2.
- **Trust sinks and curator capture** are still graph problems, unaffected by what the token is backed by.
- **The oracle problem is unchanged.** Someone still has to compute g and prove it.
- **Public endorsement edges still invite coercion.**
- **Sybil resistance** is unchanged: balance-anchored, with the same limit on incoming trust.

## 3. What it breaks or adds

- **The funding ceiling is small and depends on interest rates.** The budget is deposits × rate. $10M deposited at 4% yields about $400k a year, and in a zero-rate period like 2020–21 the rain nearly stops. Inflation budgets scale with market cap. Yield budgets scale with altruistic deposits.
- **The flywheel goes away.** Section 5.4 of the paper relies on supporters sharing in the mission's success. With a pegged token, supporters get nothing back when the mission succeeds, so the "grow the pie" story and the financial alignment behind it disappear. Growth becomes linear and philanthropic, not reflexive.
- **Influence without any stake.** Influence becomes pure parked capital with no exposure to the mission, making it closer to plutocracy than the original design. In the original, whales at least lost money if the mission failed.
- **Yield-source risk.** Depegs, hacks of the lending protocol, stablecoin issuers freezing addresses, admin keys and redemption queues are all new ways to fail.
- **Regulatory.** A pooled deposit that pays out yield can look like a fund or a deposit-taker. The US GENIUS Act (2025) is understood to bar payment-stablecoin issuers from paying yield to holders. Raindrop would be a third party wrapping a yield source, but this needs legal review.

## 4. Prior art

- **Octant** is the closest match: ETH staking yield funds public goods, and holders direct the allocation. Its participation numbers show how big a yield-donation budget gets in practice.
- **PoolTogether:** no-loss prize savings, where principal is kept and yield is redistributed.
- **Glo Dollar:** a stablecoin that donates its reserve yield.
- **Yearn and Octant yield-donating strategies:** vaults that route yield to chosen recipients.

## 5. A hybrid worth considering

- **A stable-yield base layer.** Depositors direct their own yield. The pitch becomes honest and simple: *"keep your principal, donate your interest, the graph decides who gets it."*
- **Optional matching from a mission treasury or a small inflationary token.** This is shared money nobody can reclaim for themselves, so blocking self-trust costs nothing there. Weight it by endorsements from depositors (or quadratically by number of endorsers), so it amplifies what altruists already chose.
- **Time-weighted balances** to replace snapshots.

That keeps the social-graph routing, which is what's actually new here. It swaps "dilute holders" for "donate yield + match," and it stops self-interested holders from gaming shared issuance.

## 6. Open questions

1. **Yield source.** Which one balances yield, decentralization and freeze risk: tokenized T-bills, decentralized stablecoin savings rates, or a diversified basket?
2. **Accounts that set no trust.** Should their yield go back to them (making it a plain savings product), to a mission treasury, or to the matching pool?
3. **Matching.** How large should the matching layer be relative to depositor yield, and what funds it over the long term?
4. **Partial donation.** Should depositors be able to donate only part of their yield, to make participation easier?
5. **Legal structure.** How should the wrapper be set up so it isn't treated as a yield-paying stablecoin issuer?
