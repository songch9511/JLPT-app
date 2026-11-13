import UIKit
import Capacitor

/// The app's web view controller: Capacitor's own, plus the plugins that live in this app target
/// (Capacitor registers npm plugins by itself; an in-app plugin has to be registered here).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
    }
}
