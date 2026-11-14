import UIKit
import Capacitor

/// The app's web view controller: Capacitor's own, plus the plugins that live in this app target
/// (Capacitor registers npm plugins by itself; an in-app plugin has to be registered here).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
        // Behind the web view until the page paints its own launch screen (index.html #launch): the launch screen's
        // ground in the current appearance (Assets › LaunchBackground, light or dark), not capacitor.config's single
        // light colour, so a dark-mode launch does not flash light between the two.
        if let ground = UIColor(named: "LaunchBackground") {
            view.backgroundColor = ground
            webView?.backgroundColor = ground
            webView?.scrollView.backgroundColor = ground
        }
    }
}
