import Foundation
import WebKit

struct Account: Decodable, Equatable {
    let id: String
    let email: String
}

struct Specimen: Decodable, Identifiable {
    struct Details: Decodable {
        var metal: String? = nil
        var mint: String? = nil
        var weightG: Double? = nil
    }

    let id: String
    let title: String
    let type: String
    let ruler: String
    let issuer: String
    let denomination: String
    let year: String
    let reference: String
    let grade: String
    let notes: String
    let photo: String?
    let details: Details?

    var subtitle: String {
        [ruler.isEmpty ? issuer : ruler, year].filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

struct CollectionPage: Decodable {
    let items: [Specimen]
    let next: Int?
}

struct Valuation: Decodable {
    struct Range: Decodable {
        let low: Double
        let median: Double
        let high: Double
    }

    struct Sale: Decodable, Identifiable {
        let id: String
        let url: URL
        let house: String
        let auction: String
        let lot: String
        let date: String
        let amount: Double
        let currency: String
        let basis: String
        let premium: Double?
    }

    let currency: String
    let range: Range?
    let evidence: [Sale]
    let used: [String]
}

struct ThemeSummary: Decodable, Identifiable {
    let id: String
    let name: String
}

struct ThemeDetails: Decodable {
    struct Slot: Decodable {
        struct Match: Decodable, Identifiable {
            let id: String
            let title: String
            let hasReference: Bool
        }

        let label: String
        let owned: [Match]
    }

    let name: String
    let slots: [Slot]
    let owned: Int
    let percent: Int
    let missingReferences: Int
}

enum NumiError: LocalizedError {
    case invalidLink
    case invalidResponse
    case request(Int, String)

    var errorDescription: String? {
        switch self {
        case .invalidLink:
            return "Paste the complete NumiAgent sign-in link from your email."
        case .invalidResponse:
            return "NumiAgent returned an unexpected response. Please try again."
        case .request(_, let message):
            return message
        }
    }

    var isUnauthorized: Bool {
        if case .request(401, _) = self { return true }
        return false
    }
}

private final class APIRedirectDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping @Sendable (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}

@MainActor
final class NumiAPI {
    nonisolated static let origin = "https://numiagent.com"
    private static let cookieName = "__Host-numis_session"
    let webData = WKWebsiteDataStore.default()
    private let network: URLSession

    init() {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.httpCookieStorage = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 35
        network = URLSession(configuration: configuration, delegate: APIRedirectDelegate(), delegateQueue: nil)
    }

    nonisolated static func url(_ path: String, fragment: String? = nil) -> URL {
        var components = URLComponents(string: origin)!
        components.path = path
        components.fragment = fragment
        return components.url!
    }

    nonisolated static func isSite(_ url: URL) -> Bool {
        url.scheme == "https" && url.host == "numiagent.com" &&
            (url.port == nil || url.port == 443) && url.user == nil && url.password == nil
    }

    nonisolated static func signInToken(from link: URL) throws -> String {
        guard isSite(link), link.path == "/app", link.query == nil,
              let fragment = link.fragment, fragment.hasPrefix("signin=") else {
            throw NumiError.invalidLink
        }
        let token = String(fragment.dropFirst(7))
        guard token.utf8.count == 64, token.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }) else {
            throw NumiError.invalidLink
        }
        return token
    }

    private func cookies() async -> [HTTPCookie] {
        let all: [HTTPCookie] = await withCheckedContinuation { continuation in
            webData.httpCookieStore.getAllCookies { continuation.resume(returning: $0) }
        }
        return all.filter { $0.name == Self.cookieName && $0.domain == "numiagent.com" &&
            $0.path == "/" && $0.isSecure && ($0.expiresDate ?? .distantFuture) > Date() }
    }

    private func send(
        _ path: String,
        method: String = "GET",
        query: [URLQueryItem] = [],
        body: Data? = nil,
        type: String = "application/json",
        authenticated: Bool = true
    ) async throws -> (Data, HTTPURLResponse) {
        var components = URLComponents(string: Self.origin)!
        components.path = "/api/v1" + path
        if !query.isEmpty { components.queryItems = query }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.httpBody = body
        request.setValue(Self.origin, forHTTPHeaderField: "Origin")
        if body != nil { request.setValue(type, forHTTPHeaderField: "Content-Type") }
        if let cookie = await cookies().first {
            request.setValue(HTTPCookie.requestHeaderFields(with: [cookie])["Cookie"], forHTTPHeaderField: "Cookie")
        } else if authenticated {
            throw NumiError.request(401, "Sign in to continue.")
        }
        let (data, response) = try await network.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw NumiError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            struct Failure: Decodable { let error: String }
            let message = (try? JSONDecoder().decode(Failure.self, from: data))?.error
            throw NumiError.request(http.statusCode, message ?? "NumiAgent could not complete this request.")
        }
        return (data, http)
    }

    func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        let (data, _) = try await send(path, query: query)
        return try JSONDecoder().decode(T.self, from: data)
    }

    func verify(_ link: URL) async throws {
        let token = try Self.signInToken(from: link)
        let body = try JSONEncoder().encode(["token": token])
        let (_, response) = try await send("/auth/verify", method: "POST", body: body, authenticated: false)
        let headers = response.allHeaderFields.reduce(into: [String: String]()) { map, header in
            if let key = header.key as? String, let value = header.value as? String { map[key] = value }
        }
        guard let cookie = HTTPCookie.cookies(withResponseHeaderFields: headers, for: Self.url("/"))
            .first(where: { $0.name == Self.cookieName && $0.domain == "numiagent.com" && $0.isSecure && $0.path == "/" }) else {
            throw NumiError.invalidResponse
        }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            webData.httpCookieStore.setCookie(cookie) { continuation.resume() }
        }
    }

    func signOut(deleteAccount: Bool) async throws {
        if deleteAccount {
            _ = try await send("/me", method: "DELETE", body: JSONEncoder().encode(["confirm": "DELETE"]))
        } else {
            do { _ = try await send("/me/signout", method: "POST") }
            catch let error as NumiError where error.isUnauthorized {}
        }
        for cookie in await cookies() {
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                webData.httpCookieStore.delete(cookie) { continuation.resume() }
            }
        }
    }

    func photo(_ id: String) async throws -> Data {
        let (data, _) = try await send("/photos/" + id)
        return data
    }

    func createImport(id: UUID, name: String, analyze: Bool) async throws {
        struct Batch: Encodable {
            let id: String
            let label: String
            let analyze: Bool
            let consent: Bool
        }
        let registration = Batch(id: id.uuidString.lowercased(), label: name, analyze: analyze, consent: analyze)
        _ = try await send("/imports", method: "POST", body: JSONEncoder().encode(registration))
    }

    func uploadPhoto(_ photo: Data, batch: UUID) async throws {
        _ = try await send("/imports/" + batch.uuidString.lowercased() + "/photos",
                           method: "PUT", body: photo, type: "image/jpeg")
    }
}
