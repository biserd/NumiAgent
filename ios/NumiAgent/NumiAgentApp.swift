import SwiftUI
import UIKit

enum CollectorDesign {
    static let tint = adaptive(0x174F3B, dark: 0xA1DEBC)
    static let background = adaptive(0xF6F3EC, dark: 0x151B18)
    static let surface = adaptive(0xFFFEF9, dark: 0x202924)
    static let highlight = adaptive(0xE0EDE2, dark: 0x243E31)
    static let warning = adaptive(0xF4E8D2, dark: 0x3A3222)
    static let ink = adaptive(0x172C23, dark: 0xF0F4EB)
    static let muted = adaptive(0x4E6055, dark: 0xB7C6B8)
    static let onTint = adaptive(0xFFFFFF, dark: 0x123121)
    static let photoPlate = adaptive(0x252922, dark: 0x101512)
    static let forest = Color(red: 0.08, green: 0.23, blue: 0.19)

    private static func adaptive(_ light: Int, dark: Int) -> Color {
        Color(uiColor: UIColor { traits in
            let rgb = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat(rgb >> 16 & 255) / 255,
                           green: CGFloat(rgb >> 8 & 255) / 255,
                           blue: CGFloat(rgb & 255) / 255, alpha: 1)
        })
    }
}

struct CollectorNotice: View {
    let title: String
    let message: String
    let icon: String
    var warning = false

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Label(title, systemImage: icon).font(.headline)
            Text(message).font(.subheadline).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(warning ? CollectorDesign.warning : CollectorDesign.highlight, in: .rect(cornerRadius: 14))
        .accessibilityElement(children: .combine)
    }
}

struct AddItemActions: View {
    @Environment(\.dismiss) private var dismiss
    let hasDraft: Bool
    let choose: (Bool) -> Void

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button {
                        choose(true)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Label(hasDraft ? "Resume photo draft" : "Add photos", systemImage: "camera").font(.headline)
                            Text("Use the front, back and detail views of one coin or banknote.")
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 4)
                    }
                    Button {
                        choose(false)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Label("Enter details manually", systemImage: "square.and.pencil").font(.headline)
                            Text("Create a collection record from what you already know.")
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 4)
                    }
                }
                .listRowBackground(CollectorDesign.surface)
            }
            .scrollContentBackground(.hidden)
            .background(CollectorDesign.background)
            .navigationTitle("Add item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }
}

@MainActor
final class AppSession: ObservableObject {
    enum Phase: Equatable {
        case checking, signedOut, unavailable, signedIn(Account), demo
    }

    let api = NumiAPI()
    @Published private(set) var phase: Phase = .checking
    @Published var showingLocal = false
    private var verifying = false

