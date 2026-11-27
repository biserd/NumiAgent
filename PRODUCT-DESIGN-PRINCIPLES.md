# Product design principles

These standards apply to every product screen, flow, design review, and UX change. Use the platform's current design, accessibility, privacy, and purchase rules alongside this document.

## 1. Make the next action obvious

- Give each screen one purpose and one visually primary action. Use familiar labels that tell people what happens when tapped.
- Keep essential information together. Remove duplicate routes, explanatory copy that repeats the interface, and decorative containers that compete with the task.
- Put infrequent or advanced actions behind progressive disclosure. Keep back, close, and recovery actions discoverable.
- Use native controls and navigation where they match the task. Support keyboard, assistive technology, text scaling, and light and dark appearance. Adapt to the available window, including split and resized layouts.

## 2. Shorten the path to a useful result

- Audit every core workflow for first-time and returning users. Record the exact route, user taps, distinct screens, required decisions, data-entry fields, and expected waiting before and after. Include error, cancellation, and resume paths. Explain any remaining step and its purpose.
- Default to sensible, reversible choices. Ask only for information needed now. Combine screens that serve the same immediate task. Use undo or direct save for reversible actions where appropriate. Keep consent, destructive confirmation, child safety, and purchase authorization meaningful.
- Aim for a first meaningful result in 60 seconds where feasible. Define success in user terms and time the real path, including waits. A landing view or completion of registration is usually not the result.
- Offer a meaningful task or interactive sample before registration or payment where feasible. Label samples clearly. Request permissions at the point of need. Carry forward context when a user voluntarily signs in.

## 3. Earn the upgrade

- Lead with what customers can accomplish. Compare free and paid access plainly and show a real example when it helps the decision. Use personalization only from known, appropriate facts.
- Surface one relevant offer after value, when an explicitly selected capability needs a paid plan, after an authoritative allowance is spent, or when a genuine paid insight is available. Avoid automatic interruption. Check eligibility and state before prompting. Leave an obvious path back to free use.
- Show the complete localized price Apple or the active billing platform will charge, billing period, applicable trial length, first paid price and renewal conditions alongside a single purchase action for the selected plan. Verify trial eligibility. When pricing is unavailable, show a recoverable state and disable purchase.
- Support loading, pending approval, cancellation, verified activation, already active plans, restore, and subscription management. Show how to cancel and what happens to free access. Keep purchase integrations, pricing and entitlements intact unless separately authorized.
- Keep purchases and external links in protected adult areas when relevant. Keep free progress and sample play free of misleading pressure, fake scarcity, concealed terms, or repeated interruption.

## 4. Measure responsibly

- Define the eligible denominator, event, identity boundary, duplicate handling, and observation window for every claimed funnel rate. Compare actual activation, retained use, cancellations, and errors. Use platform or existing first-party sources where appropriate.
- Restrict event properties to the minimum necessary. Exclude names, emails, child profiles, education activity or answers, exact timestamps tied to children, persistent child or device IDs, and free text from product funnel events.
- Establish a baseline before testing changes. For experiments, keep treatment stable at the permitted unit, define a success metric, and guard against access, trust, retention and accessibility regressions. Child-directed experiences require a privacy review before new collection. Distinguish observed results, proxy measures, hypotheses and missing data.

## Design and prototype reviews

Design the first visit and the return visit separately. Keep the most frequent task in reach and restore the person's selection when the window changes. Remove repeated explanations when native behavior or a clearer label can do the work.

For a monetization redesign, use Figma MCP to create three editable alternatives: an outcome-led offer, a real product demonstration, and a contextual offer personalized from appropriate user activity. Cover iPhone and iPad in light and dark appearances. Connect contextual discovery, free-versus-paid comparison, eligible and ineligible offers, dismissal, purchase, trial, success, restore and management. Evaluate comprehension, task completion, accessibility, terms and reversibility. Recommend a design and record why. In a free product keep unapproved commercial ideas in clearly labeled prototypes.

Compare onboarding, core journeys, navigation, premium discovery, contextual upselling and the paywall before and after. Include actual simulator evidence for implemented Apple journeys and distinguish proposals from shipping behavior. Use the Apple Human Interface Guidelines, semantic SwiftUI components, Dynamic Type, VoiceOver, Reduce Motion and automated UI tests.

Define first launch, onboarding start and completion, first meaningful action and successful result. For commerce also define discovery, impression, dismissal, plan selection, purchase initiation, trial or paid activation, first paid renewal, cancellation and retained use. Establish the real sources and missing coverage. Run controlled experiments only with adequate data and appropriate consent. Never report a conversion lift from a prototype or test fixture.

## Review acceptance

A review must identify the user outcome and primary action, include a before/after workflow count, justify remaining friction, and cite verification. For paid features, verify free and paid boundaries, localized purchase terms, opt-out, restore, and management. For native UI, check real simulator or device runs in available relevant layouts and appearances. Declare any untested conditions and whether product outcomes remain unmeasured.
