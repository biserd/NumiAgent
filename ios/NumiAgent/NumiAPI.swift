import Foundation
import Security

struct Account: Decodable, Equatable {
    let id: String
    let email: String
}

struct Specimen: Decodable, Identifiable {
    struct Details: Codable {
        var metal: String? = nil
        var mint: String? = nil
        var weightG: Double? = nil
        var serial, signatures, obverse, reverse, inscriptions, mintMark, series, variant: String?
        var provenance, certification, referenceUrl, purchaseSource, purchaseDate, description: String?
        var obverseLegend, reverseLegend, currency: String?
        var dateFrom, dateTo, dieAxis: Int?
        var diameterMm, purchasePrice, fees: Double?
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
    var tags: String?
    var collection_id: String?
    var photos: [PhotoLink]?
    var googleVisionAvailable: Bool? = nil

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
        var rule: ChecklistRule?

        init(label: String, owned: [Match]) {
            self.label = label
            self.owned = owned
        }

        init(from decoder: Decoder) throws {
            rule = try ChecklistRule(from: decoder)
            label = rule?.label ?? ""
            owned = try decoder.container(keyedBy: CodingKeys.self).decode([Match].self, forKey: .owned)
        }

        private enum CodingKeys: String, CodingKey { case owned }
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
    private let network: URLSession
    private let sessionStore = SessionKeychain()

    private var guestScanOrigin: String {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--guest-scan-staging") {
            return "https://staging.numiagent.com"
        }
        #endif
        return Self.origin
    }

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

    private func send(
        _ path: String,
        method: String = "GET",
        query: [URLQueryItem] = [],
        body: Data? = nil,
        type: String = "application/json",
        authenticated: Bool = true,
        scanKey: String? = nil
    ) async throws -> (Data, HTTPURLResponse) {
        let requestOrigin = scanKey == nil ? Self.origin : guestScanOrigin
        var components = URLComponents(string: requestOrigin)!
        components.path = "/api/v1" + path
        if !query.isEmpty { components.queryItems = query }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.httpBody = body
        request.setValue(requestOrigin, forHTTPHeaderField: "Origin")
        if body != nil { request.setValue(type, forHTTPHeaderField: "Content-Type") }
        if let scanKey { request.setValue("Bearer " + scanKey, forHTTPHeaderField: "Authorization") }
        if authenticated {
            guard let value = try sessionStore.load() else {
                throw NumiError.request(401, "Sign in to continue.")
            }
            request.setValue(Self.cookieName + "=" + value, forHTTPHeaderField: "Cookie")
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

    func post<T: Decodable>(_ path: String, payload: some Encodable) async throws -> T {
        let (data, _) = try await send(path, method: "POST", body: JSONEncoder().encode(payload))
        return try JSONDecoder().decode(T.self, from: data)
    }

    func write(_ path: String, method: String, payload: (any Encodable)? = nil) async throws {
        let body = try payload.map { try JSONEncoder().encode($0) }
        _ = try await send(path, method: method, body: body)
    }

    func download(_ path: String) async throws -> Data {
        let (data, _) = try await send(path)
        return data
    }

    func requestSignIn(email: String) async throws {
        let body = try JSONEncoder().encode(["email": email])
        _ = try await send("/auth/native/request", method: "POST", body: body, authenticated: false)
    }

    var hasStoredSession: Bool { (try? sessionStore.load()) != nil }

    func searchGuestPhotos(id: String, key: String, front: Data?, back: Data?) async throws -> GuestScanResult {
        struct SelectedPhotos: Encodable { let front: Data?; let back: Data? }
        let body = try JSONEncoder().encode(SelectedPhotos(front: front, back: back))
        let (data, _) = try await send("/guest-scans/" + id, method: "POST", body: body,
                                       authenticated: false, scanKey: key)
        return try JSONDecoder().decode(GuestScanResult.self, from: data)
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
        try sessionStore.store(cookie.value)
    }

    func signOut(deleteAccount: Bool) async throws {
        if deleteAccount {
            _ = try await send("/me", method: "DELETE", body: JSONEncoder().encode(["confirm": "DELETE"]))
        } else {
            do { _ = try await send("/me/signout", method: "POST") }
            catch let error as NumiError where error.isUnauthorized {}
        }
        try sessionStore.remove()
    }

    func photo(_ id: String) async throws -> Data {
        let (data, _) = try await send("/photos/" + id)
        return data
    }

    struct PhotoSearchPreference: Codable { let enabled: Bool }

    func setExternalPhotoSearch(_ enabled: Bool) async throws {
        let payload = try JSONEncoder().encode(PhotoSearchPreference(enabled: enabled))
        _ = try await send("/me/photo-search", method: "PUT", body: payload)
    }

    func createImport(id: UUID, name: String, analyze: Bool, autoCatalog: Bool, paired: Bool,
                      expectedPhotos: Int?, scanPlan: [Int]? = nil) async throws {
        struct Batch: Encodable {
            let id: String
            let label: String
            let analyze: Bool
            let consent: Bool
            let autoCatalog: Bool
            let paired: Bool
            let expectedPhotos: Int?
            let scanPlan: [Int]?
        }
        let registration = Batch(id: id.uuidString.lowercased(), label: name, analyze: analyze,
                                 consent: analyze, autoCatalog: autoCatalog, paired: paired,
                                 expectedPhotos: expectedPhotos, scanPlan: scanPlan)
        _ = try await send("/imports", method: "POST", body: JSONEncoder().encode(registration))
    }

    func uploadPhoto(_ photo: Data, batch: UUID, side: String? = nil, slot: Int? = nil) async throws -> String {
        let path = "/imports/" + batch.uuidString.lowercased() + "/photos"
        var query = side.map { [URLQueryItem(name: "side", value: $0)] } ?? []
        if let slot { query.append(URLQueryItem(name: "slot", value: String(slot))) }
        let (data, _) = try await send(path, method: "PUT", query: query, body: photo, type: "image/jpeg")
        return try JSONDecoder().decode(APIIdentifier.self, from: data).id
    }
}

private struct SessionKeychain {
    private let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.numiagent.ios",
        kSecAttrAccount as String: "collection-session"
    ]

    func load() throws -> String? {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else { throw failure }
        return value
    }

    func store(_ value: String) throws {
        let data = Data(value.utf8)
        let result = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if result == errSecSuccess { return }
        guard result == errSecItemNotFound else { throw failure }
        var entry = query
        entry[kSecValueData as String] = data
        entry[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        guard SecItemAdd(entry as CFDictionary, nil) == errSecSuccess else { throw failure }
    }

    func remove() throws {
        let result = SecItemDelete(query as CFDictionary)
        guard result == errSecSuccess || result == errSecItemNotFound else { throw failure }
    }

    private var failure: NumiError { .request(0, "NumiAgent couldn’t access this device’s secure sign-in storage.") }
}
