## 📝 RULES.md

# Site Tweaks – Kural Yazım Rehberi

Bu belge, **Site Tweaks (Local)** uzantısında kullanılacak kuralların nasıl yazılacağını ve hangi özellikleri desteklediğini açıklar.

---

## 📦 Genel Kural Yapısı

Tüm kurallar `chrome.storage.local` altında saklanır. Her kural, JSON formatında aşağıdaki alanları içerebilir:

```json
{
  "id": "uuid",
  "name": "Örnek Kural",
  "enabled": true,
  "pattern": "*://*.example.com/*",
  "excludePatterns": ["*://ads.example.com/*"],
  "scope": "DOMAIN",
  "priority": 1,
  "runAt": "document_start",
  "world": "ISOLATED",
  "css": "body { background: #111; } .ad { display:none !important; }",
  "cssFiles": ["examples/example.css"],
  "js": "console.log('Merhaba');",
  "jsFiles": ["examples/example.js"],
  "localJs": [
    {
      "title": "Yerel Bot JS",
      "lastImportedAt": 1712345678901,
      "size": 1024,
      "hash": "sha256-…",
      "content": "// Kullanıcının içe aktardığı JS"
    }
  ],
  "safeMode": false,
  "notes": "Bu kural gece modunu uygular"
}
```

---

## 🗂 Alanların Açıklaması

| Alan              | Açıklama                                                                           |
| ----------------- | ---------------------------------------------------------------------------------- |
| `id`              | Kuralın benzersiz kimliği (uuid).                                                  |
| `name`            | Kural için kısa bir isim.                                                          |
| `enabled`         | Kural açık/kapalı.                                                                 |
| `pattern`         | URL desenidir. `*` joker karakteri kullanabilirsiniz (örn: `*://*.example.com/*`). |
| `excludePatterns` | Bu desenlerle eşleşen URL’lerde kural çalışmaz.                                    |
| `scope`           | Popup’ta gösterilen kapsam etiketi: `DOMAIN` / `URL` / `PATTERN`.                  |
| `priority`        | Küçük sayı önce uygulanır (öncelik sırası).                                        |
| `runAt`           | `document_start`, `document_end` veya `document_idle`.                             |
| `world`           | `ISOLATED` (varsayılan, güvenli) veya `MAIN` (sayfanın kendi dünyasında çalışır).  |
| `css`             | Inline CSS.                                                                        |
| `cssFiles`        | Uzantı içindeki CSS dosyaları (örnek: `examples/example.css`).                     |
| `js`              | Inline JS.                                                                         |
| `jsFiles`         | Uzantı içindeki JS dosyaları.                                                      |
| `localJs`         | Kullanıcının içe aktardığı JS dosyaları.                                           |
| `safeMode`        | `true` ise kod çalıştırılmaz, sadece log üretilir.                                 |
| `notes`           | Açıklama notu.                                                                     |

---

## 🌐 URL Deseni Yazma

* `*` joker karakteri herhangi bir diziyle eşleşir.
* Protokol belirtebilirsiniz: `https://`, `http://` veya `*://`.
* Örnekler:

  * `*://*.example.com/*` → Tüm alt alanlar.
  * `https://example.com/page*` → Belirli path.
  * `*://example.com/*` → Tüm protokoller.

**excludePatterns** kullanımı:

```json
"excludePatterns": ["*://ads.example.com/*", "*://example.com/tracker/*"]
```

---

## 🎨 CSS Kullanımı

Inline CSS:

```json
"css": "body { filter: grayscale(100%); } .ad { display:none !important; }"
```

Dosyadan CSS:

```json
"cssFiles": ["examples/example.css"]
```

Bu dosyalar uzantı içindedir ve `chrome.runtime.getURL()` ile yüklenir.

---

## ⚙️ JS Kullanımı

Inline JS:

```json
"js": "console.log('Merhaba Dünya');"
```

Dosyadan JS:

```json
"jsFiles": ["examples/example.js"]
```

Yerel JS (içe aktarılmış):

```json
"localJs": [
  {
    "title": "Bot JS",
    "content": "alert('Yerel dosya');"
  }
]
```

---

## 🛡 MAIN vs ISOLATED World

* **ISOLATED**: Kod, içerik betiği dünyasında çalışır. Sayfanın global değişkenlerine erişemez. Daha güvenlidir.
* **MAIN**: Kod doğrudan sayfanın dünyasında çalışır. Global değişkenlere, fonksiyonlara ve frameworklere erişebilir. Risklidir.

`world` alanında seçebilirsiniz:

```json
"world": "ISOLATED"  // veya "MAIN"
```

---

## 📝 Safe Mode

Bir kuralı test ederken `safeMode:true` yaparak kodun enjekte edilmesini engelleyip yalnızca konsola log atabilirsiniz.

```json
"safeMode": true
```

---

## 🧰 Kullanışlı İpuçları

* **Selector üretici**: Context menüsünden “Bu öğeyi gizle” seçeneğiyle bir CSS seçici taslağı alabilirsiniz.
* **SPA’ler**: URL değişince kural otomatik tekrar uygulanır.
* **Öncelik**: `priority` alanı ile hangi CSS/JS’in önce uygulandığını kontrol edin.

---

## 📦 İçe/Dışa Aktarım

Options sayfasından:

* **Export**: Tüm ayarları JSON olarak indirir.
* **Import**: JSON yükleyerek ayarları geri alır.

---

## 🔒 Güvenlik Notları

* Uzaktan JS veya CSS dosyası yüklenmez.
* Yalnızca uzantı içi veya içe aktarılmış dosyalar kullanılır.
* MAIN dünyasında kod çalıştırırken dikkatli olun.
* Hassas sitelerde (banka, ödeme vb.) kural tanımlamayın veya blok listesi ekleyin.

---

## 📝 Örnek Kural

```json
{
  "id": "1234",
  "name": "Twitter Koyu Tema",
  "enabled": true,
  "pattern": "https://twitter.com/*",
  "world": "ISOLATED",
  "css": "body { background-color: #000; color:#ccc; } .promoted { display:none !important; }",
  "js": "console.log('Twitter kuralı aktif');"
}
```

---

Bu kuralları Options sayfasından ekleyebilir, düzenleyebilir veya JSON import/export özelliğini kullanarak topluca yönetebilirsiniz.

```

---

