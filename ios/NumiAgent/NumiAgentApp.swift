import SwiftUI
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
        if PreviewLaunch.screen == .signIn {
            SignInScreen(session: session)
        } else {
            sessionScreen
        }
    }

    @ViewBuilder
    private var sessionScreen: some View {
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
    enum Screen: String {
        case collection, capture, valuation, checklists
        case signIn = "sign-in"
        case photoReview = "photo-review"
    }

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
        case .capture, .photoReview: return .capture
        case .checklists: return .checklists
        default: return .collection
        }
    }
}

private struct SignInScreen: View {
    @ObservedObject var session: AppSession
    @FocusState private var emailFocused: Bool
    @State private var email = ""
    @State private var requested = false
    @State private var showLinkEntry = false
    @State private var pastedLink = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: 24) {
                        banner.frame(minWidth: 280, maxWidth: 370)
                        signInCard.frame(minWidth: 320, maxWidth: 460)
                    }
                    VStack(spacing: 18) {
                        banner
                        signInCard
                    }
                    .frame(maxWidth: 480)
                }
                .padding(20)
                .frame(maxWidth: 900)
                .frame(maxWidth: .infinity)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    private var banner: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("NumiAgent", systemImage: "circle.hexagongrid.fill")
                .font(.headline)
                .foregroundStyle(Color(red: 1, green: 0.78, blue: 0.40))
            Text("Your collection, in focus.")
                .font(.system(.largeTitle, design: .serif, weight: .semibold))
                .accessibilityAddTraits(.isHeader)
            Text("Identify coins and banknotes, compare auction sales, and keep track of the pieces you’re missing.")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.88))
        }
        .foregroundStyle(.white)
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LinearGradient(colors: [
            Color(red: 0.06, green: 0.24, blue: 0.20), Color(red: 0.12, green: 0.32, blue: 0.23)
        ], startPoint: .topLeading, endPoint: .bottomTrailing), in: .rect(cornerRadius: 22))
    }

    private var signInCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Sign in").font(.title2.bold()).accessibilityAddTraits(.isHeader)
            Text("Enter your email and we’ll send you a sign-in link.").foregroundStyle(.secondary)
            if session.phase == .unavailable {
                Button("Retry connection") { Task { await session.refresh() } }.buttonStyle(.bordered)
            }
            TextField("Email address", text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($emailFocused)
                .padding(12)
                .background(Color(uiColor: .tertiarySystemFill), in: .rect(cornerRadius: 10))
                .submitLabel(.go)
                .onSubmit { if !busy { Task { await requestLink() } } }

            Button {
                Task { await requestLink() }
            } label: {
                Label(busy ? "Please wait…" : "Send sign-in link", systemImage: "envelope.fill")
                    .frame(maxWidth: .infinity, minHeight: 32)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(red: 0.08, green: 0.34, blue: 0.25))
            .disabled(busy)

            if requested {
                Label("Check your inbox. Open the link on this device or paste it below. It expires in 10 minutes.",
                      systemImage: "envelope.badge.shield.half.filled")
                    .font(.subheadline)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.green.opacity(0.12), in: .rect(cornerRadius: 10))
            }
            if let error {
                Label(error, systemImage: "exclamationmark.circle.fill")
                    .font(.footnote).foregroundStyle(.red)
            }

            Button {
                showLinkEntry.toggle()
            } label: {
                Label("I already have a link", systemImage: "link")
                    .frame(maxWidth: .infinity, minHeight: 28)
            }
            .buttonStyle(.bordered)
            if showLinkEntry {
                SecureField("Paste sign-in link", text: $pastedLink)
                    .textContentType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .textFieldStyle(.roundedBorder)
                Button("Open sign-in link") { Task { await signIn() } }
                    .buttonStyle(.borderedProminent)
                    .disabled(busy || pastedLink.isBlank)
            }
            Button {
                session.openDemo()
            } label: {
                Label("Explore the demo", systemImage: "square.grid.2x2")
                    .frame(maxWidth: .infinity, minHeight: 28)
            }
            .buttonStyle(.bordered)
            Link("Privacy policy", destination: NumiAPI.url("/privacy")).font(.footnote)
        }
        .padding(20)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: .rect(cornerRadius: 22))
    }

    private func requestLink() async {
        let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !busy else { return }
        guard address.contains("@"), address.count <= 250 else {
            error = "Enter a valid email address."
            emailFocused = true
            return
        }
        emailFocused = false
        busy = true
        error = nil
        requested = false
        defer { busy = false }
        do {
            try await session.api.requestSignIn(email: address)
            requested = true
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