    func refresh() async {
        guard phase != .demo else { return }
        guard api.hasStoredSession else {
            phase = .signedOut
            return
        }
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
        showingLocal = false
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
    @StateObject private var guest = GuestStore()
    @Environment(\.scenePhase) private var scenePhase
    @State private var linkError: String?
    @State private var signInSheet = false
    @State private var restoreSheet = false
    @State private var scanOnOpen = false
    #if DEBUG
    @State private var guestAcceptanceStatus = "Running guest storage checks"
    #endif

    var body: some Scene {
        WindowGroup {
            #if DEBUG
            if let model = DeviceRecognitionBenchmark.modelArgument {
                DeviceRecognitionBenchmark(model: model)
            } else if ProcessInfo.processInfo.arguments.contains("--guest-storage-acceptance") {
                Text(guestAcceptanceStatus).task {
                    do {
                        try runGuestStorageAcceptance()
                        guestAcceptanceStatus = "Guest storage checks passed"
                    } catch { guestAcceptanceStatus = error.localizedDescription }
                }
            } else { collectorRoot }
            #else
            collectorRoot
            #endif
        }
    }

    private var collectorRoot: some View {
        root
                .tint(CollectorDesign.tint)
                .task {
                    if PreviewLaunch.screen != nil { session.openDemo() }
                    else { await session.refresh() }
                }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active {
                        guest.reload()
                        Task { await session.refresh() }
                    }
                }
                .onChange(of: session.phase) { _, phase in
                    switch phase {
                    case .signedIn, .demo: signInSheet = false
                    default: break
                    }
                }
                .sheet(isPresented: $signInSheet) { SignInScreen(session: session) }
                .sheet(isPresented: $restoreSheet) { GuestFiles(store: guest, action: .restore) }
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
            if guest.active != nil { localWorkspace(account: nil) }
            else {
                GuestWelcome(start: {
                    do { try guest.openCollection(); scanOnOpen = true }
                    catch { guest.error = error.localizedDescription }
                }, signIn: { signInSheet = true }, restore: { restoreSheet = true })
                .guestStorageAlert(guest)
            }
        case .signedIn(let account):
            if session.showingLocal { localWorkspace(account: account) }
            else { workspace(account: account).id(account.id) }
        case .demo:
            workspace(account: nil).id("demo")
        }
    }

    private func localWorkspace(account: Account?) -> some View {
        GuestWorkspace(store: guest, api: session.api,
                       accountTitle: account.map { _ in "Open account collection" },
                       openAccount: {
                           if account != nil { session.showingLocal = false }
                           else { signInSheet = true }
                       }, scanOnOpen: $scanOnOpen)
            .id(guest.activeID)
            .task {
                if guest.active == nil {
                    do { try guest.openCollection() }
                    catch { guest.error = error.localizedDescription }
                }
            }
    }

    @ViewBuilder
    private func workspace(account: Account?) -> some View {
        CollectorWorkspace(session: session, account: account)
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
        case .settings: return "Account"
        }
    }
    var icon: String {
        switch self {
        case .collection: return "square.grid.2x2"
        case .capture: return "camera"
        case .checklists: return "checklist"
        case .settings: return "person.crop.circle"
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
    @State private var requestedAddress: String?
    @State private var showLinkEntry = false
    @State private var pastedLink = ""
    @State private var busy = false
    @State private var error: String?
    @Environment(\.openURL) private var openURL
    @AccessibilityFocusState private var inboxFocused: Bool

    private var previewing: Bool { PreviewLaunch.screen == .signIn }

    var body: some View {
        NavigationStack {
            ScrollView {
                if let requestedAddress {
                    inbox(address: requestedAddress)
                        .frame(maxWidth: 480)
                        .padding(24)
                        .frame(maxWidth: .infinity)
                } else {
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
            }
            .background(CollectorDesign.background.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    private var banner: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("NumiAgent", systemImage: "circle.hexagongrid.fill")
                .font(.headline)
                .foregroundStyle(Color(red: 1, green: 0.78, blue: 0.40))
            Text("Start with one coin or banknote")
                .font(.system(.largeTitle, design: .serif, weight: .semibold))
                .accessibilityAddTraits(.isHeader)
            Text("Identify it from photos and keep what you learn with the item.")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.88))
        }
        .foregroundStyle(.white)
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(CollectorDesign.forest, in: .rect(cornerRadius: 22))
    }

    private var signInCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Sign in").font(.title2.bold()).accessibilityAddTraits(.isHeader)
            Text("Enter your email and we’ll send you a sign-in link.").foregroundStyle(.secondary)
            if session.phase == .unavailable {
                Button("Retry connection") { Task { await session.refresh() } }.buttonStyle(.bordered)
            }
            Text("Email address").font(.subheadline.weight(.semibold))
            TextField("you@example.com", text: $email)
                .accessibilityLabel("Email address")
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
            .disabled(busy)

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
            if showLinkEntry { pasteLink }
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
        .background(CollectorDesign.surface, in: .rect(cornerRadius: 22))
    }

    private func inbox(address: String) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Image(systemName: "envelope").font(.largeTitle).foregroundStyle(.tint)
            Text("Check your email").font(.largeTitle.bold()).accessibilityAddTraits(.isHeader)
                .accessibilityFocused($inboxFocused)
            Text("We sent a sign-in link to \(address). Open it on this device within 10 minutes.")
            Button {
                // The standard Mail URL opens the app when it is available.
                guard let mail = URL(string: "message://") else { return }
                openURL(mail) { accepted in
                    if !accepted { error = "Open your email app to find the sign-in link, then return here." }
                }
            } label: {
                Label("Open email", systemImage: "envelope").frame(maxWidth: .infinity, minHeight: 32)
            }
            .buttonStyle(.borderedProminent)
            Button("Paste sign-in link") { showLinkEntry.toggle() }.buttonStyle(.bordered)
            if showLinkEntry { pasteLink }
            CollectorNotice(title: "Didn’t get the email?",
                            message: "Check spam or send a new link.", icon: "envelope.badge")
            Button("Resend link") { Task { await requestLink() } }.disabled(busy)
            Button("Change email address") {
                requestedAddress = nil
                showLinkEntry = false
                error = nil
            }
            .disabled(busy)
            if let error { Text(error).font(.footnote).foregroundStyle(.secondary) }
        }
        .padding(20)
        .background(CollectorDesign.surface, in: .rect(cornerRadius: 22))
        .onAppear { inboxFocused = true }
    }

    private var pasteLink: some View {
        VStack(alignment: .leading, spacing: 8) {
            SecureField("Paste sign-in link", text: $pastedLink)
                .textContentType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .textFieldStyle(.roundedBorder)
            Button("Open sign-in link") { Task { await signIn() } }
                .buttonStyle(.borderedProminent)
                .disabled(busy || pastedLink.isBlank)
        }
    }

    private func requestLink() async {
        let address = requestedAddress ?? email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !busy else { return }
        guard address.contains("@"), address.count <= 250 else {
            error = "Enter a valid email address."
            emailFocused = true
            return
        }
        emailFocused = false
        busy = true
        error = nil
        defer { busy = false }
        do {
            if !previewing { try await session.api.requestSignIn(email: address) }
            if requestedAddress != nil { error = "Link sent again. Check your inbox." }
            requestedAddress = address
            showLinkEntry = false
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

struct AccountScreen: View {
    @ObservedObject var session: AppSession
    let account: Account?
    var inWorkspace = false
    var showClose = false
    @Environment(\.dismiss) private var dismiss
    @State private var delete = false
    @State private var busy = false
    @State private var error: String?
    @State private var externalPhotoSearch: Bool?
    @State private var savingPhotoSearch = false

    var body: some View {
        if inWorkspace || showClose { form }
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
                    Button("On this iPhone", systemImage: "iphone") { session.showingLocal = true }
                    Button("Delete account", role: .destructive) { delete = true }.disabled(busy)
                } else {
                    Text("Demo collection")
                    Button("Leave demo") { Task { await session.closeDemo() } }
                }
                if let error { Text(error).font(.footnote).foregroundStyle(.red) }
            }
            if account != nil {
                Section {
                    if let enabled = externalPhotoSearch {
                        Toggle("Search with external photos", isOn: Binding(get: { enabled }, set: { value in
                            Task { await changePhotoSearch(value) }
                        }))
                        .disabled(savingPhotoSearch)
                    } else {
                        Button("Load photo search setting") { Task { await loadPhotoSearch() } }
                    }
                } header: {
                    Text("Photo identification")
                } footer: {
                    Text("When enabled, NumiAgent can send tightly cropped coin photos to Syllogeum and Google Cloud Vision to look for similar coins. You can turn this off at any time.")
                }
            }
            Section("Help") {
                Link("Contact NumiAgent", destination: NumiAPI.url("/contact"))
                Link("Privacy policy", destination: NumiAPI.url("/privacy"))
                Link("Terms of service", destination: NumiAPI.url("/terms"))
            }
        }
        .scrollContentBackground(.hidden)
        .background(CollectorDesign.background)
        .navigationTitle("Account")
        .task(id: account?.id) { if account != nil { await loadPhotoSearch() } }
        .toolbar {
            if showClose {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
            }
        }
        .confirmationDialog("Delete your NumiAgent account?", isPresented: $delete, titleVisibility: .visible) {
            Button("Delete account permanently", role: .destructive) {
                Task { await endSession(deleteAccount: true) }
            }
        } message: {
            Text("Your online catalog and photos will be scheduled for deletion. This cannot be undone.")
        }
    }

    private func loadPhotoSearch() async {
        do {
            let preference: NumiAPI.PhotoSearchPreference = try await session.api.get("/me/photo-search")
            externalPhotoSearch = preference.enabled
        } catch { self.error = error.localizedDescription }
    }

    private func changePhotoSearch(_ enabled: Bool) async {
        guard !savingPhotoSearch else { return }
        savingPhotoSearch = true
        error = nil
        defer { savingPhotoSearch = false }
        do {
            try await session.api.setExternalPhotoSearch(enabled)
            externalPhotoSearch = enabled
        } catch { self.error = error.localizedDescription }
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
