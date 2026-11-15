import SwiftUI
import WebKit

enum WorkspaceRoute: String, Identifiable {
    case signIn, collection, imports, themes, settings

    var id: Self { self }
    var url: URL { NumiAPI.url("/app", fragment: self == .signIn ? nil : rawValue) }
}

struct WorkspaceSheet: View {
    @Environment(\.dismiss) private var dismiss
    let route: WorkspaceRoute
    let api: NumiAPI
    var changed: () -> Void = {}

    var body: some View {
        NavigationStack {
            WorkspaceWebView(url: route.url, store: api.webData, changed: changed)
                .navigationTitle(route == .signIn ? "Request a sign-in link" : "NumiAgent workspace")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
                }
        }
    }
}

private struct WorkspaceWebView: UIViewRepresentable {
    let url: URL
    let store: WKWebsiteDataStore
    let changed: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(store: store.httpCookieStore, changed: changed) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = store
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        store.httpCookieStore.add(context.coordinator)
        view.load(URLRequest(url: url))
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        context.coordinator.changed = changed
    }

    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        coordinator.store.remove(coordinator)
        view.stopLoading()
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKHTTPCookieStoreObserver {
        let store: WKHTTPCookieStore
        var changed: () -> Void

        init(store: WKHTTPCookieStore, changed: @escaping () -> Void) {
            self.store = store
            self.changed = changed
        }

        func cookiesDidChange(in cookieStore: WKHTTPCookieStore) { changed() }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { changed() }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let destination = action.request.url else {
                decisionHandler(.cancel)
                return
            }
            if action.targetFrame?.isMainFrame == false {
                decisionHandler(.allow)
            } else if NumiAPI.isSite(destination), action.targetFrame != nil {
                decisionHandler(.allow)
            } else {
                decisionHandler(.cancel)
                if NumiAPI.isSite(destination) {
                    webView.load(action.request)
                } else if action.navigationType == .linkActivated && destination.scheme == "https" {
                    UIApplication.shared.open(destination)
                }
            }
        }

        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
            guard frame.isMainFrame, let url = frame.request.url, NumiAPI.isSite(url),
                  let presenter = presenter(for: webView) else {
                completionHandler(false)
                return
            }
            let prompt = UIAlertController(title: "NumiAgent", message: message, preferredStyle: .alert)
            prompt.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
            prompt.addAction(UIAlertAction(title: "Continue", style: .default) { _ in completionHandler(true) })
            presenter.present(prompt, animated: true)
        }

        private func presenter(for view: UIView) -> UIViewController? {
            var responder: UIResponder? = view
            while let current = responder {
                if let controller = current as? UIViewController { return controller }
                responder = current.next
            }
            return nil
        }
    }
}
