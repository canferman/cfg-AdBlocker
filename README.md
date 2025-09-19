# cfg-AdBlocker

## 📝 README.md

**Site Tweaks (Local)**, yalnızca kendi bilgisayarınızda kullanmak üzere geliştirilmiş, Manifest V3 tabanlı bir Chrome eklentisidir.  
Belirli web sitelerine özel **CSS** ve **JS** ekleyebilir, görünümü kişiselleştirebilir, istenmeyen alanları gizleyebilir ve bazı işleri otomatikleştirebilirsiniz.

> ⚠️ Bu proje **kamu malıdır** (Unlicense). Hiçbir hak talep edilmez. Tamamen açık kaynak ve ücretsizdir.

---

## ✨ Özellikler

- **URL Deseni Bazlı Kural Sistemi**  
  Belirlediğiniz domain veya URL desenlerine özel CSS/JS ekleme.

- **Inline veya Dosya Tabanlı Kod Ekleme**  
  CSS/JS kodunu doğrudan girebilir ya da eklenti içindeki dosyalardan kullanabilirsiniz.

- **Yerel JS Dosyası İçe Aktarma**  
  Bilgisayarınızdan bir JS dosyasını içe aktararak ilgili sayfalara enjekte edin.

- **Popup Üzerinden Hızlı Düzenleme**  
  Aktif sekme için hızlı kural oluşturma ve anında uygulama.

- **Options Sayfası ile Yönetim**  
  Tüm kuralların listelenmesi, düzenlenmesi, import/export, blok listesi ve global ayarlar.

- **Context Menü ile “Öğeyi Gizle”**  
  Bir öğeye sağ tıklayarak CSS seçici oluşturup görünürlüğünü yönetme.

- **SPA Desteği**  
  URL değişimlerinde (pushState, hashchange) kuralların yeniden uygulanması.

- **SafeMode ve Loglama**  
  Test için yalnızca log atıp enjekte etmemeyi sağlayan mod.

---

## 🛠 Kurulum

1. Bu repoyu klonlayın veya ZIP olarak indirin.  
2. Chrome’da `chrome://extensions/` sayfasına gidin.  
3. Sağ üstte **Developer Mode**’u etkinleştirin.  
4. **Load unpacked** butonuna tıklayıp proje klasörünü seçin.  
5. Toolbar’daki simgeye tıklayarak popup’ı açın ve ayarlarınızı yapın.

---

## ⚙️ Kullanım

- **Popup’tan hızlı kural oluşturma**: Aktif sekmenin domain/URL’sine göre CSS/JS girin ve anında uygulayın.  
- **Options sayfası**: Tüm kuralları yönetir, JSON import/export, yerel JS dosyalarını içe aktarma ve global ayarları kontrol etme.  
- **Context Menü**: Sağ tıklayarak seçili öğe için CSS seçici üretir.  
- **Yerel JS dosyası**: `input[type=file]` veya File System Access API ile içe aktarılır, içerik eklentinin storage’ında saklanır.  

---

## 📂 Proje Yapısı

```

site-tweaks/
├─ manifest.json
├─ background.js
├─ content.js
├─ popup.html / popup.js
├─ options.html / options.js
├─ assets/ui.css
├─ icons/ (16/32/48/128 px)
├─ examples/example.css & example.js
├─ schema.json
├─ storage-migrations.js
├─ LICENSE
├─ README.md
├─ SECURITY.md
└─ RULES.md

```

---

## 🔒 İzinler

- `storage` – Kural ve ayarları saklamak için.  
- `scripting` – CSS/JS enjekte etmek için.  
- `activeTab` – Popup’tan aktif sekmeye kural uygulamak için.  
- `contextMenus` – Sağ tıklama menüsü oluşturmak için.  
- `host_permissions: <all_urls>` – Tüm sitelerde potansiyel olarak kural uygulamak için. (Her kural kendi desenine göre çalışır.)

---

## ⚠️ Bilinen Kısıtlar

- Chrome güvenlik politikası gereği **doğrudan disk yolu** kullanılamaz. JS dosyaları içe aktarılarak içerikleri eklentiye kaydedilir.  
- Uzaktan (http/https) JS veya CSS dosyaları yüklenmez; yalnızca eklenti içi veya içe aktarılmış dosyalar kullanılabilir.  
- MAIN dünyasında çalışan JS sayfanın global değişkenlerine erişebilir; güvenmediğiniz kodu bu modda çalıştırmayın.  

---

## 📜 Lisans

Bu proje **kamu malıdır**. [MIT](LICENSE) kapsamında yayınlanmıştır.  
İstediğiniz gibi kullanabilir, değiştirebilir ve dağıtabilirsiniz.

---

## 📝 Katkı

Kodunuzu fork edip PR açabilirsiniz. Ancak bu proje öncelikli olarak kişisel kullanım için yazılmıştır; stabilite garantisi verilmez.

---

## 🙏 Teşekkür

Bu proje kişisel ihtiyaçlardan doğmuştur ve benzer bir çözüm arayanlara ilham olması amacıyla açık kaynak olarak paylaşılmıştır.

