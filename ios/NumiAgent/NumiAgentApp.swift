import SwiftUI
import AuthenticationServices
import UIKit

@MainActor
final class AppSession: ObservableObject {
    enum Phase: Equatable {
        case checking, signedOut, unavailable, signedIn(Account), demo
    }

    let api = NumiAPI()
    @Published private(set) var phase: Phase = .checking
    private var verifying = false

    func refresh() async {
        guard phase != .demo else { return }
        do {
            let account: Account = try await api.get("/me")
            if phase != .demo { phase = .signedIn(account) }
        } catch let error as NumiError where error.isUnauthorized {
            if phase != .demo { phase = .signedOut }
        } catch {
            if phase == .checking { phase = .unavailable }
        }
    }

    func signIn(_ url: URL) async throws {
        guard !verifying else { return }
        verifying = true
        defer { verifying = false }
        try await api.verify(url)
        let account: Account = try await api.get("/me")
        phase = .signedIn(account)
    }

    func openDemo() { phase = .demo }
    func closeDemo() async { phase = .checking; await refresh() }

    func signOut(deleteAccount: Bool) async throws {
        if deleteAccount, case .signedIn(let account) = phase {
            try removeCaptureDrafts(for: account.id)
        }
        try await api.signOut(deleteAccount: deleteAccount)
        phase = .signedOut
    }
}

@main
@MainActor
struct NumiAgentApp: App {
    @StateObject private var session = AppSession()
    @Environment(\.scenePhase) private var scenePhase
    @State private var linkError: String?

    var body: some Scene {
        WindowGroup {
            root
                .tint(Color(red: 0.45, green: 0.30, blue: 0.14))
                .task {
                    if PreviewLaunch.screen != nil { session.openDemo() }
                    else { await session.refresh() }
                }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { Task { await session.refresh() } }
                }
                .onOpenURL(perform: openLink)
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL { openLink(url) }
                }
                .alert("Could not sign in", isPresented: Binding(
                    get: { linkError != nil }, set: { if !$0 { linkError = nil } }
                )) { Button("OK", role: .cancel) {} } message: {
                    Text(linkError ?? "")
                }
        }
    }

    @ViewBuilder
    private var root: some View {
        switch session.phase {
        case .checking:
            ProgressView("Opening NumiAgent")
        case .signedOut, .unavailable:
            SignInScreen(session: session)
        case .signedIn(let account):
            workspace(account: account).id(account.id)
        case .demo:
            workspace(account: nil).id("demo")
        }
    }

    @ViewBuilder
    private func workspace(account: Account?) -> some View {
        if UIDevice.current.userInterfaceIdiom == .pad {
            TabletWorkspace(session: session, account: account)
        } else {
            CollectorTabs(session: session, account: account)
        }
    }

    private func openLink(_ url: URL) {
        guard (try? NumiAPI.signInToken(from: url)) != nil else { return }
        Task {
            do { try await session.signIn(url) }
            catch { linkError = error.localizedDescription }
        }
    }
}

enum CollectorTab: Hashable, CaseIterable, Identifiable {
    case collection, capture, checklists, settings

    var id: Self { self }
    var title: String {
        switch self {
        case .collection: return "Collection"
        case .capture: return "Capture"
        case .checklists: return "Checklists"
        case .settings: return "Settings"
        }
    }
    var icon: String {
        switch self {
        case .collection: return "square.grid.2x2"
        case .capture: return "camera"
        case .checklists: return "checklist"
        case .settings: return "gearshape"
        }
    }
}

enum PreviewLaunch {
    enum Screen: String { case collection, capture, valuation, checklists }

    static var screen: Screen? {
        #if DEBUG
        ProcessInfo.processInfo.arguments.compactMap { argument in
            argument.hasPrefix("--preview-") ? Screen(rawValue: String(argument.dropFirst(10))) : nil
        }.first
        #else
        nil
        #endif
    }

    static var tab: CollectorTab {
        switch screen {
        case .capture: return .capture
        case .checklists: return .checklists
        default: return .collection
        }
    }
}

