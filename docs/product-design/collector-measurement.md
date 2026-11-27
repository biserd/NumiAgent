# Measuring collector activation and optional subscriptions

The native app has no purchase funnel or native event stream for these outcomes. The existing web analytics integration covers opted-in web launch signups, App Store clicks and web catalog clicks. Those counts cannot reveal which iPhone user scanned a coin, inspected a price or subscribed. TestFlight simulator results measure whether a journey works. Storefront availability and automated tests provide no conversion denominator.

## Proposed measurement contract

Offer a separate, voluntary diagnostics choice before collecting optional product metrics. Core offline use, account access and online-photo consent work independently of that choice. Honor withdrawal before the next upload. Count first-time events once locally for the installation. Reinstall and reset can duplicate a first observation. Report the unit as a consenting installation, never as a known collector. Where populations cannot be joined without identifying someone, report separate aggregate rates. A collector's sample exploration and their first result for their own piece are distinct.

Use allowlisted enums only. A proposed event can include schema version, broad app-version bucket, device class, entry surface, sample/own-piece flag, eligibility class, outcome and experiment arm where needed. Collect local elapsed time in coarse buckets (<15s, 15–29s, 30–59s, 60–119s, 120s+). Exclude photo bytes, OCR text, coin identity, searches, holdings, prices paid, notes, filenames, account/email addresses, advertising IDs and exact event timestamps. Suppress aggregate cells below 20 participants. Proposed aggregate retention is 90 days. Approve a collection purpose, retention and disclosures before adding a transport.

| Event | Emit only when | Denominator, deduplication or recovery |
| --- | --- | --- |
| first_launch | First interactive app surface appears | Once per consenting installation. First run before consent is unobservable unless measured locally with permission. |
| onboarding_started | A new collector begins scanning or explores the sample | Once per installation. Entry enum separates these paths. |
| onboarding_completed | A sample is inspected or the first local draft accepts a photo | Count the entry path separately. An empty draft is insufficient. |
| first_meaningful_action | The first real photo is accepted or the first manual record is deliberately entered | Once per installation, excluding sample activity. |
| first_successful_result | Identification yields a usable suggestion for the collector's own piece, or the collector saves a manual record | Separate local, optional online and manual outcomes. An empty result or automatic placeholder does not count. Measure elapsed time from first interactive surface. |
| premium_feature_discovered | An eligible collector explicitly opens the monthly digest preview from a completed sale | Once per research visit. Count eligible sale visits separately. |
| paywall_impression | A rendered offer is visible with complete localized terms | Once per presentation. Price-loading error is excluded and counted separately. |
| paywall_dismissed | Explicit free dismissal, back gesture or system close before purchase | One terminal outcome per impression. Distinguish already-active, billing cancellation and an abandoned presentation. |
| subscription_plan_selected | A plan is deliberately selected | Current proposed plan is monthly. Do not count a default or a restore. |
| purchase_initiated | The native purchase request begins after a deliberate tap with a purchasable product | Debounce repeated taps. Record eligible-trial vs standard offer. |
| trial_activated / subscription_activated | A verified transaction grants the applicable entitlement | Deduplicate in the billing system using the transaction ID. Publish only aggregate counts. Pending approval, failed transaction and restore are separate. |
| trial_to_paid | The first verified, successfully billed renewal after a trial | Denominator is trials that have reached the conversion window. A free activation or merely elapsed trial is insufficient. |
| renewal_disabled / renewal_reenabled | Authoritative subscription renewal preference changes | Deduplicate notifications and allow changes back. Access generally continues to period end. |
| subscription_expired / refunded | Verified expiration or refund/revocation | Report separately from turning off renewal. Handle delayed notifications and billing recovery. |
| retained_active | Verified access still exists at day 30 or day 60 for a mature cohort | Define the cohort by paid start. Show cohort size, observation end and censoring. A renewal is a billing outcome. Retained use requires separate, consented active-use measurement. |
| restore_result / purchase_error | Restore concludes or a purchase returns a terminal error | Use coarse success, no purchase, canceled, unavailable or other. Never collect raw error text. |

If a product launches, use verified StoreKit state and App Store Connect aggregate reports for billing. Add App Store Server Notifications only after scoped authorization, validation and deduplication. Keep financial transaction identifiers outside product analytics. Trial eligibility, localized pricing, grace periods and verified entitlement govern the UI independently of analytics participation.

## Where we expect friction

On first launch the old demo path hid the specimen behind sign-in. Returning users could reopen the same draft through several controls. These are verified properties of the old UI. Rates of abandonment, time with a real coin and revenue effects remain unknown. The revised camera shortcut can add a cancellation step for import-first collectors. Observe that segment separately. Check whether users distinguish new *realized* sales from existing free prospective auction alerts. Unavailable market data must not prompt purchase.

## Controlled study

1. Start with a randomized, between-participant Figma usability study. Give everyone the same specimen, illustrative sale, terms and task. Use blocks of six with two assignments per concept, separately for iPhone and iPad. Generate the allocation before recruiting and keep participants in the assigned arm. The [local study tool](assign-study.py) generates allocation sheets without collecting identity or calling a service. Run `python docs/product-design/assign-study.py --seed 417 --blocks-per-device 2` for 24 slots. Choose and record a seed before recruitment.
2. Ask participants to find the free sale, explain what the digest adds, state the first charge and renewal schedule, dismiss, and find restore. Record pass/fail and elapsed-time bands with a study number in a consented study file. Assess text scaling, assistive technology, narrow layouts and frequent collectors separately. Repeated exposure to other variants is useful for interviews but is excluded from first-exposure comparisons.
3. Recommend B for the first test. Its report example makes the paid deliverable concrete. If users expect guaranteed new sales or mistake the free individual lookup for paid access, revise the offer before any commerce experiment.
4. A future commercial experiment requires approved products, localized prices, tested purchase/restore flows, reliable supply and sufficient traffic. Pre-register B vs the strongest remaining alternative, the smallest worthwhile lift, significance level and power. Assign a random arm once per eligible, consenting installation before the first impression. Persist only the arm locally. Never target by holdings. Do not vary price and creative in the same experiment.
5. Primary rate is verified new paid starts per eligible assigned unit within a fixed 30-day window, analyzed by assigned arm. Use an attribution method approved by privacy review or treat arm-specific revenue as unmeasurable. Use mature cohorts for trial-to-paid. Monitor free-lookup completion, erroneous charges, failure/restore rates, refund rate, cancellations, day-30 retention and accessibility completion. Predefine stopping rules for harm and minimum sample size. Report denominators, exclusions, absolute differences and confidence intervals after the fixed horizon. If volume is insufficient, report usability evidence only.

No production enrollment, analytics SDK, price change or payment request is part of this study.
