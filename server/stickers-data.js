// Sohbet çıkartma paketleri (görseller: public/img/stk/<paket>/<çıkartma>.svg, scripts/stickers/build.mjs ile üretilir)
// coins: 0 → herkese ücretsiz · plus: true → SwipeUp+ üyelerine özel
const PACKS = [
  {
    id: 'bulut', name: 'Bulutçuk', desc: 'Herkese ücretsiz temel paket', coins: 0, animated: false, body: 'mochi',
    colors: { b1: '#ffffff', b2: '#d6e6ff', edge: '#8fb2e8' },
    items: [
      { id: 'selam', name: 'Selam', eyes: 'happy', mouth: 'smile', extras: ['wave'] },
      { id: 'tamam', name: 'Tamam', eyes: 'dot', mouth: 'smile', extras: ['thumb'] },
      { id: 'kahkaha', name: 'Kahkaha', eyes: 'happy', mouth: 'grin', extras: ['tears'] },
      { id: 'uzgun', name: 'Üzgün', eyes: 'teary', mouth: 'frown' },
      { id: 'kalp', name: 'Kalp kalp', eyes: 'heart', mouth: 'smile', extras: ['hearts'] },
      { id: 'uykulu', name: 'Uykulu', eyes: 'closed', mouth: 'o', extras: ['zzz'] },
      { id: 'sasirdim', name: 'Şaşırdım', eyes: 'wide', mouth: 'o', extras: ['sweat'] },
      { id: 'kizgin', name: 'Kızgın', eyes: 'angry', mouth: 'frown', extras: ['anger'] },
    ],
  },
  {
    id: 'kedi', name: 'Mırnav', desc: 'Hareketli kedi çıkartmaları', coins: 25, animated: true, body: 'cat',
    colors: { b1: '#ffc98f', b2: '#f59a4c', edge: '#c96a24' },
    items: [
      { id: 'selam', name: 'Selam', eyes: 'happy', mouth: 'cat', extras: ['wave'], anim: 'bounce' },
      { id: 'ask', name: 'Aşık', eyes: 'heart', mouth: 'cat', extras: ['hearts'], anim: 'pulse' },
      { id: 'uyku', name: 'Uyku', eyes: 'closed', mouth: 'cat', extras: ['zzz'], anim: 'breathe' },
      { id: 'aglama', name: 'Ağlıyorum', eyes: 'teary', mouth: 'frown', extras: ['tears'], anim: 'wobble' },
      { id: 'kizgin', name: 'Hıhh', eyes: 'angry', mouth: 'flat', extras: ['anger'], anim: 'shake' },
      { id: 'sasirma', name: 'Vay be', eyes: 'wide', mouth: 'o', extras: ['sparkle'], anim: 'jump' },
      { id: 'opucuk', name: 'Öpücük', eyes: 'wink', mouth: 'kiss', extras: ['hearts'], anim: 'pulse' },
      { id: 'tamam', name: 'Süper', eyes: 'happy', mouth: 'cat', extras: ['thumb'], anim: 'bounce' },
    ],
  },
  {
    id: 'ask', name: 'Aşk Postası', desc: 'Kalpten gelen hareketli mesajlar', coins: 30, animated: true, body: 'heart',
    colors: { b1: '#ff9ab8', b2: '#ff4f7b', edge: '#d8285a' },
    items: [
      { id: 'seviyorum', name: 'Seni seviyorum', eyes: 'heart', mouth: 'smile', extras: ['hearts'], anim: 'pulse' },
      { id: 'ozledim', name: 'Özledim', eyes: 'teary', mouth: 'frown', extras: ['tears'], anim: 'wobble' },
      { id: 'opucuk', name: 'Öpücük', eyes: 'wink', mouth: 'kiss', extras: ['hearts'], anim: 'pulse' },
      { id: 'cicek', name: 'Sana çiçek', eyes: 'happy', mouth: 'smile', extras: ['flower'], anim: 'bounce' },
      { id: 'mektup', name: 'Mektubun var', eyes: 'dot', mouth: 'open', extras: ['letter'], anim: 'bounce' },
      { id: 'utandim', name: 'Utandım', eyes: 'closed', mouth: 'smile', extras: ['blush', 'sparkle'], anim: 'wobble' },
      { id: 'harika', name: 'Harikasın', eyes: 'star', mouth: 'grin', extras: ['sparkle'], anim: 'jump' },
      { id: 'kirik', name: 'Kalbim kırıldı', eyes: 'teary', mouth: 'frown', extras: ['crack'], anim: 'shake' },
    ],
  },
  {
    id: 'parti', name: 'Parti Zamanı', desc: 'Kutlamalar için hareketli civciv', coins: 25, animated: true, body: 'chick',
    colors: { b1: '#fff27a', b2: '#ffcf2e', edge: '#e0a200' },
    items: [
      { id: 'yasasin', name: 'Yaşasın', eyes: 'happy', mouth: 'grin', extras: ['confetti'], anim: 'jump', hat: true },
      { id: 'dans', name: 'Dans', eyes: 'happy', mouth: 'open', extras: ['notes'], anim: 'wobble' },
      { id: 'iyiki', name: 'İyi ki doğdun', eyes: 'dot', extras: ['cake'], anim: 'bounce', hat: true },
      { id: 'havali', name: 'Havalı', eyes: 'glasses', mouth: 'smile', extras: ['sparkle'], anim: 'wobble' },
      { id: 'balon', name: 'Balon', eyes: 'happy', extras: ['balloon'], anim: 'float' },
      { id: 'bravo', name: 'Bravo', eyes: 'star', mouth: 'grin', extras: ['sparkle'], anim: 'shake' },
      { id: 'merak', name: 'Hmm?', eyes: 'dot', extras: ['question'], anim: 'wobble' },
      { id: 'kutlama', name: 'Kutlayalım', eyes: 'happy', mouth: 'open', extras: ['confetti'], anim: 'pulse', hat: true },
    ],
  },
  {
    id: 'altin', name: 'Altın Seri', desc: 'SwipeUp+ üyelerine özel', coins: 0, plus: true, animated: true, body: 'gold',
    colors: { b1: '#fff0b8', b2: '#ffc93d', edge: '#d99a00' },
    items: [
      { id: 'selam', name: 'Selam', eyes: 'happy', mouth: 'smile', extras: ['wave'], anim: 'bounce' },
      { id: 'kalp', name: 'Kalp', eyes: 'heart', mouth: 'smile', extras: ['hearts'], anim: 'pulse' },
      { id: 'havali', name: 'Havalı', eyes: 'glasses', mouth: 'smile', extras: ['sparkle'], anim: 'wobble' },
      { id: 'kahkaha', name: 'Kahkaha', eyes: 'happy', mouth: 'grin', extras: ['tears'], anim: 'shake' },
      { id: 'zengin', name: 'Şanslı gün', eyes: 'star', mouth: 'grin', extras: ['coins'], anim: 'jump' },
      { id: 'yildiz', name: 'Yıldızsın', eyes: 'star', mouth: 'smile', extras: ['sparkle'], anim: 'float' },
    ],
  },
];
module.exports = { PACKS };
