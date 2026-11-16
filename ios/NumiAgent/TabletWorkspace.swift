import SwiftUI

/// Keeps the selected record available when search or pagination changes the visible rows.
struct WorkspaceListSelection<Item: Identifiable> {
    let item: Binding<Item?>
    let revision: Int

    func matching(_ items: [Item]) -> Binding<Item.ID?> {
        Binding(
            get: { item.wrappedValue?.id },
            set: { id in
                guard let id else { item.wrappedValue = nil; return }
                if let match = items.first(where: { $0.id == id }) {
                    item.wrappedValue = match
                }
            }
        )
    }
}

struct TabletWorkspace: View {
    private enum SettingsPage: String {
        case account, exports
    }

    @ObservedObject var session: AppSession
    let account: Account?
    @StateObject private var capture: CaptureDraftStore
    @State private var section: CollectorTab? = PreviewLaunch.tab
    @State private var columns: NavigationSplitViewVisibility = .all
    @State private var compactColumn: NavigationSplitViewColumn = .content
    @State private var specimen: Specimen?
    @State private var checklist: ThemeSummary?
    @State private var importID: String?
    @State private var settingsPage: SettingsPage? = .account
    @State private var catalogRevision = 0
    @State private var checklistRevision = 0
    @State private var importsRevision = 0
    @State private var search = ""
    @State private var openedItemID: String?
    @State private var checklistLabel: String?

    private var demo: Bool { account == nil }
    private var activeSection: CollectorTab { section ?? .collection }

    init(session: AppSession, account: Account?) {
        self.session = session
        self.account = account
        _capture = StateObject(wrappedValue: CaptureDraftStore(account: account))
        if account == nil {
            switch PreviewLaunch.screen {
            case .collection, .valuation:
                _specimen = State(initialValue: DemoCollection.specimens.first)
            case .checklists:
                _checklist = State(initialValue: DemoCollection.theme)
            default:
                break
            }
        }
    }

    var body: some View {
        NavigationSplitView(columnVisibility: $columns, preferredCompactColumn: $compactColumn) {
            List(CollectorTab.allCases, selection: $section) { area in
                NavigationLink(value: area) {
                    Label(area.title, systemImage: area.icon)
                }
                .accessibilityIdentifier("workspace-\(area)")
            }
            .listStyle(.sidebar)
            .navigationTitle("NumiAgent")
            .navigationSplitViewColumnWidth(min: 175, ideal: 200, max: 250)
        } content: {
            workspaceList
                .navigationSplitViewColumnWidth(min: 248, ideal: 300, max: 390)
        } detail: {
            NavigationStack {
                workspaceDetail
            }
            .id(detailRoute)
        }
        .navigationSplitViewStyle(.balanced)
        .onChange(of: section) { _, newValue in
            if newValue == .collection {
                catalogRevision += 1
                compactColumn = specimen == nil ? .content : .detail
            } else if newValue == .capture {
                compactColumn = importID == nil && !capture.hasDraft ? .content : .detail
            } else if newValue != nil { compactColumn = .content }
        }
    }

    @ViewBuilder
    private var workspaceList: some View {
        switch activeSection {
        case .collection:
            CatalogScreen(api: session.api, demo: demo, capture: capture, query: $search,
                          openedItemID: $openedItemID, openCapture: openCapture, openAccount: nil,
                          itemCreated: openNewItem,
                          workspaceSelection: .init(item: $specimen, revision: catalogRevision))
        case .capture:
            ImportHistory(api: session.api, store: capture, selection: $importID, revision: importsRevision, demo: demo) {
                importID = nil
                compactColumn = .detail
            }
        case .checklists:
            ThemesScreen(api: session.api, demo: demo,
                         workspaceSelection: .init(item: $checklist, revision: checklistRevision))
        case .settings:
            List(selection: $settingsPage) {
                NavigationLink(value: SettingsPage.account) { Label("Account", systemImage: "person.crop.circle") }
                if account != nil {
                    NavigationLink(value: SettingsPage.exports) { Label("Account and exports", systemImage: "square.and.arrow.up") }
                }
            }
            .navigationTitle("Account")
        }
    }

    @ViewBuilder
    private var workspaceDetail: some View {
        switch activeSection {
        case .collection:
            if let specimen {
                SpecimenScreen(item: specimen, api: session.api, demo: demo, expanded: true) {
                    catalogRevision += 1
                } onDelete: {
                    self.specimen = nil
                    catalogRevision += 1
                    compactColumn = .content
                }
            } else if let openedItemID {
                ItemByIDScreen(api: session.api, id: openedItemID, demo: demo, expanded: true) {
                    catalogRevision += 1
                }
            } else {
                ContentUnavailableView("Select a specimen", systemImage: CollectorTab.collection.icon,
                                       description: Text("Choose a coin or banknote to see its photos and valuation."))
            }
        case .capture:
            if let importID {
                ImportReview(api: session.api, batchID: importID, expanded: true,
                             previewBatch: demo ? PhotoImport.demoAutomatic : nil,
                             resumeUpload: capture.draftBatchID == importID ? { openCapture(nil) } : nil)
            } else {
                CaptureScreen(api: session.api, account: account, store: capture, reviewID: $importID,
                              onUpload: receivedUpload, onSave: openNewItem, checklistLabel: checklistLabel)
            }
        case .checklists:
            if let checklist {
                ThemeScreen(api: session.api, theme: checklist, demo: demo, onChange: {
                    checklistRevision += 1
                }, onDelete: {
                    self.checklist = nil
                    checklistRevision += 1
                    compactColumn = .content
                }, captureForSlot: captureForSlot, findForSlot: findForSlot)
            } else {
                ContentUnavailableView("Select a checklist", systemImage: CollectorTab.checklists.icon,
                                       description: Text("Choose a checklist to see what you own and which pieces are missing."))
            }
        case .settings:
            if settingsPage == .exports, account != nil {
                NativeAccountTools(api: session.api)
            } else {
                AccountScreen(session: session, account: account, inWorkspace: true)
            }
        }
    }

    private var detailRoute: String {
        switch activeSection {
        case .collection: return "collection/" + (specimen?.id ?? openedItemID ?? "")
        case .capture: return "capture/" + (importID ?? "")
        case .checklists: return "checklists/" + (checklist?.id ?? "")
        case .settings: return "settings/" + (settingsPage ?? .account).rawValue
        }
    }

    private func receivedUpload(_ id: String) {
        importsRevision += 1
        if importID == nil {
            importID = id
            if activeSection == .capture { compactColumn = .detail }
        }
    }

    private func openCapture(_ batchID: String?) {
        checklistLabel = nil
        importID = batchID
        section = .capture
        compactColumn = .detail
    }

    private func captureForSlot(_ label: String) {
        openCapture(nil)
        checklistLabel = label
    }

    private func findForSlot(_ term: String) {
        search = term
        specimen = nil
        openedItemID = nil
        section = .collection
        compactColumn = .content
    }

    private func openNewItem(_ id: String) {
        checklistLabel = nil
        search = ""
        specimen = nil
        openedItemID = id
        section = .collection
        compactColumn = .detail
        catalogRevision += 1
        Task {
            if let result: Specimen = try? await session.api.get("/items/" + id),
               activeSection == .collection, openedItemID == id, specimen == nil {
                specimen = result
                openedItemID = nil
                compactColumn = .detail
            }
        }
    }
}
