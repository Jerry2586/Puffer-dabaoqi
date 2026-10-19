import SwiftUI
import AVKit
import Combine

@main
struct HetunApp: App {
    var body: some Scene { WindowGroup { ClientView() } }
}

@MainActor
final class ClientModel: ObservableObject {
    let config: [String: Any]
    let theme: [String: Any]
    @Published var items: [[String: Any]] = []
    @Published var error = ""
    @Published var token = ""
    @Published var playback: URL?
    private var requestRevision = 0

    init() {
        func read(_ name: String) -> [String: Any] {
            guard let url = Bundle.main.url(forResource: name, withExtension: "json", subdirectory: "assets"),
                  let data = try? Data(contentsOf: url),
                  let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
            return value
        }
        config = read("runtime")
        theme = read("manifest")["theme"] as? [String: Any] ?? [:]
    }
    func request(_ route: String, body: [String: Any]? = nil) async throws -> [String: Any] {
        guard let base = config["apiBase"] as? String, let url = URL(string: base + route), url.scheme == "https" else {
            throw ClientError.message("尚未配置 HTTPS 影视中心，当前为离线主题预览。")
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        if !token.isEmpty { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        if let body {
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.url?.scheme == "https" else { throw ClientError.message("接口响应无效") }
        let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
        guard (200...299).contains(http.statusCode) else { throw ClientError.message(value["error"] as? String ?? "接口请求失败") }
        return value
    }
    func catalog(keyword: String = "", category: String = "") async {
        requestRevision += 1
        let stamp = requestRevision
        do {
            var parts = URLComponents()
            parts.queryItems = [URLQueryItem(name: "page", value: "1"), URLQueryItem(name: "keyword", value: keyword), URLQueryItem(name: "category", value: category)]
            let data = try await request("/api/catalog?" + (parts.percentEncodedQuery ?? ""))
            if stamp == requestRevision { items = data["items"] as? [[String: Any]] ?? [] }
        } catch { if stamp == requestRevision { self.error = error.localizedDescription } }
    }
    func play(_ item: [String: Any], sid: Int, nid: Int) async {
        do {
            let data = try await request("/api/playback", body: ["id": item["id"] ?? "", "sid": sid, "nid": nid])
            guard let value = data["url"] as? String, let url = URL(string: value), url.scheme == "https" else { throw ClientError.message("播放地址必须为 HTTPS") }
            playback = url
        } catch { self.error = error.localizedDescription }
    }
    func login(_ username: String, _ password: String) async {
        do { let data = try await request("/api/member/login", body: ["username": username, "password": password]); token = data["token"] as? String ?? "" }
        catch { self.error = error.localizedDescription }
    }
    func logout() async {
        do { _ = try await request("/api/member/logout", body: [:]); token = "" }
        catch { self.error = error.localizedDescription }
    }
}

enum ClientError: LocalizedError {
    case message(String)
    var errorDescription: String? { switch self { case .message(let text): return text } }
}

struct ClientView: View {
    @StateObject private var model = ClientModel()
    @State private var page = "home"
    @State private var search = ""
    @State private var username = ""
    @State private var password = ""
    @State private var detail: Int?
    private func text(_ item: [String: Any], _ key: String) -> String { item[key] as? String ?? "" }
    private func color(_ key: String, fallback: UInt32) -> Color {
        let colors = model.theme["colors"] as? [String: String] ?? [:]
        let value = UInt32((colors[key] ?? "").replacingOccurrences(of: "#", with: ""), radix: 16) ?? fallback
        return Color(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255)
    }
    var body: some View {
        VStack(spacing: 12) {
            Text(model.config["name"] as? String ?? "河豚").font(.largeTitle.bold())
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let announcement = model.theme["announcement"] as? [String: Any], announcement["enabled"] as? Bool == true { Text(text(announcement, "text")) }
                    if page == "member" || page == "mine" { account }
                    else if page == "schedule" { Text("排期表"); Text(String(describing: model.theme["schedule"] ?? [])) }
                    else if let index = detail, model.items.indices.contains(index) { detailView(model.items[index]) }
                    else { catalog }
                }.padding()
            }
            HStack {
                ForEach(Array((model.theme["navigation"] as? [[String: Any]] ?? []).enumerated()), id: \.offset) { _, item in
                    if item["enabled"] as? Bool != false {
                        Button(text(item, "label")) { page = text(item, "page"); detail = nil; Task { await model.catalog(category: text(item, "categoryId")) } }
                    }
                }
            }.padding(.bottom)
        }
        .foregroundStyle(color("text", fallback: 0xf4f4f4))
        .tint(color("accent", fallback: 0x27c9e3))
        .background(color("background", fallback: 0x101014))
        .task { if !(model.config["apiBase"] as? String ?? "").isEmpty { await model.catalog() } }
        .alert("河豚", isPresented: Binding(get: { !model.error.isEmpty }, set: { if !$0 { model.error = "" } })) { Button("知道了") { model.error = "" } } message: { Text(model.error) }
        .sheet(isPresented: Binding(get: { model.playback != nil }, set: { if !$0 { model.playback = nil } })) {
            if let url = model.playback { NativePlayer(url: url) }
        }
    }
    private var catalog: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack { TextField("搜索影片", text: $search).textFieldStyle(.roundedBorder); Button("搜索") { Task { await model.catalog(keyword: search) } } }
            ScrollView(.horizontal) { HStack {
                ForEach(Array((model.theme["categories"] as? [[String: Any]] ?? []).enumerated()), id: \.offset) { _, item in
                    if item["enabled"] as? Bool != false { Button(text(item, "label")) { Task { await model.catalog(category: text(item, "categoryId")) } } }
                }
            } }
            if model.items.isEmpty { Text("离线主题预览 · 配置影视中心后加载影片") }
            ForEach(Array((model.theme["sections"] as? [[String: Any]] ?? []).enumerated()), id: \.offset) { _, section in
                if section["enabled"] as? Bool != false && (text(section, "page").isEmpty || text(section, "page") == page) {
                    Text(text(section, "title")).font(.title2)
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 110, maximum: 190))]) {
                        ForEach(Array(model.items.prefix(section["limit"] as? Int ?? 6).enumerated()), id: \.offset) { index, item in
                            Button { detail = index } label: { VStack { if let url = URL(string: text(item, "poster")), url.scheme == "https" { AsyncImage(url: url) { image in image.resizable().scaledToFill() } placeholder: { Color.gray }.frame(height: 180).clipped() }; Text(text(item, "title")); Text(text(item, "note")).font(.caption) } }
                        }
                    }
                }
            }
        }
    }
    private var account: some View {
        VStack { Text("会员中心").font(.title); if model.token.isEmpty { TextField("用户名", text: $username).textFieldStyle(.roundedBorder); SecureField("密码", text: $password).textFieldStyle(.roundedBorder); Button("登录") { Task { await model.login(username, password); password = "" } } } else { Text("已登录"); Button("退出登录") { Task { await model.logout() } } } }
    }
    private func detailView(_ item: [String: Any]) -> some View {
        VStack(alignment: .leading) {
            Button("返回") { detail = nil }; Text(text(item, "title")).font(.title); Text(text(item, "description"))
            ForEach(Array((item["sources"] as? [[String: Any]] ?? []).enumerated()), id: \.offset) { sid, source in
                Text(text(source, "name"))
                ForEach(Array((source["episodes"] as? [[String: Any]] ?? []).enumerated()), id: \.offset) { nid, episode in
                    Button(text(episode, "name")) { Task { await model.play(item, sid: sid + 1, nid: nid + 1) } }
                }
            }
        }
    }
}

struct NativePlayer: View {
    @State private var player: AVPlayer
    init(url: URL) { _player = State(initialValue: AVPlayer(url: url)) }
    var body: some View { VideoPlayer(player: player).onAppear { player.play() }.onDisappear { player.pause() } }
}
