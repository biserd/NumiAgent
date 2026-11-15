# NumiAgent for iPhone and iPad

NumiAgent uses SwiftUI for sign-in, catalog editing, photo import and review, auction valuations, checklists, and data exports. It uses the same account and Cloudflare API as [numiagent.com](https://numiagent.com). Draft photos stay on the device until upload, and users can choose whether to request identification. iOS presents Cloudflare’s security check in a system authentication sheet when requesting an email link. The app stores its session in the iOS Keychain.

## Build

Open `NumiAgent.xcodeproj` in Xcode 26 or later. Select the shared NumiAgent scheme and an iPhone or iPad simulator. The minimum deployment target is iOS and iPadOS 17. Tap **Explore demo** to see sample records without an account. The demo uses sample valuations and identification results.

iPad uses a native sidebar with a list and detail view for the catalog, photo imports, and checklists. The layout adapts when the window narrows. Specimen photos can appear side by side where the detail column has room.

The demo catalog displays two public-domain coin photographs from The Met. [Octavian](https://www.metmuseum.org/art/collection/search/248037) · [Marcus Antonius](https://www.metmuseum.org/art/collection/search/248031).

The GitHub workflow verifies the universal device build and launches the Debug demo on iPhone and iPad simulators. The run includes iPhone screenshots and iPad screenshots in portrait and landscape. The device build in that workflow is unsigned.

## Sign and distribute

1. Register the explicit App ID `com.numiagent.ios` under the Apple Developer team used by the Xcode project. Enable Associated Domains. Create the iOS app record in App Store Connect with that bundle ID.
2. Select the team in Xcode’s Signing & Capabilities tab. On signed iPhone and iPad devices, test the email sign-in link, the paste fallback, camera permission, upload retries, photo review, valuations, and deletion using a dedicated test account.
3. Archive the Release scheme for a generic iOS device. Use **Distribute App** in Xcode Organizer to upload the signed archive to App Store Connect. Verify the build on TestFlight before submitting it.
4. Complete age rating, availability, privacy disclosures, export compliance, support information, and App Review access in App Store Connect. Use a dedicated review account that gives Apple access to the signed-in features.

The associated domain endpoint serves the team's App ID and routes only the email sign-in URL fragment to the app. The email link also works in the browser. [Associated Domains documentation](https://developer.apple.com/documentation/xcode/supporting-associated-domains).

### Upload from GitHub without a local Mac

Use the manually triggered **Upload NumiAgent to TestFlight** workflow on `main`. Once the App Store Connect record exists, configure these secrets in the `app-store` environment:

| Secret | Value |
| --- | --- |
| `IOS_CERTIFICATE_BASE64` | Base64-encoded Apple Distribution PKCS#12 certificate and private key |
| `IOS_CERTIFICATE_PASSWORD` | Password for that PKCS#12 file |
| `IOS_PROFILE_BASE64` | Base64-encoded App Store distribution provisioning profile for `com.numiagent.ios` |
| `ASC_KEY_ID` | App Store Connect API key ID with permission to upload builds |
| `ASC_ISSUER_ID` | App Store Connect issuer ID |
| `ASC_PRIVATE_KEY` | Contents of the API key’s `.p8` file |

This workflow uploads the signed build to App Store Connect. Configure the TestFlight test group and submit for App Review separately.
