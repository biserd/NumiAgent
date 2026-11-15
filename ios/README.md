# NumiAgent for iPhone

NumiAgent uses SwiftUI for the collection, auction valuation, checklists, and capture. Camera and photo library imports can be held on the device and retried. The signed-in workspace handles photo attribution review, catalog edits, and exports against the same account and Cloudflare backend as [numiagent.com](https://numiagent.com).

## Build

Open `NumiAgent.xcodeproj` in Xcode 26 or later. Select the shared NumiAgent scheme and an iPhone simulator. The minimum deployment target is iOS 17. Tap **Explore demo** to see sample records without an account. The demo uses sample valuations and identification results.

The GitHub workflow compiles both simulator and device builds and captures four screenshots using the Debug demo. The device build in that workflow is unsigned.

## Sign and distribute

1. Register the explicit App ID `com.numiagent.ios` under the Apple Developer team used by the Xcode project. Enable Associated Domains. Create the iOS app record in App Store Connect with that bundle ID.
2. Select the team in Xcode’s Signing & Capabilities tab. On a signed iPhone, test the email sign-in link, the paste fallback, camera permission, upload retries, photo review, valuations, and deletion using a dedicated test account.
3. Archive the Release scheme for a generic iOS device. Use **Distribute App** in Xcode Organizer to upload the signed archive to App Store Connect. Verify the build on TestFlight before submitting it.
4. Complete age rating, availability, privacy disclosures, export compliance, support information, and App Review access in App Store Connect. Use a dedicated review account that gives Apple access to the hosted workflows.

The associated domain endpoint serves the team's App ID and routes only the email sign-in URL fragment to the app. The email link also works in the browser. [Associated Domains documentation](https://developer.apple.com/documentation/xcode/supporting-associated-domains).
