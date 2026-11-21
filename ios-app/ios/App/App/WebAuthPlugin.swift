import Foundation
import UIKit
import Capacitor
import AuthenticationServices

// Google ile giriş: Google, uygulama içi web görünümünde (WKWebView) girişi engeller. Giriş sayfası (https://swipeup.live/auth/google.html)
// Apple'ın güvenli giriş penceresinde (ASWebAuthenticationSession, Safari tabanlı) açılır; sunucu girişi bitirince
// swipeup://google?g=<kod> adresine yönlendirir, pencere kapanır ve adres web tarafına döner (public/js/oauth.js).
// Web'den: Capacitor.Plugins.WebAuth.open({ url, scheme }) → { url }; kullanıcı vazgeçerse hata kodu "CANCELED".
@objc(WebAuthPlugin)
public class WebAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "WebAuthPlugin"
    public let jsName = "WebAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]
    private var session: ASWebAuthenticationSession?

    @objc func open(_ call: CAPPluginCall) {
        // Yalnız SwipeUp'ın kendi adresleri açılır
        guard let s = call.getString("url"), let url = URL(string: s), url.scheme == "https", url.host == "swipeup.live" else {
            call.reject("Geçersiz giriş adresi.", "BAD_URL"); return
        }
        let scheme = call.getString("scheme") ?? "swipeup"
        DispatchQueue.main.async {
            let sess = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] callback, error in
                self?.session = nil
                if let callback = callback { call.resolve(["url": callback.absoluteString]); return }
                if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin {
                    call.reject("Giriş iptal edildi.", "CANCELED"); return
                }
                call.reject(error?.localizedDescription ?? "Giriş tamamlanamadı.", "FAILED")
            }
            sess.presentationContextProvider = self
            sess.prefersEphemeralWebBrowserSession = false // Safari'de açık Google oturumu kullanılabilsin
            self.session = sess
            if !sess.start() { self.session = nil; call.reject("Giriş penceresi açılamadı.", "FAILED") }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        if let w = bridge?.viewController?.view.window { return w }
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        if let w = scenes.flatMap({ $0.windows }).first(where: { $0.isKeyWindow }) ?? scenes.first?.windows.first { return w }
        return ASPresentationAnchor()
    }
}
