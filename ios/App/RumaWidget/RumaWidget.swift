import SwiftUI
import WidgetKit

// Home-screen widget: today's reviews and the readiness figure ("시험날 기억할 단어").
// The app writes a JSON snapshot (src/platform/widget.ts) to the App Group's shared UserDefaults through
// WidgetBridgePlugin; it holds one entry per day for the next week, so the timeline below switches to the
// right day at each midnight without the app running.

private enum Shared {
    static let snapshotKey = "ruma.widget.snapshot"
    static var appGroup: String {
        (Bundle.main.object(forInfoDictionaryKey: "RumaAppGroup") as? String) ?? ""
    }
}

struct SnapshotDay: Decodable {
    let day: String
    let due: Int
    let fresh: Int
    let done: Bool
}

struct Snapshot: Decodable {
    let v: Int
    let at: Double
    let onboarded: Bool
    let levels: String
    let plan: Int?
    let total: Int
    let goal: Int
    let examDate: String
    let days: [SnapshotDay]
}

struct RumaEntry: TimelineEntry {
    let date: Date
    let snapshot: Snapshot?
    let today: SnapshotDay?
}

struct Provider: TimelineProvider {
    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone.current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    func placeholder(in context: Context) -> RumaEntry {
        RumaEntry(date: Date(), snapshot: nil, today: SnapshotDay(day: "", due: 12, fresh: 10, done: false))
    }

    func getSnapshot(in context: Context, completion: @escaping (RumaEntry) -> Void) {
        completion(entries(from: Date()).first ?? placeholder(in: context))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RumaEntry>) -> Void) {
        completion(Timeline(entries: entries(from: Date()), policy: .atEnd))
    }

    private func load() -> Snapshot? {
        guard !Shared.appGroup.isEmpty,
              let defaults = UserDefaults(suiteName: Shared.appGroup),
              let text = defaults.string(forKey: Shared.snapshotKey),
              let data = text.data(using: .utf8)
        else { return nil }
        return try? JSONDecoder().decode(Snapshot.self, from: data)
    }

    private func dayEntry(_ snapshot: Snapshot?, _ date: Date) -> SnapshotDay? {
        let key = Self.dayFormatter.string(from: date)
        return snapshot?.days.first { $0.day == key }
    }

    /// Now, then each of the next seven midnights.
    func entries(from now: Date) -> [RumaEntry] {
        let snapshot = load()
        let calendar = Calendar.current
        var out = [RumaEntry(date: now, snapshot: snapshot, today: dayEntry(snapshot, now))]
        var start = calendar.startOfDay(for: now)
        for _ in 0..<7 {
            guard let next = calendar.date(byAdding: .day, value: 1, to: start) else { break }
            start = next
            out.append(RumaEntry(date: next, snapshot: snapshot, today: dayEntry(snapshot, next)))
        }
        return out
    }
}

// The app's traditional palette (src/styles.css): 生成り ground, 墨 ink, 藍 indigo, 朱 vermilion.
private struct Palette {
    let dark: Bool
    var ground: Color { dark ? Color(red: 0.106, green: 0.102, blue: 0.094) : Color(red: 0.984, green: 0.980, blue: 0.961) }
    var ink: Color { dark ? Color(red: 0.93, green: 0.91, blue: 0.87) : Color(red: 0.176, green: 0.165, blue: 0.149) }
    var muted: Color { dark ? Color(red: 0.70, green: 0.68, blue: 0.64) : Color(red: 0.420, green: 0.400, blue: 0.365) }
    var accent: Color { dark ? Color(red: 0.45, green: 0.68, blue: 0.82) : Color(red: 0.086, green: 0.369, blue: 0.514) }
    var seal: Color { Color(red: 0.769, green: 0.333, blue: 0.231) }
}

struct RumaWidgetView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme
    let entry: RumaEntry

    private var p: Palette { Palette(dark: scheme == .dark) }

    var body: some View {
        Group {
            if family == .systemMedium {
                HStack(alignment: .top, spacing: 16) {
                    today
                    Divider()
                    readiness
                }
            } else {
                today
            }
        }
        .padding(family == .systemMedium ? 4 : 0)
        .widgetBackground(p.ground)
    }

    @ViewBuilder private var today: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("오늘")
                .font(.caption.weight(.bold))
                .foregroundColor(p.muted)
            if let snapshot = entry.snapshot, snapshot.onboarded, let day = entry.today {
                if day.done {
                    Text("済")
                        .font(.system(size: 34, weight: .bold, design: .serif))
                        .foregroundColor(p.seal)
                    Text("오늘 분량 끝")
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(p.ink)
                } else {
                    Text("\(day.due)")
                        .font(.system(size: 40, weight: .bold, design: .rounded))
                        .foregroundColor(day.due > 0 ? p.accent : p.ink)
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                    Text(day.due > 0 ? "복습할 단어" : "복습 없음")
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(p.ink)
                    if day.fresh > 0 {
                        Text("새 단어 \(day.fresh)개")
                            .font(.caption)
                            .foregroundColor(p.muted)
                    }
                }
            } else {
                Text("루마")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundColor(p.accent)
                Text("앱을 열어 오늘의 단어를 확인해요")
                    .font(.caption)
                    .foregroundColor(p.muted)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private var readiness: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("시험날 기억할 단어")
                .font(.caption.weight(.bold))
                .foregroundColor(p.muted)
            if let snapshot = entry.snapshot, snapshot.onboarded, let plan = snapshot.plan, snapshot.total > 0 {
                Text("\(plan)")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundColor(p.ink)
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                Text("\(snapshot.levels) \(snapshot.total)개 중 · 예상")
                    .font(.caption)
                    .foregroundColor(p.muted)
                ProgressView(value: Double(min(plan, snapshot.total)), total: Double(snapshot.total))
                    .tint(p.accent)
                Text("목표 \(snapshot.goal)")
                    .font(.caption2)
                    .foregroundColor(p.muted)
            } else {
                Text("—")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundColor(p.muted)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private extension View {
    /// iOS 17 draws widget backgrounds through containerBackground; earlier versions use a plain background.
    @ViewBuilder func widgetBackground(_ color: Color) -> some View {
        if #available(iOS 17.0, *) {
            containerBackground(color, for: .widget)
        } else {
            background(color)
        }
    }
}

@main
struct RumaWidget: Widget {
    let kind = "RumaWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            RumaWidgetView(entry: entry)
        }
        .configurationDisplayName("오늘의 복습")
        .description("오늘 복습할 단어 수와 시험날 기억할 단어를 보여 줘요.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
