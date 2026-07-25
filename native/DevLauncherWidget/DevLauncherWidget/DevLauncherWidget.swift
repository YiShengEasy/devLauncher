import SwiftUI
import WidgetKit
import Darwin

private let appGroupIdentifier = "group.com.yisheng.devlauncher"

struct DevLauncherShortcut: Codable, Identifiable {
    let pageIndex: Int
    let keyId: String
    let name: String
    let symbol: String
    let color: String

    var id: String { "\(pageIndex):\(keyId)" }

    var deepLink: URL {
        var components = URLComponents()
        components.scheme = "devlauncher"
        components.host = "run-binding"
        components.queryItems = [
            URLQueryItem(name: "page", value: String(pageIndex)),
            URLQueryItem(name: "key", value: keyId),
        ]
        return components.url!
    }
}

private struct DevLauncherSnapshot: Codable {
    let shortcuts: [DevLauncherShortcut]
}

struct DevLauncherEntry: TimelineEntry {
    let date: Date
    let shortcuts: [DevLauncherShortcut]
}

struct DevLauncherProvider: TimelineProvider {
    private let placeholders = [
        DevLauncherShortcut(pageIndex: 0, keyId: "X", name: "剪切板", symbol: "clipboard.fill", color: "#38BDF8"),
        DevLauncherShortcut(pageIndex: 0, keyId: "D", name: "JSON 助手", symbol: "curlybraces.square.fill", color: "#38BDF8"),
        DevLauncherShortcut(pageIndex: 0, keyId: "T", name: "终端", symbol: "terminal.fill", color: "#F87171"),
        DevLauncherShortcut(pageIndex: 0, keyId: "W", name: "工作流", symbol: "point.3.connected.trianglepath.dotted", color: "#FB7185"),
    ]

    func placeholder(in context: Context) -> DevLauncherEntry {
        DevLauncherEntry(date: Date(), shortcuts: placeholders)
    }

    func getSnapshot(in context: Context, completion: @escaping (DevLauncherEntry) -> Void) {
        completion(DevLauncherEntry(date: Date(), shortcuts: loadShortcuts() ?? placeholders))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DevLauncherEntry>) -> Void) {
        let entry = DevLauncherEntry(date: Date(), shortcuts: loadShortcuts() ?? [])
        let refresh = Calendar.current.date(byAdding: .minute, value: 1, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(refresh)))
    }

    private func loadShortcuts() -> [DevLauncherShortcut]? {
        var candidates: [URL] = []

        if let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupIdentifier
        ) {
            candidates.append(container.appendingPathComponent("widget-shortcuts.json"))
        }

        if let account = getpwuid(getuid()), let home = account.pointee.pw_dir {
            candidates.append(
                URL(fileURLWithPath: String(cString: home))
                    .appendingPathComponent("Library")
                    .appendingPathComponent("Application Support")
                    .appendingPathComponent("com.yisheng.app")
                    .appendingPathComponent("widget-shortcuts.json")
            )
        }

        for url in candidates {
            guard
                let data = try? Data(contentsOf: url),
                let snapshot = try? JSONDecoder().decode(DevLauncherSnapshot.self, from: data)
            else {
                continue
            }
            return snapshot.shortcuts
        }

        return nil
    }
}

private extension Color {
    init(widgetHex value: String) {
        let hex = value.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        guard let number = UInt64(hex, radix: 16), hex.count == 6 else {
            self = .accentColor
            return
        }
        self.init(
            red: Double((number >> 16) & 0xff) / 255,
            green: Double((number >> 8) & 0xff) / 255,
            blue: Double(number & 0xff) / 255
        )
    }
}

struct ShortcutTile: View {
    let shortcut: DevLauncherShortcut

    var body: some View {
        Link(destination: shortcut.deepLink) {
            VStack(spacing: 5) {
                Image(systemName: shortcut.symbol)
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(Color(widgetHex: shortcut.color))
                    .frame(height: 22)

                Text(shortcut.name)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.horizontal, 4)
            .background(.primary.opacity(0.055), in: RoundedRectangle(cornerRadius: 9))
        }
        .buttonStyle(.plain)
    }
}

struct DevLauncherWidgetEntryView: View {
    let entry: DevLauncherEntry
    @Environment(\.widgetFamily) private var family

    private var layout: (columns: Int, limit: Int) {
        switch family {
        case .systemSmall:
            return (2, 4)
        case .systemLarge:
            return (4, 16)
        default:
            return (4, 8)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 5) {
                Image(systemName: "bolt.horizontal.circle.fill")
                    .foregroundStyle(.cyan)
                Text("DevLauncher")
                    .font(.caption.weight(.bold))
                Spacer(minLength: 0)
                if entry.shortcuts.count > layout.limit {
                    Text("+\(entry.shortcuts.count - layout.limit)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            if entry.shortcuts.isEmpty {
                VStack(spacing: 7) {
                    Image(systemName: "square.grid.2x2")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                    Text("请在 DevLauncher\n设置 → 小组件中添加")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                LazyVGrid(
                    columns: Array(
                        repeating: GridItem(.flexible(), spacing: 6),
                        count: layout.columns
                    ),
                    spacing: 6
                ) {
                    ForEach(Array(entry.shortcuts.prefix(layout.limit))) { shortcut in
                        ShortcutTile(shortcut: shortcut)
                    }
                }
                .frame(maxHeight: .infinity)
            }
        }
        .containerBackground(for: .widget) {
            Color(nsColor: .windowBackgroundColor)
        }
    }
}

@main
struct DevLauncherWidget: Widget {
    let kind = "DevLauncherWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DevLauncherProvider()) { entry in
            DevLauncherWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("DevLauncher 快捷入口")
        .description("显示你从虚拟键盘绑定中选择的快捷操作。")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
