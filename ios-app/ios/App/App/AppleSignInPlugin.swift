import Foundation
import Capacitor
import AuthenticationServices

// Apple ile giriş (yerel pencere). Web tarafı window.Capacitor.Plugins.AppleSignIn.authorize({ nonce }) ile çağırır
// (bkz. depo kökünde public/js/oauth.js). Dönen kimlik belgesi (identityToken) sunucuda Apple'ın açık anahtarlarıyla
// doğrulanır (server/oidc.js; aud = paket kimliği app.swipeup.ios). Çalışması için Xcode'da Signing & Capabilities →
// + Capability → "Sign in with Apple" eklenmeli (ücretli Apple Developer ekibi gerekir; ücretsiz ekipte bu yetenek yok).
@objc(AppleSignInPlugin)
public class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "AppleSignInPlugin"
    public let jsName = "AppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]
    private var pending: CAPPluginCall?

    @objc func authorize(_ call: CAPPluginCall) {
        let nonce = call.getString("nonce")
        DispatchQueue.main.async {
            if let old = self.pending { old.reject("Yeni bir giriş isteği başladı.", "REPLACED") }
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            if let nonce = nonce, !nonce.isEmpty { request.nonce = nonce }
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.pending = call
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return bridge?.viewController?.view.window ?? UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.windows.first { $0.isKeyWindow } }.first ?? UIWindow()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = pending else { return }
        pending = nil
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let data = credential.identityToken,
              let token = String(data: data, encoding: .utf8) else {
            call.reject("Apple kimlik bilgisi alınamadı.")
            return
        }
        var name = ""
        if let parts = credential.fullName {
            name = PersonNameComponentsFormatter().string(from: parts).trimmingCharacters(in: .whitespaces)
        }
        call.resolve([
            "identityToken": token,
            "user": credential.user,
            "email": credential.email ?? "",
            "name": name
        ])
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = pending else { return }
        pending = nil
        if let e = error as? ASAuthorizationError, e.code == .canceled {
            call.reject("Vazgeçildi.", "CANCELED")
        } else {
            call.reject("Apple ile giriş şu an kullanılamıyor.", "FAILED")
        }
    }
}

// Capacitor köprüsü: yerel eklentiler (uygulama içindeki Swift sınıfları) burada kaydedilir
class AppViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppleSignInPlugin())
        bridge?.registerPluginInstance(NativePushPlugin())
        // Uzun basınca Safari'nin bağlantı önizlemesi (Open Link / Copy Link…) açılmasın: uygulama kendi menülerini kullanır
        // (ör. alt menüde profil sekmesine uzun basınca hesap seçici)
        webView?.allowsLinkPreview = false
    }
}