private struct SignInScreen: View {
    @ObservedObject var session: AppSession
    @StateObject private var challenge = SignInChallenge()
    @State private var email = ""
    @State private var requested = false
    @State private var pastedLink = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Image(systemName: "circle.hexagongrid.fill")
                        .font(.system(size: 38))
                        .foregroundStyle(.tint)
                        .accessibilityHidden(true)
                    Text("Know what’s in your collection.")
                        .font(.system(.largeTitle, design: .serif, weight: .semibold))
                        .accessibilityAddTraits(.isHeader)
                    Text("Photograph coins and banknotes, research comparable sales, and track the missing pieces in your sets.")
                        .foregroundStyle(.secondary)
                    if session.phase == .unavailable {
                        Button("Retry connection") { Task { await session.refresh() } }
                    }
                    TextField("Email address", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .textFieldStyle(.roundedBorder)
                    Button("Email me a sign-in link") { Task { await requestLink() } }
                        .buttonStyle(.borderedProminent)
                        .disabled(busy || email.isBlank || !email.contains("@"))
                    if requested {
                        Text("Check your email for a sign-in link. Open it on this device or paste it below.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Already have a link?").font(.headline)
                        Text("Copy the sign-in link from your email and paste it here.")
                            .font(.footnote).foregroundStyle(.secondary)
                        SecureField("Paste sign-in link", text: $pastedLink)
                            .textContentType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .textFieldStyle(.roundedBorder)
                        Button("Sign in with link") { Task { await signIn() } }
                            .disabled(busy || pastedLink.isEmpty)
                    }
                    if let error { Text(error).foregroundStyle(.red).font(.footnote) }
                    Button("Explore demo") { session.openDemo() }
                    Link("Privacy policy", destination: NumiAPI.url("/privacy")).font(.footnote)
                }
                .padding(24)
                .frame(maxWidth: 550, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
            .navigationTitle("NumiAgent")
        }
    }

    private func requestLink() async {
        let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
        busy = true
        error = nil
        requested = false
        defer { busy = false }
        do {
            let response = try await challenge.verify()
            try await session.api.requestSignIn(email: address, challenge: response)
            requested = true
        } catch let failure as ASWebAuthenticationSessionError where failure.code == .canceledLogin {
        } catch { self.error = error.localizedDescription }
    }

    private func signIn() async {
        guard let url = URL(string: pastedLink.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            error = NumiError.invalidLink.localizedDescription
            return
        }
        pastedLink = ""
        error = nil
        busy = true
        defer { busy = false }
        do { try await session.signIn(url) }
        catch { self.error = error.localizedDescription }
    }
}

private struct CollectorTabs: View {
    @ObservedObject var session: AppSession
    let account: Account?
    @State private var selectedTab = PreviewLaunch.tab

    private var demo: Bool { account == nil }

    var body: some View {
        TabView(selection: $selectedTab) {
            CatalogScreen(api: session.api, demo: demo)
                .tabItem { Label(CollectorTab.collection.title, systemImage: CollectorTab.collection.icon) }
                .tag(CollectorTab.collection)
            CaptureScreen(api: session.api, account: account)
                .tabItem { Label(CollectorTab.capture.title, systemImage: CollectorTab.capture.icon) }
                .tag(CollectorTab.capture)
            ThemesScreen(api: session.api, demo: demo)
                .tabItem { Label(CollectorTab.checklists.title, systemImage: CollectorTab.checklists.icon) }
                .tag(CollectorTab.checklists)
            AccountScreen(session: session, account: account)
                .tabItem { Label(CollectorTab.settings.title, systemImage: CollectorTab.settings.icon) }
                .tag(CollectorTab.settings)
        }
    }
}

struct AccountScreen: View {
    @ObservedObject var session: AppSession
    let account: Account?
    var inWorkspace = false
    @State private var delete = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        if inWorkspace { form }
        else { NavigationStack { form } }
    }

    private var form: some View {
        Form {
            Section("Account") {
                if let account {
                    Text(account.email)
                    if !inWorkspace {
                        NavigationLink("Account and exports") { NativeAccountTools(api: session.api) }
                    }
                    Button("Sign out") { Task { await endSession(deleteAccount: false) } }
                        .disabled(busy)
                    Button("Delete account", role: .destructive) { delete = true }.disabled(busy)
                } else {
                    Text("Demo collection")
                    Button("Leave demo") { Task { await session.closeDemo() } }
                }
                if let error { Text(error).font(.footnote).foregroundStyle(.red) }
            }
            Section("Help") {
                Link("Contact NumiAgent", destination: NumiAPI.url("/contact"))
                Link("Privacy policy", destination: NumiAPI.url("/privacy"))
                Link("Terms of service", destination: NumiAPI.url("/terms"))
            }
        }
        .navigationTitle("Settings")
        .confirmationDialog("Delete your NumiAgent account?", isPresented: $delete, titleVisibility: .visible) {
            Button("Delete account permanently", role: .destructive) {
                Task { await endSession(deleteAccount: true) }
            }
        } message: {
            Text("Your online catalog and photos will be scheduled for deletion. This cannot be undone.")
        }
    }

    private func endSession(deleteAccount: Bool) async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            try await session.signOut(deleteAccount: deleteAccount)
        } catch {
            self.error = error.localizedDescription
        }
    }
}
