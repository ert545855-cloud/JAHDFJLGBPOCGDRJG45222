#!/usr/bin/env node
// npm install sonrası (postinstall) eklenti kaynaklarına küçük düzeltmeler uygular.
// @capgo/native-purchases 8.9.x: Swift 6 eşzamanlılık uyarıları ("Reference to captured var ... in concurrently-executing code").
// Değişkenler MainActor.run'a girmeden önce sabite (let) kopyalanır; zayıf self için Sendable bir kutu kullanılır.
// Davranış değişmez. Betik idempotent: zaten düzeltilmişse ya da eklentinin yeni sürümünde metin bulunamazsa dokunmaz.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'node_modules', '@capgo', 'native-purchases', 'ios', 'Sources', 'NativePurchasesPlugin', 'NativePurchasesPlugin.swift');
const MARK = '// swipeup-patch: concurrency';

if (!fs.existsSync(file)) { console.log('[patch-plugins] native-purchases bulunamadı, atlandı'); process.exit(0); }
let s = fs.readFileSync(file, 'utf8');
if (s.includes(MARK)) { console.log('[patch-plugins] zaten uygulanmış'); process.exit(0); }

const edits = [
  // 1) Dinleyici görevi: zayıf self'i Sendable kutuya al (yakalanan değişken yerine sabit)
  [
    `        transactionUpdatesTask = Task.detached { [weak self] in
            for await result in Transaction.updates {`,
    `        let ref = WeakPluginRef(self) ${MARK}
        transactionUpdatesTask = Task.detached {
            for await result in Transaction.updates {`,
  ],
  ['let shouldFinish = await MainActor.run { self?.autoFinishTransactions ?? true }', 'let shouldFinish = await MainActor.run { ref.plugin?.autoFinishTransactions ?? true }'],
  [
    `                    await MainActor.run {
                        self?.notifyListeners("transactionUpdated", data: payload)
                    }`,
    `                    let updatedPayload = payload
                    await MainActor.run {
                        ref.plugin?.notifyListeners("transactionUpdated", data: updatedPayload)
                    }`,
  ],
  ['self?.notifyListeners("transactionVerificationFailed", data: [', 'ref.plugin?.notifyListeners("transactionVerificationFailed", data: ['],
  // 2) Ürün listesi: değişken diziyi sabite kopyala
  [
    'await MainActor.run { call.resolve(["products": productsJson]) }',
    'let productsResult = productsJson\n                await MainActor.run { call.resolve(["products": productsResult]) }',
  ],
];

for (const [a, b] of edits) {
  if (!s.includes(a)) { console.log('[patch-plugins] eklenti sürümü farklı, düzeltme atlandı (metin bulunamadı)'); process.exit(0); }
  s = s.replace(a, b);
}
s += `
${MARK}
/// Arka plan görevinden eklentiye zayıf başvuru (görev eklentiyi canlı tutmaz).
private final class WeakPluginRef: @unchecked Sendable {
    weak var plugin: NativePurchasesPlugin?
    init(_ plugin: NativePurchasesPlugin) { self.plugin = plugin }
}
`;
fs.writeFileSync(file, s);
console.log('[patch-plugins] native-purchases düzeltildi');
