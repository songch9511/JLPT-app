import Foundation
import Capacitor
import WidgetKit

/// Hands the home-screen widget its data (src/platform/widget.ts builds it): one JSON text in the App Group's
/// shared UserDefaults, which the widget extension (RumaWidget) reads. The App Group id comes from Info.plist
/// (`RumaAppGroup`, set from the RUMA_APP_GROUP build setting), so the bundle id lives in one place.
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    static let snapshotKey = "ruma.widget.snapshot"

    private var shared: UserDefaults? {
        guard let group = Bundle.main.object(forInfoDictionaryKey: "RumaAppGroup") as? String, !group.isEmpty else {
            return nil
        }
        return UserDefaults(suiteName: group)
    }

    @objc func setSnapshot(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else {
            call.reject("json is required")
            return
        }
        guard let shared = shared else {
            call.reject("App Group is not configured")
            return
        }
        // the widget's timeline is reloaded only when what it shows changed
        if shared.string(forKey: Self.snapshotKey) != json {
            shared.set(json, forKey: Self.snapshotKey)
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve()
    }

    @objc func clear(_ call: CAPPluginCall) {
        shared?.removeObject(forKey: Self.snapshotKey)
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }
}
